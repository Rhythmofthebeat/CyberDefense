/**
 * Autonomous Defense Agent
 * Monitors fleet in real time and automatically responds to threats.
 */

const DEFAULT_RULES = [
  { id: 'kill-ransomware',   enabled: true,  condition: { threatType: 'ransomware',    minSeverity: 'HIGH'     }, action: 'kill_process',      description: 'Kill ransomware processes automatically' },
  { id: 'kill-malware',      enabled: true,  condition: { threatType: 'malware',       minSeverity: 'HIGH'     }, action: 'kill_process',      description: 'Kill malware processes automatically' },
  { id: 'block-tor',         enabled: true,  condition: { threatType: 'tor',           minSeverity: 'MEDIUM'   }, action: 'block_ip',          description: 'Block TOR exit node connections' },
  { id: 'block-c2',          enabled: true,  condition: { threatType: 'apt',           minSeverity: 'HIGH'     }, action: 'block_ip',          description: 'Block C2 beaconing IPs' },
  { id: 'alert-critical',    enabled: true,  condition: {                              minSeverity: 'CRITICAL' }, action: 'alert',             description: 'Alert on any critical threat' },
  { id: 'isolate-critical',  enabled: false, condition: {                              minSeverity: 'CRITICAL' }, action: 'isolate_device',    description: 'Isolate device on critical threat (disabled by default)' },
]

const SEV_RANK = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 }

export class AutonomousAgent {
  constructor({ fleet, execJob, auditLog, addAlert }) {
    this.fleet    = fleet
    this.execJob  = execJob
    this.auditLog = auditLog
    this.addAlert = addAlert
    this.rules    = [...DEFAULT_RULES]
    this.enabled  = false
    this.actionLog= []
    this.handled  = new Set() // threat fingerprints already acted on
  }

  setEnabled(val) { this.enabled = val }
  setRules(rules) { this.rules = rules }
  getRules()      { return this.rules }
  getLog()        { return this.actionLog.slice(-100) }

  // Called by server on each heartbeat / threat detection
  async onThreats(deviceId, threats) {
    if (!this.enabled) return
    const device = this.fleet[deviceId]
    if (!device) return

    for (const threat of threats) {
      const fingerprint = `${deviceId}:${threat.type?.id || threat.type}:${threat.conn?.ip}:${threat.conn?.port}`
      if (this.handled.has(fingerprint)) continue

      for (const rule of this.rules) {
        if (!rule.enabled) continue
        if (!this._matches(threat, rule.condition)) continue

        this.handled.add(fingerprint)
        await this._execute(rule, device, threat)
        break // one rule per threat
      }
    }

    // Cleanup old fingerprints after 1 hour
    if (this.handled.size > 10000) this.handled.clear()
  }

  _matches(threat, condition) {
    if (condition.threatType) {
      const tType = threat.type?.id || threat.type
      if (tType !== condition.threatType) return false
    }
    if (condition.minSeverity) {
      if ((SEV_RANK[threat.severity] || 0) < SEV_RANK[condition.minSeverity]) return false
    }
    return true
  }

  async _execute(rule, device, threat) {
    const entry = {
      ts:        new Date().toISOString(),
      ruleId:    rule.id,
      action:    rule.action,
      device:    device.name,
      deviceId:  device.id,
      threat:    threat.type?.label || threat.type,
      severity:  threat.severity,
      ip:        threat.conn?.ip,
      port:      threat.conn?.port,
      status:    'pending',
    }

    try {
      switch (rule.action) {
        case 'kill_process': {
          const proc = (device.procs || []).find(p =>
            threat.conn?.pid ? p.pid === threat.conn.pid : p.name?.toLowerCase().includes(threat.type?.id || '')
          )
          if (proc) {
            const cmd = device.sys?.platform === 'win32'
              ? `taskkill /F /PID ${proc.pid}`
              : `kill -9 ${proc.pid}`
            await this.execJob(device.id, cmd, 'bash')
            entry.detail = `Killed PID ${proc.pid} (${proc.name})`
          } else {
            entry.detail = 'Process not found — logged only'
          }
          break
        }
        case 'block_ip': {
          if (threat.conn?.ip) {
            const cmd = device.sys?.platform === 'win32'
              ? `netsh advfirewall firewall add rule name="CDC-Block-${threat.conn.ip}" dir=out action=block remoteip=${threat.conn.ip}`
              : `iptables -A OUTPUT -d ${threat.conn.ip} -j DROP 2>/dev/null || pfctl -t blocklist -T add ${threat.conn.ip} 2>/dev/null || true`
            await this.execJob(device.id, cmd, 'bash')
            entry.detail = `Blocked IP ${threat.conn.ip}`
          }
          break
        }
        case 'isolate_device': {
          const cmd = device.sys?.platform === 'win32'
            ? `netsh advfirewall set allprofiles firewallpolicy blockinbound,blockoutbound`
            : `iptables -P INPUT DROP && iptables -P OUTPUT DROP && iptables -P FORWARD DROP`
          await this.execJob(device.id, cmd, 'bash')
          entry.detail = `Device isolated from network`
          break
        }
        case 'alert':
        default: {
          entry.detail = `Alert: ${threat.type?.label || threat.type} (${threat.severity}) on ${device.name}`
          break
        }
      }
      entry.status = 'done'
    } catch (e) {
      entry.status = 'failed'
      entry.error  = e.message
    }

    this.actionLog.unshift(entry)
    if (this.actionLog.length > 500) this.actionLog.pop()
    this.auditLog('AUTONOMOUS_ACTION', 'agent', device.id, entry)
    console.log(`  [AUTO] ${entry.action} on ${device.name}: ${entry.detail || entry.error}`)
  }
}
