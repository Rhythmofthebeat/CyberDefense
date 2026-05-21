#!/usr/bin/env node
/**
 * Cyber Defense Command — Central Aggregation Server
 * Production-ready: login auth, rate limiting, CORS, graceful shutdown, TLS-ready
 */
import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import { createServer as createHttpServer } from 'http'
import { createServer as createHttpsServer } from 'https'
import { pollSnmpDevice, pollPingDevice } from './poller.js'
import { pollAllMDM } from './mdm-poller.js'
import { AutonomousAgent } from './autonomous-agent.js'
import ldap from 'ldapjs'
import OpenAI from 'openai'

// ── Minimal JWT (no external deps) ────────────────────────────────────────────
function signToken(payload, secret) {
  const header  = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body    = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig     = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${sig}`
}
function verifyToken(token, secret) {
  try {
    const [header, body, sig] = token.split('.')
    const expected = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
    if (sig !== expected) return null
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString())
    if (payload.exp && Date.now() > payload.exp) return null
    return payload
  } catch { return null }
}

// ── Password hashing (no external deps) ───────────────────────────────────────
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(password, salt, 100_000, 64, 'sha512').toString('hex')
  return `${salt}:${hash}`
}
function verifyPassword(password, stored) {
  const [salt] = stored.split(':')
  return hashPassword(password, salt) === stored
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, 'data')
const CONFIG_FILE = path.join(DATA_DIR, 'config.json')
const FLEET_FILE = path.join(DATA_DIR, 'fleet.json')

const PORT       = parseInt(process.env.PORT || '4001')
const TLS_CERT   = process.env.TLS_CERT
const TLS_KEY    = process.env.TLS_KEY
const ALLOWED_ORIGINS    = (process.env.ALLOWED_ORIGINS || '*').split(',')
const DEVICE_TIMEOUT_MS  = parseInt(process.env.DEVICE_TIMEOUT_MS || '60000')
const MAX_DEVICES        = parseInt(process.env.MAX_DEVICES || '500')
const SUSPICIOUS_PORTS   = new Set([22, 23, 445, 3389, 4444, 1337, 31337, 6666, 8888])
// Comma-separated list of allowed email domains, e.g. "agency.gov,contractor.mil"
// Empty = no restriction
const ALLOWED_DOMAINS    = (process.env.ALLOWED_DOMAINS || '').split(',').map(d => d.trim().toLowerCase()).filter(Boolean)

// ── Geo-IP & behavioral detection ─────────────────────────────────────────────

// Cache: ip → { country, countryCode, isp, proxy, tor, ts }
const geoCache = new Map()
const GEO_TTL  = 6 * 60 * 60 * 1000  // 6 hours

// High-risk country codes (customize as needed)
const HIGH_RISK_COUNTRIES = new Set([
  'CN','RU','KP','IR','SY','CU','VE','BY','MM','SD'
])

async function geoLookupBatch(ips) {
  const toFetch = ips.filter(ip => {
    if (!ip || ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('172.') || ip === '127.0.0.1') return false
    const cached = geoCache.get(ip)
    return !cached || Date.now() - cached.ts > GEO_TTL
  })
  if (!toFetch.length) return

  try {
    const res = await fetch('http://ip-api.com/batch?fields=query,country,countryCode,isp,proxy,hosting,tor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toFetch.slice(0, 100).map(ip => ({ query: ip }))),
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return
    const results = await res.json()
    for (const r of results) {
      if (r.query) geoCache.set(r.query, {
        country: r.country || 'Unknown', countryCode: r.countryCode || '??',
        isp: r.isp || '', proxy: !!r.proxy, hosting: !!r.hosting, tor: !!r.tor,
        highRisk: HIGH_RISK_COUNTRIES.has(r.countryCode),
        ts: Date.now(),
      })
    }
  } catch {}
}

// Beaconing detector: track connection timestamps per device→IP
// beacon[deviceId][ip] = [t1, t2, t3, ...]
const beaconStore = new Map()
const BEACON_WINDOW_MS  = 10 * 60 * 1000  // look at last 10 min
const BEACON_MIN_HITS   = 3               // min occurrences to flag
const BEACON_JITTER_PCT = 0.25            // allow 25% timing variance

function detectBeaconing(deviceId, connections) {
  const now = Date.now()
  if (!beaconStore.has(deviceId)) beaconStore.set(deviceId, new Map())
  const deviceBeacons = beaconStore.get(deviceId)

  for (const { ip } of connections) {
    if (!ip) continue
    if (!deviceBeacons.has(ip)) deviceBeacons.set(ip, [])
    const times = deviceBeacons.get(ip)
    times.push(now)
    // Keep only last 10 min
    const cutoff = now - BEACON_WINDOW_MS
    while (times.length && times[0] < cutoff) times.shift()
  }

  const beaconing = []
  for (const [ip, times] of deviceBeacons) {
    if (times.length < BEACON_MIN_HITS) continue
    // Calculate intervals between consecutive hits
    const intervals = []
    for (let i = 1; i < times.length; i++) intervals.push(times[i] - times[i - 1])
    if (!intervals.length) continue
    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length
    const variance = intervals.every(d => Math.abs(d - avg) / avg < BEACON_JITTER_PCT)
    if (variance && avg < BEACON_WINDOW_MS) {
      beaconing.push({ ip, hits: times.length, intervalSec: Math.round(avg / 1000) })
    }
  }
  return beaconing
}

// ── Data dir ───────────────────────────────────────────────────────────────────
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })

// ── Config / API key ───────────────────────────────────────────────────────────
let config
if (fs.existsSync(CONFIG_FILE)) {
  config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
} else {
  config = { apiKey: crypto.randomBytes(32).toString('hex'), jwtSecret: crypto.randomBytes(32).toString('hex') }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2))
}
if (!config.jwtSecret) {
  config.jwtSecret = crypto.randomBytes(32).toString('hex')
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2))
}

// ── LDAP helpers ──────────────────────────────────────────────────────────────
// RFC 4515 escaping for LDAP filter values — prevents LDAP injection
function escapeLdapFilter(value) {
  return String(value).replace(/[\\*()\x00]/g, (c) => {
    const hex = c.charCodeAt(0).toString(16).padStart(2, '0')
    return `\\${hex}`
  })
}

// ── LDAP / Active Directory ───────────────────────────────────────────────────
// config.ldap shape:
// { enabled, url, baseDN, bindDN, bindPassword, userFilter, roleAttr, defaultRole, adminGroup, operatorGroup }
// Example for AD:
//   url:         "ldap://dc.agency.gov"
//   baseDN:      "DC=agency,DC=gov"
//   bindDN:      "CN=svc-cdc,OU=ServiceAccounts,DC=agency,DC=gov"
//   bindPassword: "secret"
//   userFilter:  "(sAMAccountName={{username}})"   -- AD
//              or "(uid={{username}})"              -- OpenLDAP

function ldapAuth(username, password) {
  return new Promise((resolve) => {
    const ldapCfg = config.ldap
    if (!ldapCfg?.enabled || !ldapCfg?.url || !ldapCfg?.baseDN) return resolve(null)

    // 1. Bind as service account to search for user DN
    const client = ldap.createClient({ url: ldapCfg.url, timeout: 5000, connectTimeout: 5000 })
    client.on('error', () => { try { client.destroy() } catch {} resolve(null) })

    const filter = (ldapCfg.userFilter || '(sAMAccountName={{username}})').replace('{{username}}', escapeLdapFilter(username))

    client.bind(ldapCfg.bindDN, ldapCfg.bindPassword, (err) => {
      if (err) { client.destroy(); return resolve(null) }

      client.search(ldapCfg.baseDN, {
        scope: 'sub', filter, attributes: ['dn', 'mail', 'memberOf', ldapCfg.roleAttr || 'memberOf'],
      }, (err, searchRes) => {
        if (err) { client.destroy(); return resolve(null) }

        let userDN = null, userMail = null, userGroups = []
        searchRes.on('searchEntry', (entry) => {
          userDN = entry.dn.toString()
          const obj = entry.pojo?.attributes || []
          obj.forEach(a => {
            if (a.type === 'mail') userMail = a.values[0]
            if (a.type === 'memberOf') userGroups = a.values
          })
        })
        searchRes.on('end', () => {
          if (!userDN) { client.destroy(); return resolve(null) }

          // 2. Bind as the user to verify password
          const userClient = ldap.createClient({ url: ldapCfg.url, timeout: 5000, connectTimeout: 5000 })
          userClient.on('error', () => { try { userClient.destroy() } catch {}; client.destroy(); resolve(null) })
          userClient.bind(userDN, password, (err2) => {
            userClient.destroy(); client.destroy()
            if (err2) return resolve(null) // wrong password

            // 3. Determine role from group membership
            let role = ldapCfg.defaultRole || 'viewer'
            if (ldapCfg.adminGroup && userGroups.some(g => g.toLowerCase().includes(ldapCfg.adminGroup.toLowerCase()))) role = 'admin'
            else if (ldapCfg.operatorGroup && userGroups.some(g => g.toLowerCase().includes(ldapCfg.operatorGroup.toLowerCase()))) role = 'operator'

            resolve({ username, email: userMail || '', role, source: 'ldap' })
          })
        })
        searchRes.on('error', () => { client.destroy(); resolve(null) })
      })
    })
  })
}

// ── Users store ────────────────────────────────────────────────────────────────
const USERS_FILE = path.join(DATA_DIR, 'users.json')
const AUDIT_FILE = path.join(DATA_DIR, 'audit.log')
let users = {}
if (fs.existsSync(USERS_FILE)) {
  try { users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')) } catch {}
}
function saveUsers() { fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2)) }

// ── MDM store ──────────────────────────────────────────────────────────────────
const MDM_FILE    = path.join(DATA_DIR, 'mdm-settings.json')
const MDM_DEV_FILE= path.join(DATA_DIR, 'mdm-devices.json')
let mdmSettings   = { jamf: { enabled: false }, intune: { enabled: false } }
let mdmDevices    = []
if (fs.existsSync(MDM_FILE))     try { mdmSettings = JSON.parse(fs.readFileSync(MDM_FILE, 'utf8')) } catch {}
if (fs.existsSync(MDM_DEV_FILE)) try { mdmDevices  = JSON.parse(fs.readFileSync(MDM_DEV_FILE, 'utf8')) } catch {}
function saveMDMSettings() { fs.writeFileSync(MDM_FILE,     JSON.stringify(mdmSettings, null, 2)) }
function saveMDMDevices()  { fs.writeFileSync(MDM_DEV_FILE, JSON.stringify(mdmDevices,  null, 2)) }

async function syncMDM() {
  if (!mdmSettings.jamf?.enabled && !mdmSettings.intune?.enabled) return
  try {
    const { devices, errors } = await pollAllMDM(mdmSettings)
    if (errors.length) errors.forEach(e => console.warn(`  [MDM] ${e.source}: ${e.error}`))
    mdmDevices = devices
    saveMDMDevices()
  } catch (e) { console.warn('  [MDM] sync error:', e.message) }
}
syncMDM()
setInterval(syncMDM, 5 * 60 * 1000) // every 5 minutes
function auditLog(action, actor, target, meta = {}) {
  const entry = JSON.stringify({ ts: new Date().toISOString(), action, actor, target, ...meta }) + '\n'
  fs.appendFileSync(AUDIT_FILE, entry)
}

// Domain check helper
function isAllowedEmail(email) {
  if (!ALLOWED_DOMAINS.length) return true
  const domain = email?.split('@')[1]?.toLowerCase()
  return ALLOWED_DOMAINS.includes(domain)
}

// ── CLI: setup command to create first admin ──────────────────────────────────
if (process.argv[2] === 'setup') {
  const username = process.argv[3]
  const password = process.argv[4]
  const email    = process.argv[5] || ''
  if (!username || !password) {
    console.log('Usage: node server.js setup <username> <password> [email]')
    process.exit(1)
  }
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  users[username] = { username, email, password: hashPassword(password), role: 'admin', createdAt: Date.now(), active: true }
  saveUsers()
  console.log(`\n  ✓ Admin "${username}" created.`)
  console.log(`  Start the server: node server.js\n`)
  process.exit(0)
}

// ── Fleet store (agent-based devices) ────────────────────────────────────────
let fleet = {}
if (fs.existsSync(FLEET_FILE)) {
  try { fleet = JSON.parse(fs.readFileSync(FLEET_FILE, 'utf8')) } catch {}
}
function saveFleet() { fs.writeFileSync(FLEET_FILE, JSON.stringify(fleet, null, 2)) }
setInterval(saveFleet, 10_000)

// ── Autonomous agent ───────────────────────────────────────────────────────────
const autonomousAgent = new AutonomousAgent({
  fleet,
  execJob: async (deviceId, cmd, lang) => {
    const jobId = crypto.randomBytes(6).toString('hex')
    execJobs?.set(jobId, { id: jobId, deviceId, cmd, language: lang, status: 'pending', createdAt: Date.now() })
    return jobId
  },
  auditLog,
  addAlert: (msg) => console.log(`  [ALERT] ${msg}`),
})

// ── Network devices store (SNMP + ping) ───────────────────────────────────────
const NET_DEVICES_FILE = path.join(DATA_DIR, 'network-devices.json')
let netDevices = {}       // config: { id, name, ip, type, mode, community, snmpVersion }
let netDeviceStats = {}   // live stats from polling

if (fs.existsSync(NET_DEVICES_FILE)) {
  try { netDevices = JSON.parse(fs.readFileSync(NET_DEVICES_FILE, 'utf8')) } catch {}
}
function saveNetDevices() { fs.writeFileSync(NET_DEVICES_FILE, JSON.stringify(netDevices, null, 2)) }

// Polling loop — poll all network devices every 30s
async function pollAllNetDevices() {
  for (const device of Object.values(netDevices)) {
    try {
      const result = device.mode === 'snmp'
        ? await pollSnmpDevice(device)
        : await pollPingDevice(device)
      netDeviceStats[device.id] = { ...result, lastSeen: Date.now(), id: device.id, name: device.name, deviceType: device.type }
    } catch {
      netDeviceStats[device.id] = { online: false, lastSeen: Date.now(), id: device.id, name: device.name, deviceType: device.type }
    }
  }
}
// Start polling loop (stagger start to not block boot)
setTimeout(() => { pollAllNetDevices(); setInterval(pollAllNetDevices, 30_000) }, 5_000)

// ── Rate limiter (simple in-memory) ──────────────────────────────────────────
const rateLimits = new Map()
function rateLimit(windowMs, max) {
  return (req, res, next) => {
    const key = req.ip
    const now = Date.now()
    const entry = rateLimits.get(key) || { count: 0, start: now }
    if (now - entry.start > windowMs) { entry.count = 0; entry.start = now }
    entry.count++
    rateLimits.set(key, entry)
    if (entry.count > max) return res.status(429).json({ error: 'Too many requests' })
    next()
  }
}
setInterval(() => {
  const cutoff = Date.now() - 120_000
  for (const [k, v] of rateLimits) if (v.start < cutoff) rateLimits.delete(k)
}, 60_000)

// ── Express ───────────────────────────────────────────────────────────────────
const app = express()

app.use(cors({
  origin: ALLOWED_ORIGINS.includes('*') ? '*' : ALLOWED_ORIGINS,
  methods: ['GET', 'POST'],
}))
app.use(express.json({ limit: '512kb' }))
app.set('trust proxy', 1)

// Security headers
app.use((_, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('X-XSS-Protection', '1; mode=block')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",   // unsafe-inline needed by Monaco editor
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "connect-src 'self'",
      "img-src 'self' data:",
      "frame-ancestors 'none'",
    ].join('; ')
  )
  // HSTS: only send over TLS (Caddy/nginx will handle this in production, but set it here too)
  if (TLS_CERT && TLS_KEY) {
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
  }
  next()
})

// Auth middleware — accepts either dashboard JWT or agent API key
function requireAuth(req, res, next) {
  if (req.path === '/health') return next()
  const raw = req.headers.authorization?.replace('Bearer ', '') || req.query.apiKey
  if (!raw) return res.status(401).json({ error: 'Unauthorized' })
  // Agent API key
  if (raw === config.apiKey) return next()
  // Dashboard JWT
  const payload = verifyToken(raw, config.jwtSecret)
  if (!payload) return res.status(401).json({ error: 'Unauthorized' })
  req.user = payload
  next()
}
app.use('/api', requireAuth)

// ── Auth routes ───────────────────────────────────────────────────────────────

app.post('/auth/login', rateLimit(60_000, 30), async (req, res) => {
  const { username, password } = req.body || {}
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' })

  // Reject login attempts when no users exist — run "node server.js setup <user> <pass>" first
  if (Object.keys(users).length === 0 && !config.ldap?.enabled) {
    return res.status(503).json({ error: 'No users configured. Run: node server.js setup <username> <password>' })
  }

  // ── Try LDAP/AD first if configured ──────────────────────────────────────
  if (config.ldap?.enabled) {
    try {
      const ldapUser = await ldapAuth(username, password)
      if (ldapUser) {
        const token = signToken(
          { username: ldapUser.username, role: ldapUser.role, source: 'ldap', exp: Date.now() + 8 * 60 * 60 * 1000 },
          config.jwtSecret
        )
        auditLog('LOGIN_SUCCESS_LDAP', username, username, { ip: req.ip, role: ldapUser.role })
        return res.json({ token, username: ldapUser.username, role: ldapUser.role, source: 'ldap' })
      }
    } catch (e) {
      console.error('[LDAP] Error:', e.message)
    }
    // If LDAP is enabled but auth failed, only allow local admin accounts as fallback
    const user = users[username]
    if (!user || !user.active || user.role !== 'admin') {
      auditLog('LOGIN_FAILED', 'unknown', username, { reason: 'ldap_failed', ip: req.ip })
      return res.status(401).json({ error: 'Invalid credentials' })
    }
    if (!verifyPassword(password, user.password)) {
      auditLog('LOGIN_FAILED', username, username, { reason: 'wrong_password', ip: req.ip })
      return res.status(401).json({ error: 'Invalid credentials' })
    }
    const token = signToken(
      { username: user.username, role: user.role, exp: Date.now() + 8 * 60 * 60 * 1000 },
      config.jwtSecret
    )
    auditLog('LOGIN_SUCCESS_LOCAL', username, username, { ip: req.ip })
    return res.json({ token, username: user.username, role: user.role })
  }

  // ── Local auth (no LDAP configured) ──────────────────────────────────────
  const user = users[username]
  if (!user || !user.active) {
    auditLog('LOGIN_FAILED', 'unknown', username, { reason: 'user_not_found_or_inactive', ip: req.ip })
    return res.status(401).json({ error: 'Invalid credentials' })
  }
  if (!verifyPassword(password, user.password)) {
    auditLog('LOGIN_FAILED', username, username, { reason: 'wrong_password', ip: req.ip })
    return res.status(401).json({ error: 'Invalid credentials' })
  }
  const token = signToken(
    { username: user.username, role: user.role, exp: Date.now() + 8 * 60 * 60 * 1000 },
    config.jwtSecret
  )
  auditLog('LOGIN_SUCCESS', username, username, { ip: req.ip })
  res.json({ token, username: user.username, role: user.role })
})

// ── User management (admin only) ──────────────────────────────────────────────

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin required' })
  next()
}

function requireOperator(req, res, next) {
  if (!['admin', 'operator'].includes(req.user?.role)) {
    return res.status(403).json({ error: 'Operator or Admin role required' })
  }
  next()
}

// List all users
app.get('/api/users', requireAdmin, (_, res) => {
  const list = Object.values(users).map(u => ({
    username: u.username, email: u.email || '', role: u.role,
    active: u.active !== false, createdAt: u.createdAt,
  }))
  res.json(list)
})

// Invite / create user (admin only)
app.post('/api/users', requireAdmin, (req, res) => {
  const { username, email, password, role = 'viewer' } = req.body || {}
  if (!username || !password) return res.status(400).json({ error: 'username and password required' })
  if (users[username]) return res.status(409).json({ error: 'User already exists' })

  // Enforce domain restriction on new users
  if (email && !isAllowedEmail(email)) {
    return res.status(403).json({
      error: `Email domain not authorized. Allowed: ${ALLOWED_DOMAINS.join(', ') || 'any'}`,
    })
  }

  const validRoles = ['admin', 'operator', 'viewer']
  if (!validRoles.includes(role)) return res.status(400).json({ error: 'Invalid role' })

  users[username] = { username, email: email || '', password: hashPassword(password), role, createdAt: Date.now(), active: true }
  saveUsers()
  auditLog('USER_CREATED', req.user.username, username, { email, role })
  res.json({ ok: true, username, role })
})

// Deactivate / reactivate user
app.patch('/api/users/:username', requireAdmin, (req, res) => {
  const { username } = req.params
  if (!users[username]) return res.status(404).json({ error: 'User not found' })
  if (username === req.user.username) return res.status(400).json({ error: 'Cannot modify yourself' })
  const { active, role } = req.body
  if (active !== undefined) users[username].active = !!active
  if (role !== undefined) {
    const validRoles = ['admin', 'operator', 'viewer']
    if (!validRoles.includes(role)) return res.status(400).json({ error: 'Invalid role' })
    users[username].role = role
  }
  saveUsers()
  auditLog('USER_UPDATED', req.user.username, username, { active, role })
  res.json({ ok: true })
})

// Delete user
app.delete('/api/users/:username', requireAdmin, (req, res) => {
  const { username } = req.params
  if (!users[username]) return res.status(404).json({ error: 'User not found' })
  if (username === req.user.username) return res.status(400).json({ error: 'Cannot delete yourself' })
  delete users[username]
  saveUsers()
  auditLog('USER_DELETED', req.user.username, username)
  res.json({ ok: true })
})

// Audit log (admin only, last 200 entries)
app.get('/api/audit', requireAdmin, (_, res) => {
  try {
    const lines = fs.readFileSync(AUDIT_FILE, 'utf8').trim().split('\n').filter(Boolean)
    const entries = lines.slice(-200).reverse().map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
    res.json(entries)
  } catch { res.json([]) }
})

// Allowed domains config (admin only)
app.get('/api/config/domains', requireAdmin, (_, res) => {
  res.json({ domains: ALLOWED_DOMAINS })
})

// ── LDAP / AD config (admin only) ─────────────────────────────────────────────
app.get('/api/config/ldap', requireAdmin, (_, res) => {
  const ldapCfg = config.ldap || {}
  // Never return the bind password to the client
  res.json({ ...ldapCfg, bindPassword: ldapCfg.bindPassword ? '••••••••' : '' })
})

app.post('/api/config/ldap', requireAdmin, (req, res) => {
  const { enabled, url, baseDN, bindDN, bindPassword, userFilter, defaultRole, adminGroup, operatorGroup } = req.body || {}
  config.ldap = {
    enabled: !!enabled,
    url: url || '',
    baseDN: baseDN || '',
    bindDN: bindDN || '',
    // Don't overwrite password if placeholder sent
    bindPassword: bindPassword && bindPassword !== '••••••••' ? bindPassword : (config.ldap?.bindPassword || ''),
    userFilter: userFilter || '(sAMAccountName={{username}})',
    defaultRole: ['admin','operator','viewer'].includes(defaultRole) ? defaultRole : 'viewer',
    adminGroup: adminGroup || '',
    operatorGroup: operatorGroup || '',
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2))
  auditLog('LDAP_CONFIG_UPDATED', req.user.username, 'ldap', { enabled: config.ldap.enabled, url })
  res.json({ ok: true, enabled: config.ldap.enabled })
})

// Test LDAP connection (admin only) — binds as service account only
app.post('/api/config/ldap/test', requireAdmin, async (req, res) => {
  const ldapCfg = config.ldap
  if (!ldapCfg?.url || !ldapCfg?.baseDN) return res.status(400).json({ error: 'LDAP not configured' })
  try {
    await new Promise((resolve, reject) => {
      const client = ldap.createClient({ url: ldapCfg.url, timeout: 5000, connectTimeout: 5000 })
      client.on('error', (e) => { try { client.destroy() } catch {} reject(e) })
      client.bind(ldapCfg.bindDN, ldapCfg.bindPassword, (err) => {
        client.destroy()
        if (err) reject(err)
        else resolve()
      })
    })
    res.json({ ok: true, message: 'Connected and bound successfully' })
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message })
  }
})

// ── Network device routes ─────────────────────────────────────────────────────

// List all network devices with live stats
app.get('/api/network-devices', requireAuth, (_, res) => {
  const devices = Object.values(netDevices).map(d => ({
    ...d,
    ...(netDeviceStats[d.id] || { online: false }),
  }))
  res.json(devices)
})

// Add a network device
app.post('/api/network-devices', requireAdmin, (req, res) => {
  const { name, ip, type = 'unknown', mode = 'ping', community = 'public', snmpVersion = '2c' } = req.body || {}
  if (!name || !ip) return res.status(400).json({ error: 'name and ip required' })
  const id = `net-${crypto.randomBytes(4).toString('hex')}`
  netDevices[id] = { id, name, ip, type, mode, community, snmpVersion, addedAt: Date.now() }
  saveNetDevices()
  auditLog('NET_DEVICE_ADDED', req.user?.username || 'system', name, { ip, type, mode })
  // Poll immediately
  const device = netDevices[id]
  ;(device.mode === 'snmp' ? pollSnmpDevice(device) : Promise.resolve(pollPingDevice(device)))
    .then(result => { netDeviceStats[id] = { ...result, lastSeen: Date.now(), id, name, deviceType: type } })
    .catch(() => {})
  res.json({ ok: true, id })
})

// Update a network device
app.patch('/api/network-devices/:id', requireAdmin, (req, res) => {
  const { id } = req.params
  if (!netDevices[id]) return res.status(404).json({ error: 'Device not found' })
  Object.assign(netDevices[id], req.body)
  saveNetDevices()
  res.json({ ok: true })
})

// Remove a network device
app.delete('/api/network-devices/:id', requireAdmin, (req, res) => {
  const { id } = req.params
  if (!netDevices[id]) return res.status(404).json({ error: 'Device not found' })
  const name = netDevices[id].name
  delete netDevices[id]
  delete netDeviceStats[id]
  saveNetDevices()
  auditLog('NET_DEVICE_REMOVED', req.user?.username || 'system', name)
  res.json({ ok: true })
})

// Force re-poll a specific device
app.post('/api/network-devices/:id/poll', (req, res) => {
  const device = netDevices[req.params.id]
  if (!device) return res.status(404).json({ error: 'Device not found' })
  const poll = device.mode === 'snmp' ? pollSnmpDevice(device) : pollPingDevice(device)
  poll.then(result => {
    netDeviceStats[device.id] = { ...result, lastSeen: Date.now(), id: device.id, name: device.name, deviceType: device.type }
    res.json(netDeviceStats[device.id])
  }).catch(() => res.json({ online: false }))
})

// ── Routes ────────────────────────────────────────────────────────────────────

app.delete('/api/fleet/:id', requireAuth, (req, res) => {
  const { id } = req.params
  if (!fleet[id]) return res.status(404).json({ error: 'Device not found' })
  const name = fleet[id].name
  delete fleet[id]
  saveFleet()
  auditLog('FLEET_DEVICE_REMOVED', req.user?.username || 'system', name)
  res.json({ ok: true })
})

app.get('/api/health', (_, res) => res.json({
  ok: true, version: '1.0.0', devices: Object.keys(fleet).length,
  uptime: process.uptime(),
}))

app.post('/api/heartbeat', rateLimit(60_000, 10), async (req, res) => {
  const { deviceId, name, sys, net, procs } = req.body
  if (!deviceId || typeof deviceId !== 'string') return res.status(400).json({ error: 'deviceId required' })
  if (deviceId.length > 64) return res.status(400).json({ error: 'deviceId too long' })
  if (Object.keys(fleet).length >= MAX_DEVICES && !fleet[deviceId]) {
    return res.status(507).json({ error: 'Fleet capacity reached' })
  }

  const connections = Array.isArray(net) ? net.slice(0, 100) : []

  // Geo-IP enrich (fire-and-forget, fills cache for next /api/fleet call)
  const uniqueIps = [...new Set(connections.map(c => c.ip).filter(Boolean))]
  geoLookupBatch(uniqueIps).catch(() => {})

  // Beaconing detection
  const beaconing = detectBeaconing(deviceId, connections)

  fleet[deviceId] = {
    id: deviceId,
    name: String(name || deviceId).substring(0, 64),
    sys: sys || null,
    net: connections,
    procs: Array.isArray(procs) ? procs.slice(0, 20) : [],
    lastSeen: Date.now(),
    online: true,
    beaconing: beaconing.length ? beaconing : undefined,
  }

  // Fire autonomous agent (non-blocking)
  if (beaconing.length) {
    const threats = beaconing.map(b => ({ type: { id: 'apt', label: 'APT/Beaconing' }, severity: 'HIGH', conn: { ip: b.ip } }))
    autonomousAgent.onThreats(deviceId, threats).catch(() => {})
  }

  res.json({ ok: true })
})

app.get('/api/fleet', rateLimit(10_000, 120), (_, res) => {
  const now = Date.now()
  const agentDevices = Object.values(fleet).map(d => {
    // Enrich each connection with cached geo data
    const enrichedNet = (d.net || []).map(c => {
      const geo = geoCache.get(c.ip)
      return geo ? { ...c, geo } : c
    })

    // Compute per-device threat intel flags
    const geoThreats = enrichedNet.filter(c => c.geo?.highRisk || c.geo?.tor || c.geo?.proxy)
    const beaconingIps = (d.beaconing || []).map(b => b.ip)

    return {
      ...d,
      net: enrichedNet,
      online: (now - d.lastSeen) < DEVICE_TIMEOUT_MS,
      deviceCategory: 'agent',
      threatIntel: {
        highRiskGeo:  geoThreats.filter(c => c.geo?.highRisk).length,
        torConnections: geoThreats.filter(c => c.geo?.tor).length,
        proxyConnections: geoThreats.filter(c => c.geo?.proxy).length,
        beaconingIps,
      },
    }
  })
  const networkDevices = Object.values(netDevices).map(d => ({
    ...d,
    ...(netDeviceStats[d.id] || { online: false }),
    deviceCategory: 'network',
  }))
  const devices = [...agentDevices, ...networkDevices]
  res.json({ devices, total: devices.length, online: devices.filter(d => d.online).length })
})

app.get('/api/fleet/summary', rateLimit(5_000, 60), (_, res) => {
  const now = Date.now()
  const all = Object.values(fleet)
  const online = all.filter(d => (now - d.lastSeen) < DEVICE_TIMEOUT_MS)
  const suspiciousConns = online.reduce((s, d) =>
    s + (d.net || []).filter(c => SUSPICIOUS_PORTS.has(c.port)).length, 0)
  const highCpu = online.filter(d => (d.sys?.cpu?.usage || 0) > 80).length
  const avgCpu = online.length
    ? (online.reduce((s, d) => s + (d.sys?.cpu?.usage || 0), 0) / online.length).toFixed(1)
    : 0

  // New threat intel signals
  const highRiskGeo    = online.reduce((s, d) => s + (d.net || []).filter(c => geoCache.get(c.ip)?.highRisk).length, 0)
  const torConnections = online.reduce((s, d) => s + (d.net || []).filter(c => geoCache.get(c.ip)?.tor).length, 0)
  const proxyConns     = online.reduce((s, d) => s + (d.net || []).filter(c => geoCache.get(c.ip)?.proxy).length, 0)
  const beaconingDevices = online.filter(d => d.beaconing?.length).length

  const threatScore = suspiciousConns * 2 + highRiskGeo + torConnections * 3 + beaconingDevices * 4

  res.json({
    total: all.length, online: online.length, offline: all.length - online.length,
    avgCpu, highCpuDevices: highCpu,
    totalConnections: online.reduce((s, d) => s + (d.net?.length || 0), 0),
    suspiciousConnections: suspiciousConns,
    highRiskGeoConnections: highRiskGeo,
    torConnections,
    proxyConnections: proxyConns,
    beaconingDevices,
    alertLevel: threatScore > 10 ? 'SEVERE' : threatScore > 5 ? 'HIGH' : threatScore > 1 ? 'ELEVATED' : 'GUARDED',
  })
})

// ── Download routes (deploy scripts + binaries) ───────────────────────────────
const DEPLOY_DIR = path.join(__dirname, 'deploy')
const BIN_DIR    = path.join(__dirname, '..', 'dist')

// Install scripts — pre-fill server URL and API key on the fly
app.get('/download/install.sh', (req, res) => {
  const scriptPath = path.join(__dirname, 'scripts', 'install-linux.sh')
  const fallback   = path.join(__dirname, 'scripts', 'install-macos.sh')
  const src = fs.existsSync(scriptPath) ? scriptPath : fallback
  if (!fs.existsSync(src)) return res.status(404).send('Not found')
  const serverUrl  = `${req.protocol}://${req.hostname}:${PORT}`
  const script = fs.readFileSync(src, 'utf8')
    .replace(/http:\/\/YOUR_SERVER(_IP)?:\d+/g, serverUrl)
    .replace(/REPLACE_WITH_API_KEY/g, config.apiKey)
  res.setHeader('Content-Type', 'text/plain')
  res.send(script)
})

app.get('/download/install-macos.sh', (req, res) => {
  const src = path.join(__dirname, 'scripts', 'install-macos.sh')
  if (!fs.existsSync(src)) return res.status(404).send('Not found')
  const serverUrl = `${req.protocol}://${req.hostname}:${PORT}`
  const script = fs.readFileSync(src, 'utf8')
    .replace(/http:\/\/YOUR(_SERVER)?(_IP)?:\d+/g, serverUrl)
    .replace(/REPLACE_WITH_API_KEY/g, config.apiKey)
  res.setHeader('Content-Type', 'text/plain')
  res.send(script)
})

app.get('/download/install-linux.sh', (req, res) => {
  const src = path.join(__dirname, 'scripts', 'install-linux.sh')
  if (!fs.existsSync(src)) return res.status(404).send('Not found')
  const serverUrl = `${req.protocol}://${req.hostname}:${PORT}`
  const script = fs.readFileSync(src, 'utf8')
    .replace(/http:\/\/YOUR(_SERVER)?(_IP)?:\d+/g, serverUrl)
    .replace(/REPLACE_WITH_API_KEY/g, config.apiKey)
  res.setHeader('Content-Type', 'text/plain')
  res.send(script)
})

app.get('/download/install-windows.ps1', (req, res) => {
  const src = path.join(__dirname, 'scripts', 'install-windows.ps1')
  if (!fs.existsSync(src)) return res.status(404).send('Not found')
  const serverUrl = `${req.protocol}://${req.hostname}:${PORT}`
  const script = fs.readFileSync(src, 'utf8')
    .replace(/http:\/\/YOUR(_SERVER)?(_IP)?:\d+/g, serverUrl)
    .replace(/REPLACE_WITH_API_KEY/g, config.apiKey)
  res.setHeader('Content-Type', 'text/plain')
  res.send(script)
})

// Ansible playbook
app.get('/download/deploy-ansible.yml', (req, res) => {
  const src = path.join(DEPLOY_DIR, 'ansible', 'deploy-agent.yml')
  if (!fs.existsSync(src)) return res.status(404).send('Not found')
  const serverUrl = `${req.protocol}://${req.hostname}:${PORT}`
  const content = fs.readFileSync(src, 'utf8')
    .replace(/http:\/\/REPLACE_WITH_SERVER_IP:\d+/g, serverUrl)
    .replace(/REPLACE_WITH_API_KEY/g, config.apiKey)
  res.setHeader('Content-Type', 'text/plain')
  res.setHeader('Content-Disposition', 'attachment; filename="deploy-agent.yml"')
  res.send(content)
})

// Jamf script
app.get('/download/jamf-install.sh', (req, res) => {
  const src = path.join(DEPLOY_DIR, 'jamf', 'install-agent.sh')
  if (!fs.existsSync(src)) return res.status(404).send('Not found')
  const serverUrl = `${req.protocol}://${req.hostname}:${PORT}`
  const content = fs.readFileSync(src, 'utf8')
    .replace(/http:\/\/REPLACE_WITH_SERVER:\d+/g, serverUrl)
    .replace(/REPLACE_WITH_API_KEY/g, config.apiKey)
  res.setHeader('Content-Type', 'text/plain')
  res.setHeader('Content-Disposition', 'attachment; filename="jamf-install.sh"')
  res.send(content)
})

// Intune script
app.get('/download/intune-install.ps1', (req, res) => {
  const src = path.join(DEPLOY_DIR, 'intune', 'Install-CyberDefenseAgent.ps1')
  if (!fs.existsSync(src)) return res.status(404).send('Not found')
  const serverUrl = `${req.protocol}://${req.hostname}:${PORT}`
  const content = fs.readFileSync(src, 'utf8')
    .replace(/http:\/\/REPLACE_WITH_SERVER:\d+/g, serverUrl)
    .replace(/REPLACE_WITH_API_KEY/g, config.apiKey)
  res.setHeader('Content-Type', 'text/plain')
  res.setHeader('Content-Disposition', 'attachment; filename="Install-CyberDefenseAgent.ps1"')
  res.send(content)
})

// ── Autonomous agent endpoints ────────────────────────────────────────────────
app.get('/api/autonomous/status', requireAuth, (req, res) => {
  res.json({ enabled: autonomousAgent.enabled, rules: autonomousAgent.getRules() })
})

app.post('/api/autonomous/toggle', requireAuth, requireAdmin, (req, res) => {
  autonomousAgent.setEnabled(!autonomousAgent.enabled)
  auditLog('AUTONOMOUS_TOGGLED', req.user.username, 'system', { enabled: autonomousAgent.enabled })
  res.json({ enabled: autonomousAgent.enabled })
})

app.post('/api/autonomous/rules', requireAuth, requireAdmin, (req, res) => {
  autonomousAgent.setRules(req.body.rules)
  res.json({ ok: true })
})

app.get('/api/autonomous/log', requireAuth, (req, res) => {
  res.json(autonomousAgent.getLog())
})

// ── MDM endpoints ─────────────────────────────────────────────────────────────
app.get('/api/mdm/devices', requireAuth, (req, res) => {
  res.json(mdmDevices)
})

app.get('/api/mdm/settings', requireAuth, requireAdmin, (req, res) => {
  // Strip passwords before sending
  const safe = JSON.parse(JSON.stringify(mdmSettings))
  if (safe.jamf?.password)      safe.jamf.password      = '••••••••'
  if (safe.intune?.clientSecret) safe.intune.clientSecret = '••••••••'
  res.json(safe)
})

app.post('/api/mdm/settings', requireAuth, requireAdmin, (req, res) => {
  const { jamf, intune } = req.body || {}
  if (jamf) {
    mdmSettings.jamf = {
      enabled:  !!jamf.enabled,
      url:      jamf.url?.replace(/\/$/, '') || '',
      username: jamf.username || '',
      password: jamf.password && jamf.password !== '••••••••' ? jamf.password : (mdmSettings.jamf?.password || ''),
    }
  }
  if (intune) {
    mdmSettings.intune = {
      enabled:      !!intune.enabled,
      tenantId:     intune.tenantId || '',
      clientId:     intune.clientId || '',
      clientSecret: intune.clientSecret && intune.clientSecret !== '••••••••' ? intune.clientSecret : (mdmSettings.intune?.clientSecret || ''),
    }
  }
  saveMDMSettings()
  auditLog('mdm_settings_updated', req.user.username, 'mdm')
  syncMDM()
  res.json({ ok: true })
})

app.post('/api/mdm/sync', requireAuth, requireAdmin, async (req, res) => {
  await syncMDM()
  res.json({ ok: true, count: mdmDevices.length })
})

// Agent binaries (served from dist/)
const BINARIES = {
  'cyber-defense-agent-darwin-arm64': 'application/octet-stream',
  'cyber-defense-agent-darwin-x64':   'application/octet-stream',
  'cyber-defense-agent-linux-x64':    'application/octet-stream',
  'cyber-defense-agent-win32-x64.exe':'application/octet-stream',
}
app.get('/download/:file', (req, res) => {
  const file = req.params.file
  if (!BINARIES[file]) return res.status(404).json({ error: 'Not found' })
  const filePath = path.join(BIN_DIR, file)
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Binary not built yet. Run: npm run build:binary' })
  res.setHeader('Content-Disposition', `attachment; filename="${file}"`)
  res.sendFile(filePath)
})

// ── Remote exec jobs ──────────────────────────────────────────────────────────
// In-memory job store — survives only for the process lifetime (10 min TTL per job)
const execJobs = new Map() // jobId → job

// Dashboard: create a job for a specific device
app.post('/api/fleet/:deviceId/exec', requireAuth, requireOperator, (req, res) => {
  const { deviceId } = req.params
  const device = fleet[deviceId]
  if (!device) return res.status(404).json({ error: 'Device not found' })
  if ((Date.now() - device.lastSeen) > DEVICE_TIMEOUT_MS) {
    return res.status(400).json({ error: 'Device is offline' })
  }

  const { script, language = 'bash', threatId } = req.body || {}
  if (!script?.trim()) return res.status(400).json({ error: 'script required' })
  if (script.length > 64_000) return res.status(400).json({ error: 'Script too large (max 64KB)' })

  const ALLOWED_LANGS = ['python', 'bash', 'powershell', 'javascript']
  if (!ALLOWED_LANGS.includes(language)) {
    return res.status(400).json({ error: `Language "${language}" is not executable. Use: ${ALLOWED_LANGS.join(', ')}` })
  }

  const jobId = crypto.randomBytes(8).toString('hex')
  const job = {
    id: jobId, deviceId,
    script, language,
    threatId: threatId || null,
    createdAt: Date.now(),
    createdBy: req.user?.username || 'system',
    status: 'pending',  // pending → running → done | error
    output: null, exitCode: null,
    startedAt: null, finishedAt: null,
  }
  execJobs.set(jobId, job)
  // Auto-expire after 10 minutes
  setTimeout(() => execJobs.delete(jobId), 10 * 60 * 1000)

  auditLog('EXEC_JOB_QUEUED', req.user?.username || 'system', deviceId, { jobId, language, threatId })
  console.log(`  [EXEC] Job ${jobId} queued → ${device.name} (${language})`)
  res.json({ ok: true, jobId })
})

// Agent: poll for pending jobs (API key only)
app.get('/api/fleet/:deviceId/jobs/pending', (req, res) => {
  const raw = req.headers.authorization?.replace('Bearer ', '')
  if (raw !== config.apiKey) return res.status(401).json({ error: 'Unauthorized' })

  const { deviceId } = req.params
  const pending = [...execJobs.values()].filter(j => j.deviceId === deviceId && j.status === 'pending')
  for (const job of pending) { job.status = 'running'; job.startedAt = Date.now() }
  res.json(pending)
})

// Agent: post execution result
app.post('/api/fleet/:deviceId/jobs/:jobId/result', (req, res) => {
  const raw = req.headers.authorization?.replace('Bearer ', '')
  if (raw !== config.apiKey) return res.status(401).json({ error: 'Unauthorized' })

  const job = execJobs.get(req.params.jobId)
  if (!job) return res.status(404).json({ error: 'Job not found or expired' })

  const { output = '', exitCode = 0, error } = req.body || {}
  job.status     = error ? 'error' : 'done'
  job.output     = (output + (error ? `\nERROR: ${error}` : '')).substring(0, 50_000)
  job.exitCode   = exitCode
  job.finishedAt = Date.now()

  auditLog('EXEC_JOB_RESULT', 'agent', job.deviceId, { jobId: job.id, exitCode: job.exitCode, status: job.status })
  console.log(`  [EXEC] Job ${job.id} ${job.status} (exit ${job.exitCode}) on ${fleet[job.deviceId]?.name || job.deviceId}`)
  res.json({ ok: true })
})

// Dashboard: poll job status
app.get('/api/jobs/:jobId', requireAuth, (req, res) => {
  const job = execJobs.get(req.params.jobId)
  if (!job) return res.status(404).json({ error: 'Job not found or expired' })
  res.json(job)
})

// ── AI chat endpoint (SSE streaming) ─────────────────────────────────────────

app.post('/api/chat', rateLimit(60_000, 20), async (req, res) => {
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: 'AI chat requires OPENAI_API_KEY to be set on the server' })
  }
  const { message } = req.body || {}
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message required' })
  }
  if (message.length > 8000) return res.status(400).json({ error: 'Message too long (max 8000 chars)' })

  const now = Date.now()
  const allDevices = Object.values(fleet)
  const online = allDevices.filter(d => (now - d.lastSeen) < DEVICE_TIMEOUT_MS)
  const suspicious = online.filter(d => (d.net || []).some(c => SUSPICIOUS_PORTS.has(c.port)))
  const highCpu = online.filter(d => (d.sys?.cpu?.usage || 0) > 80)

  let recentAlerts = []
  try {
    const lines = fs.readFileSync(AUDIT_FILE, 'utf8').trim().split('\n').filter(Boolean)
    recentAlerts = lines.slice(-30)
      .map(l => { try { return JSON.parse(l) } catch { return null } })
      .filter(e => e && ['AI_THREAT_ASSESSMENT', 'AI_DEVICE_FLAGGED'].includes(e.action))
      .slice(-5)
      .map(e => `[${e.ts}] ${e.action}${e.threatLevel ? ' ' + e.threatLevel : ''}: ${e.summary || ''}`)
  } catch {}

  const systemPrompt = `You are an elite AI cybersecurity analyst embedded in a government threat operations center. You have deep expertise in threat intelligence, incident response, malware analysis, APT groups, network security, SIEM operations, CVE analysis, vulnerability management, and incident response script writing.

Fleet state (${new Date(now).toISOString()}):
- Devices: ${allDevices.length} total | ${online.length} online | ${allDevices.length - online.length} offline
- Suspicious connections: ${suspicious.length} device(s)${suspicious.length ? ` (${suspicious.slice(0, 3).map(d => d.name).join(', ')})` : ''}
- High CPU (>80%): ${highCpu.length} device(s)${highCpu.length ? ` (${highCpu.slice(0, 3).map(d => `${d.name} ${d.sys?.cpu?.usage}%`).join(', ')})` : ''}${recentAlerts.length ? `\n\nRecent threat assessments:\n${recentAlerts.join('\n')}` : ''}

Be concise, technical, and actionable. For code requests, return only raw code with no markdown fences.`

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('X-Accel-Buffering', 'no')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const stream = await openai.chat.completions.create({
      model: 'gpt-4o',
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message.trim() },
      ],
    })

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || ''
      if (delta) res.write(`data: ${JSON.stringify({ delta })}\n\n`)
    }

    auditLog('AI_CHAT', req.user?.username || 'unknown', 'chat', { q: message.trim().slice(0, 100) })
    res.write('data: [DONE]\n\n')
    res.end()
  } catch (e) {
    console.error('[CHAT]', e.message)
    res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`)
    res.end()
  }
})

// ── Serve built dashboard ─────────────────────────────────────────────────────
const DIST = fs.existsSync(path.join(__dirname, 'dist'))
  ? path.join(__dirname, 'dist')
  : path.join(__dirname, '..', 'dist')
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST, { maxAge: '1h' }))
  app.get('*', (_, res) => res.sendFile(path.join(DIST, 'index.html')))
}

// ── Start ─────────────────────────────────────────────────────────────────────
let server
if (TLS_CERT && TLS_KEY && fs.existsSync(TLS_CERT) && fs.existsSync(TLS_KEY)) {
  server = createHttpsServer({ cert: fs.readFileSync(TLS_CERT), key: fs.readFileSync(TLS_KEY) }, app)
  console.log('  TLS enabled')
} else {
  server = createHttpServer(app)
}

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n  ╔══════════════════════════════════════════════════════╗')
  console.log('  ║       CYBER DEFENSE COMMAND — Central Server        ║')
  console.log('  ╚══════════════════════════════════════════════════════╝\n')
  console.log(`  Server:   ${TLS_CERT ? 'https' : 'http'}://0.0.0.0:${PORT}`)
  console.log(`  API key:  ${config.apiKey}`)
  console.log(`  Data:     ${DATA_DIR}`)
  if (ALLOWED_ORIGINS.includes('*')) {
    console.warn('\n  WARNING: CORS is open to all origins (*). Set ALLOWED_ORIGINS=https://yourdomain.com in production.\n')
  }
  if (!process.env.OPENAI_API_KEY) {
    console.warn('  WARNING: OPENAI_API_KEY is not set — AI chat will return 503.\n')
  }
  console.log('\n  ── Agent install command ─────────────────────────────')
  console.log(`  macOS/Linux:`)
  console.log(`    sudo bash install.sh --server http://YOUR_IP:${PORT} --key ${config.apiKey}`)
  console.log(`  Windows (PowerShell as Admin):`)
  console.log(`    .\\install.ps1 -Server "http://YOUR_IP:${PORT}" -Key "${config.apiKey}"\n`)
})

// Graceful shutdown
function shutdown() {
  console.log('\n  Shutting down...')
  fs.writeFileSync(FLEET_FILE, JSON.stringify(fleet, null, 2))
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 5000)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
