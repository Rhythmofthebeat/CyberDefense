/**
 * Network Device Poller
 * Handles SNMP polling and ICMP ping for devices without agents.
 * Runs as a module inside the main server.
 */
import snmp from 'net-snmp'
import { exec, execSync } from 'child_process'
import crypto from 'crypto'

// ── Standard SNMP OIDs ────────────────────────────────────────────────────────
const OIDs = {
  sysDescr:     '1.3.6.1.2.1.1.1.0',
  sysUpTime:    '1.3.6.1.2.1.1.3.0',
  sysName:      '1.3.6.1.2.1.1.5.0',
  sysContact:   '1.3.6.1.2.1.1.4.0',
  sysLocation:  '1.3.6.1.2.1.1.6.0',
  cpuLoad1:     '1.3.6.1.4.1.2021.10.1.3.1',    // UCD-SNMP (Linux/net-snmp)
  memTotal:     '1.3.6.1.4.1.2021.4.5.0',
  memFree:      '1.3.6.1.4.1.2021.4.11.0',
  ifDescr:      '1.3.6.1.2.1.2.2.1.2',           // interface names (table)
  ifInOctets:   '1.3.6.1.2.1.2.2.1.10',          // bytes in per interface
  ifOutOctets:  '1.3.6.1.2.1.2.2.1.16',          // bytes out per interface
  hrProcessorLoad: '1.3.6.1.2.1.25.3.3.1.2',     // HOST-RESOURCES (most routers)
}

// ── Ping ──────────────────────────────────────────────────────────────────────
export function pingDevice(ip) {
  return new Promise((resolve) => {
    const platform = process.platform
    const cmd = platform === 'win32'
      ? `ping -n 1 -w 1000 ${ip}`
      : `ping -c 1 -W 1 ${ip}`
    exec(cmd, { timeout: 3000 }, (err) => resolve(!err))
  })
}

// ── SNMP get ──────────────────────────────────────────────────────────────────
function snmpGet(ip, oids, community = 'public', version = snmp.Version2c) {
  return new Promise((resolve) => {
    const session = snmp.createSession(ip, community, { version, timeout: 3000, retries: 1 })
    session.get(oids, (err, varbinds) => {
      session.close()
      if (err) return resolve(null)
      const result = {}
      varbinds.forEach((vb, i) => {
        if (!snmp.isVarbindError(vb)) {
          result[oids[i]] = vb.value?.toString() || ''
        }
      })
      resolve(result)
    })
  })
}

// ── Poll a single SNMP device ─────────────────────────────────────────────────
export async function pollSnmpDevice(device) {
  const { ip, community = 'public', snmpVersion = '2c' } = device
  const version = snmpVersion === '1' ? snmp.Version1 : snmp.Version2c

  const alive = await pingDevice(ip)
  if (!alive) return { online: false }

  const basicOids = [OIDs.sysDescr, OIDs.sysUpTime, OIDs.sysName, OIDs.cpuLoad1, OIDs.memTotal, OIDs.memFree, OIDs.hrProcessorLoad]
  const data = await snmpGet(ip, basicOids, community, version)

  if (!data) return { online: true, snmp: false }

  const uptimeTicks  = parseInt(data[OIDs.sysUpTime] || 0)
  const uptimeSec    = Math.floor(uptimeTicks / 100)
  const memTotal     = parseInt(data[OIDs.memTotal] || 0)
  const memFree      = parseInt(data[OIDs.memFree] || 0)
  const memUsed      = memTotal - memFree
  const cpuUcd       = parseFloat(data[OIDs.cpuLoad1] || 0)
  const cpuHr        = parseFloat(data[OIDs.hrProcessorLoad] || 0)
  const cpu          = cpuUcd || cpuHr || 0

  return {
    online: true,
    snmp: true,
    sys: {
      cpu:    { usage: cpu, cores: 1, model: 'Network Device' },
      memory: memTotal > 0
        ? { total: memTotal * 1024, used: memUsed * 1024, free: memFree * 1024, pct: Math.round((memUsed / memTotal) * 100) }
        : null,
      uptime:   uptimeSec,
      hostname: data[OIDs.sysName] || ip,
      platform: 'snmp',
      sysDescr: data[OIDs.sysDescr] || '',
    },
    net: [],
    procs: [],
  }
}

// ── Poll a ping-only device ───────────────────────────────────────────────────
export async function pollPingDevice(device) {
  const online = await pingDevice(device.ip)
  return {
    online,
    snmp: false,
    sys: { cpu: { usage: 0, cores: 0, model: device.type || 'Unknown' }, memory: null, uptime: 0, hostname: device.name || device.ip, platform: 'ping' },
    net: [],
    procs: [],
  }
}
