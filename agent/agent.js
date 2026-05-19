#!/usr/bin/env node
/**
 * Cyber Defense Agent — cross-platform system monitor
 * Supports: macOS, Linux, Windows (Node 18+)
 *
 * On install, set SERVER_URL and API_KEY in config.json.
 * The agent runs as a background service and pushes data every 30s.
 */
import os from 'os'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'

// __dirname compatible with both ESM and SEA (Single Executable Application)
const __dirname = typeof import.meta.url !== 'undefined' && import.meta.url
  ? path.dirname(fileURLToPath(import.meta.url))
  : path.dirname(process.execPath)
const platform = os.platform()

// ── Config ─────────────────────────────────────────────────────────────────────
// Config file locations per platform:
//   macOS/Linux: /etc/cyber-defense/config.json  or  ./config.json
//   Windows:     C:\ProgramData\CyberDefense\config.json  or  .\config.json

function getConfigPath() {
  if (platform === 'win32') {
    return path.join(process.env.ProgramData || 'C:\\ProgramData', 'CyberDefense', 'config.json')
  }
  return fs.existsSync('/etc/cyber-defense') ? '/etc/cyber-defense/config.json' : path.join(__dirname, 'config.json')
}

const CONFIG_PATH = getConfigPath()

function loadConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
  }
  // Default config — user must edit SERVER_URL and API_KEY
  return {
    serverUrl: process.env.CYBER_SERVER_URL || 'http://localhost:4001',
    apiKey: process.env.CYBER_API_KEY || 'REPLACE_WITH_API_KEY',
    deviceId: crypto.randomBytes(8).toString('hex'),
    deviceName: os.hostname(),
    intervalSec: 30,
  }
}

const config = loadConfig()
const DEVICE_ID = config.deviceId
const DEVICE_NAME = config.deviceName || os.hostname()
const SERVER_URL = config.serverUrl
const API_KEY = config.apiKey
const INTERVAL_MS = (config.intervalSec || 30) * 1000

// ── CPU ────────────────────────────────────────────────────────────────────────

function cpuUsage() {
  try {
    if (platform === 'darwin') {
      const out = execSync("top -l 1 -n 0 | grep 'CPU usage'", { timeout: 4000 }).toString()
      const m = out.match(/(\d+\.?\d*)%\s+user/)
      return m ? parseFloat(m[1]) : 0
    }
    if (platform === 'linux') {
      const out = execSync("top -bn1 | grep -iE '^(%)?Cpu'", { timeout: 4000 }).toString()
      const m = out.match(/(\d+\.?\d*)\s*us/) || out.match(/(\d+\.?\d*)%?\s+user/)
      return m ? parseFloat(m[1]) : 0
    }
    if (platform === 'win32') {
      const out = execSync('wmic cpu get loadpercentage /value', { timeout: 4000 }).toString()
      const m = out.match(/LoadPercentage=(\d+)/)
      return m ? parseInt(m[1]) : 0
    }
  } catch {}
  return 0
}

// ── Network connections ────────────────────────────────────────────────────────

function parseForeignAddr(addr) {
  const colonIdx = addr.lastIndexOf(':')
  const dotIdx = addr.lastIndexOf('.')
  if (colonIdx > dotIdx) {
    const ip = addr.substring(0, colonIdx).replace(/^\[|\]$/g, '')
    const port = parseInt(addr.substring(colonIdx + 1))
    return { ip, port }
  }
  const ip = addr.substring(0, dotIdx)
  const port = parseInt(addr.substring(dotIdx + 1))
  return { ip, port }
}

function networkConnections() {
  const connections = []
  try {
    let cmd
    if (platform === 'win32') cmd = 'netstat -an | findstr ESTABLISHED'
    else cmd = "netstat -an 2>/dev/null | grep -i established || ss -tn state established 2>/dev/null"
    const out = execSync(cmd, { timeout: 4000 }).toString()
    for (const line of out.trim().split('\n')) {
      if (!line.trim()) continue
      const parts = line.trim().split(/\s+/)
      const foreign = platform === 'win32' ? parts[2] : parts[4]
      if (!foreign) continue
      const { ip, port } = parseForeignAddr(foreign)
      if (ip && !isNaN(port) && port > 0 && !ip.includes('*') && ip !== '0.0.0.0') {
        connections.push({ ip: ip.replace(/^::ffff:/, ''), port })
      }
    }
  } catch {}
  return connections
}

// ── Processes ─────────────────────────────────────────────────────────────────

function topProcesses() {
  try {
    if (platform === 'win32') {
      const out = execSync(
        'powershell -Command "Get-Process | Sort-Object CPU -Descending | Select-Object -First 12 Id,CPU,WorkingSet,ProcessName | ConvertTo-Csv -NoTypeInformation"',
        { timeout: 5000 }
      ).toString()
      return out.trim().split('\n').slice(1).map(line => {
        const parts = line.replace(/"/g, '').split(',')
        return { pid: parseInt(parts[0]) || 0, cpu: parseFloat(parts[1]) || 0, mem: parseFloat(parts[2]) / 1e6 || 0, name: parts[3]?.trim() || 'unknown' }
      }).filter(p => p.name)
    }
    const out = execSync('ps aux | sort -k3 -rn | head -12', { timeout: 4000 }).toString()
    return out.trim().split('\n').slice(1).map(line => {
      const parts = line.trim().split(/\s+/)
      return { pid: parseInt(parts[1]), cpu: parseFloat(parts[2]), mem: parseFloat(parts[3]), name: parts.slice(10).join(' ').split('/').pop()?.substring(0, 40) || 'unknown' }
    }).filter(p => !isNaN(p.pid))
  } catch { return [] }
}

// ── Heartbeat ──────────────────────────────────────────────────────────────────

async function sendHeartbeat() {
  const total = os.totalmem()
  const free = os.freemem()
  const used = total - free

  const payload = {
    deviceId: DEVICE_ID,
    name: DEVICE_NAME,
    sys: {
      cpu: { usage: cpuUsage(), cores: os.cpus().length, model: os.cpus()[0]?.model || 'Unknown' },
      memory: { total, used, free, pct: Math.round((used / total) * 100) },
      uptime: os.uptime(),
      hostname: os.hostname(),
      platform,
    },
    net: networkConnections(),
    procs: topProcesses(),
  }

  try {
    const res = await fetch(`${SERVER_URL}/api/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    console.log(`[${new Date().toISOString()}] Heartbeat sent — CPU: ${payload.sys.cpu.usage.toFixed(1)}% | RAM: ${payload.sys.memory.pct}% | Conns: ${payload.net.length}`)
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Heartbeat failed: ${err.message}`)
  }
}

// ── Protective commands ───────────────────────────────────────────────────────

const THREAT_PORTS = [4444, 1337, 31337, 6666, 8888, 23]

function isolateDevice() {
  const killed = []

  // Kill processes holding suspicious connections
  for (const port of THREAT_PORTS) {
    try {
      if (platform === 'linux') {
        const pids = execSync(`ss -tnp 2>/dev/null | grep ":${port} " | grep -oP 'pid=\\K[0-9]+'`, { timeout: 3000 }).toString().trim()
        for (const pid of pids.split('\n').filter(Boolean)) {
          try { execSync(`kill -9 ${pid}`, { timeout: 2000 }); killed.push(`pid ${pid} (port ${port})`) } catch {}
        }
      } else if (platform === 'darwin') {
        const pids = execSync(`lsof -i TCP:${port} -t 2>/dev/null`, { timeout: 3000 }).toString().trim()
        for (const pid of pids.split('\n').filter(Boolean)) {
          try { execSync(`kill -9 ${pid}`, { timeout: 2000 }); killed.push(`pid ${pid} (port ${port})`) } catch {}
        }
      } else if (platform === 'win32') {
        const out = execSync(`netstat -ano 2>nul | findstr ":${port}"`, { timeout: 3000 }).toString()
        for (const line of out.split('\n')) {
          const m = line.trim().match(/\s(\d+)$/)
          if (m) { try { execSync(`taskkill /F /PID ${m[1]} 2>nul`, { timeout: 2000 }); killed.push(`pid ${m[1]} (port ${port})`) } catch {} }
        }
      }
    } catch {}
  }

  // Block ports via firewall (best-effort, requires elevated privileges)
  const blocked = []
  try {
    if (platform === 'linux') {
      for (const port of THREAT_PORTS) {
        try { execSync(`iptables -A OUTPUT -p tcp --dport ${port} -j DROP 2>/dev/null`, { timeout: 2000 }); blocked.push(port) } catch {}
      }
    } else if (platform === 'win32') {
      for (const port of THREAT_PORTS) {
        try {
          execSync(`netsh advfirewall firewall add rule name="CDC-Block-${port}" dir=out protocol=tcp remoteport=${port} action=block 2>nul`, { timeout: 2000 })
          blocked.push(port)
        } catch {}
      }
    }
  } catch {}

  const parts = []
  if (killed.length)  parts.push(`killed: ${killed.join(', ')}`)
  if (blocked.length) parts.push(`firewall blocked ports: ${blocked.join(', ')}`)
  return parts.length ? parts.join(' | ') : 'no active suspicious connections found'
}

function killProcess({ pid, name } = {}) {
  if (pid) {
    const safePid = parseInt(pid, 10)
    if (isNaN(safePid) || safePid <= 0) throw new Error('invalid pid')
    if (platform === 'win32') execSync(`taskkill /F /PID ${safePid}`, { timeout: 5000 })
    else execSync(`kill -9 ${safePid}`, { timeout: 5000 })
    return `killed pid ${safePid}`
  }
  if (name) {
    // Only allow safe process name characters — alphanumeric, spaces, dots, underscores, hyphens
    if (!/^[\w.\- ]+$/.test(name)) throw new Error('process name contains invalid characters')
    if (platform === 'win32') execSync(`taskkill /F /IM "${name}"`, { timeout: 5000 })
    else execSync(`pkill -9 -x "${name}"`, { timeout: 5000 })
    return `killed process "${name}"`
  }
  throw new Error('kill_proc requires pid or name')
}

function runScan() {
  const findings = []
  const conns = networkConnections()
  const suspicious = conns.filter(c => THREAT_PORTS.includes(c.port))
  if (suspicious.length) findings.push(`suspicious connections: ${suspicious.map(c => `${c.ip}:${c.port}`).join(', ')}`)

  if (platform !== 'win32') {
    try {
      const out = execSync('find /tmp /var/tmp -perm -002 -type f 2>/dev/null | head -5', { timeout: 5000 }).toString().trim()
      if (out) findings.push(`world-writable files in tmp: ${out.split('\n').length}`)
    } catch {}
    try {
      const out = execSync('last | head -5 2>/dev/null', { timeout: 3000 }).toString().trim()
      if (out) findings.push(`recent logins:\n${out}`)
    } catch {}
  }

  return findings.length ? findings.join('\n') : 'no threats detected'
}

async function executeCommand(cmd) {
  let success = true
  let output = ''
  try {
    if (cmd.type === 'isolate')   output = isolateDevice(cmd.params)
    else if (cmd.type === 'kill_proc') output = killProcess(cmd.params)
    else if (cmd.type === 'scan') output = runScan()
    else { output = `unknown command type: ${cmd.type}`; success = false }
  } catch (e) {
    output = e.message; success = false
  }

  try {
    await fetch(`${SERVER_URL}/api/commands/${DEVICE_ID}/${cmd.id}/ack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ success, output: output.slice(0, 1000) }),
      signal: AbortSignal.timeout(10_000),
    })
    console.log(`[${new Date().toISOString()}] CMD ${cmd.id} (${cmd.type}) ${success ? 'OK' : 'FAIL'}: ${output.slice(0, 80)}`)
  } catch (e) {
    console.error(`[${new Date().toISOString()}] CMD ack failed: ${e.message}`)
  }
}

async function pollCommands() {
  try {
    const res = await fetch(`${SERVER_URL}/api/commands/${DEVICE_ID}`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
      signal: AbortSignal.timeout(5_000),
    })
    if (!res.ok) return
    const commands = await res.json()
    for (const cmd of commands) {
      console.log(`[${new Date().toISOString()}] Received command: ${cmd.type} (${cmd.id})`)
      executeCommand(cmd) // fire-and-forget
    }
  } catch {}
}

// ── Remote exec ───────────────────────────────────────────────────────────────

const EXEC_TIMEOUT_MS = 30_000

async function executeJob(job) {
  const ext = { python:'py', bash:'sh', powershell:'ps1', javascript:'js' }[job.language] || 'sh'
  const tmpFile = path.join(os.tmpdir(), `cdc-job-${job.id}.${ext}`)

  let output = ''
  let exitCode = 0
  let error = null

  try {
    fs.writeFileSync(tmpFile, job.script, { mode: 0o700 })

    const cmds = {
      python:     `python3 "${tmpFile}"`,
      bash:       `bash "${tmpFile}"`,
      powershell: `powershell -ExecutionPolicy Bypass -File "${tmpFile}"`,
      javascript: `node "${tmpFile}"`,
    }
    const cmd = cmds[job.language]
    if (!cmd) throw new Error(`Unsupported language: ${job.language}`)

    try {
      output = execSync(cmd, { timeout: EXEC_TIMEOUT_MS, maxBuffer: 1024 * 1024 }).toString()
    } catch (e) {
      output   = [e.stdout?.toString(), e.stderr?.toString()].filter(Boolean).join('\n') || e.message
      exitCode = e.status ?? 1
    }
  } catch (e) {
    error    = e.message
    exitCode = 1
  } finally {
    try { fs.unlinkSync(tmpFile) } catch {}
  }

  try {
    await fetch(`${SERVER_URL}/api/fleet/${DEVICE_ID}/jobs/${job.id}/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
      body: JSON.stringify({ output: output.substring(0, 50_000), exitCode, error }),
      signal: AbortSignal.timeout(10_000),
    })
    console.log(`[${new Date().toISOString()}] Job ${job.id} done (exit ${exitCode})`)
  } catch (e) {
    console.error(`[${new Date().toISOString()}] Failed to report job ${job.id}: ${e.message}`)
  }
}

async function pollJobs() {
  try {
    const res = await fetch(`${SERVER_URL}/api/fleet/${DEVICE_ID}/jobs/pending`, {
      headers: { 'Authorization': `Bearer ${API_KEY}` },
      signal: AbortSignal.timeout(5_000),
    })
    if (!res.ok) return
    const jobs = await res.json()
    for (const job of jobs) {
      console.log(`[${new Date().toISOString()}] Received job ${job.id} (${job.language})`)
      executeJob(job) // fire and forget — don't await, allows parallel jobs
    }
  } catch {}
}

// ── Start ─────────────────────────────────────────────────────────────────────

console.log(`\n  Cyber Defense Agent`)
console.log(`  Device:  ${DEVICE_NAME} (${DEVICE_ID})`)
console.log(`  Server:  ${SERVER_URL}`)
console.log(`  Poll:    every ${config.intervalSec || 30}s\n`)

sendHeartbeat()
setInterval(sendHeartbeat, INTERVAL_MS)

// Poll for remote exec jobs every 5 seconds
pollJobs()
setInterval(pollJobs, 5_000)

// Poll for autonomous protective commands every 15 seconds
pollCommands()
setInterval(pollCommands, 15_000)
