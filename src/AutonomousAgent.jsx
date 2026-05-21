import { useState, useEffect } from 'react'

const ACTION_COLOR = { kill_process: '#ff4757', block_ip: '#ff6348', isolate_device: '#e84393', alert: '#ffa502' }
const ACTION_ICON  = { kill_process: '⚡', block_ip: '🚫', isolate_device: '🔒', alert: '🔔' }
const SEV_COLOR    = { CRITICAL: '#ff4757', HIGH: '#ff6348', MEDIUM: '#ffa502', LOW: '#2ed573' }

export default function AutonomousAgentPanel({ token }) {
  const [status, setStatus]   = useState({ enabled: false, rules: [] })
  const [log, setLog]         = useState([])
  const [tab, setTab]         = useState('rules')
  const [saving, setSaving]   = useState(false)

  const load = () => {
    fetch('/api/autonomous/status', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(setStatus).catch(() => {})
    fetch('/api/autonomous/log', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(setLog).catch(() => {})
  }

  useEffect(() => { load(); const iv = setInterval(load, 5000); return () => clearInterval(iv) }, [token])

  const toggle = async () => {
    const r = await fetch('/api/autonomous/toggle', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
    const d = await r.json()
    setStatus(s => ({ ...s, enabled: d.enabled }))
  }

  const saveRules = async () => {
    setSaving(true)
    await fetch('/api/autonomous/rules', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: status.rules }) })
    setSaving(false)
  }

  const toggleRule = (id) => setStatus(s => ({ ...s, rules: s.rules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r) }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#040a14', color: '#c8d6e5', padding: 20, gap: 16 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ color: '#ecf0f1', fontSize: 16, fontWeight: 700, letterSpacing: 1 }}>AUTONOMOUS DEFENSE AGENT</div>
          <div style={{ color: '#4a5568', fontSize: 11, marginTop: 2 }}>Automatically responds to threats across all connected devices</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ color: status.enabled ? '#2ed573' : '#4a5568', fontSize: 12, fontFamily: 'monospace', fontWeight: 700 }}>
            {status.enabled ? '● ACTIVE' : '○ INACTIVE'}
          </div>
          <button onClick={toggle} style={{
            padding: '8px 20px', borderRadius: 5, fontWeight: 700, fontSize: 12, fontFamily: 'monospace', cursor: 'pointer', border: 'none',
            background: status.enabled ? '#ff475722' : 'linear-gradient(135deg,#0984e3,#1e90ff)',
            color: status.enabled ? '#ff4757' : '#fff',
            border: status.enabled ? '1px solid #ff475744' : 'none',
          }}>
            {status.enabled ? 'DISABLE' : 'ENABLE'}
          </button>
        </div>
      </div>

      {/* Warning banner when enabled */}
      {status.enabled && (
        <div style={{ background: '#ff475711', border: '1px solid #ff475733', borderRadius: 5, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>⚡</span>
          <span style={{ color: '#ff6348', fontSize: 12 }}>Autonomous mode is <strong>active</strong> — the agent will automatically execute actions on connected devices when threats are detected.</span>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #0f1d30' }}>
        {['rules', 'action log'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 16px', background: 'transparent', border: 'none',
            borderBottom: `2px solid ${tab === t ? '#0984e3' : 'transparent'}`,
            color: tab === t ? '#0984e3' : '#4a5568', cursor: 'pointer',
            fontSize: 11, fontWeight: 700, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: 1,
          }}>{t}{t === 'action log' && log.length > 0 ? ` (${log.length})` : ''}</button>
        ))}
      </div>

      {/* Rules */}
      {tab === 'rules' && (
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(status.rules || []).map(rule => (
            <div key={rule.id} style={{ background: '#060e1a', border: `1px solid ${rule.enabled ? '#0f1d3088' : '#0f1d30'}`, borderRadius: 6, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 14, opacity: rule.enabled ? 1 : 0.5 }}>
              <div style={{ fontSize: 24 }}>{ACTION_ICON[rule.action] || '🤖'}</div>
              <div style={{ flex: 1 }}>
                <div style={{ color: '#ecf0f1', fontSize: 13, fontWeight: 600 }}>{rule.description}</div>
                <div style={{ color: '#4a5568', fontSize: 10, marginTop: 3, fontFamily: 'monospace' }}>
                  action: <span style={{ color: ACTION_COLOR[rule.action] || '#c8d6e5' }}>{rule.action}</span>
                  {rule.condition.threatType && <> · type: <span style={{ color: '#0984e3' }}>{rule.condition.threatType}</span></>}
                  {rule.condition.minSeverity && <> · min severity: <span style={{ color: SEV_COLOR[rule.condition.minSeverity] }}>{rule.condition.minSeverity}</span></>}
                </div>
              </div>
              <div onClick={() => toggleRule(rule.id)} style={{ width: 40, height: 22, background: rule.enabled ? '#0984e3' : '#1a2a3e', borderRadius: 11, position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}>
                <div style={{ width: 16, height: 16, background: '#fff', borderRadius: '50%', position: 'absolute', top: 3, left: rule.enabled ? 21 : 3, transition: 'left 0.2s' }} />
              </div>
            </div>
          ))}
          <button onClick={saveRules} disabled={saving} style={{ alignSelf: 'flex-start', background: 'linear-gradient(135deg,#0984e3,#1e90ff)', color: '#fff', border: 'none', borderRadius: 5, padding: '9px 20px', cursor: 'pointer', fontWeight: 700, fontSize: 12, fontFamily: 'monospace', marginTop: 4 }}>
            {saving ? 'Saving...' : 'Save Rules'}
          </button>
        </div>
      )}

      {/* Action log */}
      {tab === 'action log' && (
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {log.length === 0
            ? <div style={{ color: '#2a3a4e', fontSize: 12, textAlign: 'center', padding: 40 }}>No actions taken yet</div>
            : log.map((entry, i) => (
              <div key={i} style={{ background: '#060e1a', border: `1px solid ${entry.status === 'failed' ? '#ff475722' : '#0f1d30'}`, borderRadius: 5, padding: '10px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16 }}>{ACTION_ICON[entry.action] || '🤖'}</span>
                    <span style={{ color: ACTION_COLOR[entry.action] || '#c8d6e5', fontSize: 12, fontWeight: 700, fontFamily: 'monospace' }}>{entry.action}</span>
                    <span style={{ color: SEV_COLOR[entry.severity] || '#ffa502', fontSize: 10, fontFamily: 'monospace' }}>{entry.severity}</span>
                  </div>
                  <span style={{ color: entry.status === 'done' ? '#2ed573' : entry.status === 'failed' ? '#ff4757' : '#ffa502', fontSize: 10, fontFamily: 'monospace' }}>{entry.status}</span>
                </div>
                <div style={{ color: '#c8d6e5', fontSize: 11 }}>{entry.device} · {entry.threat}</div>
                {entry.detail && <div style={{ color: '#636e7b', fontSize: 10, marginTop: 3 }}>{entry.detail}</div>}
                {entry.error  && <div style={{ color: '#ff4757',  fontSize: 10, marginTop: 3 }}>Error: {entry.error}</div>}
                <div style={{ color: '#2a3a4e', fontSize: 9, marginTop: 4, fontFamily: 'monospace' }}>{new Date(entry.ts).toLocaleString()}</div>
              </div>
            ))
          }
        </div>
      )}
    </div>
  )
}
