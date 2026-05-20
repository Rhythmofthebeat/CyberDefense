import { useState, useEffect } from 'react'

const PLATFORM_ICON = { mobile: '📱', computer: '💻', tablet: '📟' }
const SOURCE_COLOR  = { jamf: '#0984e3', intune: '#7B68EE' }

function MDMSettingsPanel({ token, onClose }) {
  const [settings, setSettings] = useState({ jamf: { enabled: false, url: '', username: '', password: '' }, intune: { enabled: false, tenantId: '', clientId: '', clientSecret: '' } })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg]       = useState('')

  useEffect(() => {
    fetch('/api/mdm/settings', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(setSettings).catch(() => {})
  }, [])

  const save = async () => {
    setSaving(true)
    const r = await fetch('/api/mdm/settings', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(settings) })
    setSaving(false)
    setMsg(r.ok ? '✓ Saved & syncing...' : '✗ Failed to save')
    setTimeout(() => setMsg(''), 3000)
  }

  const field = (section, key, label, type = 'text', placeholder = '') => (
    <div style={{ marginBottom: 10 }}>
      <div style={{ color: '#4a5568', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{label}</div>
      <input
        type={type} value={settings[section]?.[key] || ''} placeholder={placeholder}
        onChange={e => setSettings(s => ({ ...s, [section]: { ...s[section], [key]: e.target.value } }))}
        style={{ width: '100%', background: '#030810', border: '1px solid #1a2a3e', borderRadius: 4, padding: '7px 10px', color: '#c8d6e5', fontSize: 12, fontFamily: 'monospace', outline: 'none' }}
      />
    </div>
  )

  const toggle = (section) => setSettings(s => ({ ...s, [section]: { ...s[section], enabled: !s[section]?.enabled } }))

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000000aa', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#060e1a', border: '1px solid #0f1d30', borderRadius: 8, padding: 24, width: 480, maxHeight: '80vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ color: '#ecf0f1', fontWeight: 700, fontSize: 14 }}>MDM Integration Settings</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#4a5568', cursor: 'pointer', fontSize: 18 }}>✕</button>
        </div>

        {/* Jamf */}
        <div style={{ background: '#0a1628', border: `1px solid ${settings.jamf?.enabled ? '#0984e3' : '#0f1d30'}`, borderRadius: 6, padding: 16, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: settings.jamf?.enabled ? 14 : 0 }}>
            <div style={{ color: '#0984e3', fontWeight: 700, fontSize: 13 }}>Jamf Pro</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <span style={{ color: '#636e7b', fontSize: 11 }}>{settings.jamf?.enabled ? 'Enabled' : 'Disabled'}</span>
              <div onClick={() => toggle('jamf')} style={{ width: 36, height: 20, background: settings.jamf?.enabled ? '#0984e3' : '#1a2a3e', borderRadius: 10, position: 'relative', cursor: 'pointer', transition: 'background 0.2s' }}>
                <div style={{ width: 14, height: 14, background: '#fff', borderRadius: '50%', position: 'absolute', top: 3, left: settings.jamf?.enabled ? 19 : 3, transition: 'left 0.2s' }} />
              </div>
            </label>
          </div>
          {settings.jamf?.enabled && <>
            {field('jamf', 'url',      'Jamf Pro URL',  'text',     'https://yourorg.jamfcloud.com')}
            {field('jamf', 'username', 'Username',      'text',     'api-user')}
            {field('jamf', 'password', 'Password',      'password', '••••••••')}
          </>}
        </div>

        {/* Intune */}
        <div style={{ background: '#0a1628', border: `1px solid ${settings.intune?.enabled ? '#7B68EE' : '#0f1d30'}`, borderRadius: 6, padding: 16, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: settings.intune?.enabled ? 14 : 0 }}>
            <div style={{ color: '#7B68EE', fontWeight: 700, fontSize: 13 }}>Microsoft Intune</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <span style={{ color: '#636e7b', fontSize: 11 }}>{settings.intune?.enabled ? 'Enabled' : 'Disabled'}</span>
              <div onClick={() => toggle('intune')} style={{ width: 36, height: 20, background: settings.intune?.enabled ? '#7B68EE' : '#1a2a3e', borderRadius: 10, position: 'relative', cursor: 'pointer', transition: 'background 0.2s' }}>
                <div style={{ width: 14, height: 14, background: '#fff', borderRadius: '50%', position: 'absolute', top: 3, left: settings.intune?.enabled ? 19 : 3, transition: 'left 0.2s' }} />
              </div>
            </label>
          </div>
          {settings.intune?.enabled && <>
            {field('intune', 'tenantId',     'Tenant ID',     'text',     '00000000-0000-0000-0000-000000000000')}
            {field('intune', 'clientId',     'Client ID',     'text',     'App registration client ID')}
            {field('intune', 'clientSecret', 'Client Secret', 'password', '••••••••')}
            <div style={{ color: '#4a5568', fontSize: 10, marginTop: 8 }}>
              Requires an Azure App Registration with <code style={{ color: '#7B68EE' }}>DeviceManagementManagedDevices.Read.All</code> permission.
            </div>
          </>}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={save} disabled={saving} style={{ background: 'linear-gradient(135deg,#0984e3,#1e90ff)', color: '#fff', border: 'none', borderRadius: 5, padding: '9px 20px', cursor: 'pointer', fontWeight: 700, fontSize: 12, fontFamily: 'monospace' }}>
            {saving ? 'Saving...' : 'Save & Sync'}
          </button>
          {msg && <span style={{ color: msg.startsWith('✓') ? '#2ed573' : '#ff4757', fontSize: 12 }}>{msg}</span>}
        </div>
      </div>
    </div>
  )
}

export default function MDMDevices({ token }) {
  const [devices, setDevices]     = useState([])
  const [showSettings, setShowSettings] = useState(false)
  const [syncing, setSyncing]     = useState(false)
  const [filter, setFilter]       = useState('all')

  const load = () =>
    fetch('/api/mdm/devices', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(setDevices).catch(() => {})

  useEffect(() => { load() }, [])

  const sync = async () => {
    setSyncing(true)
    await fetch('/api/mdm/sync', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
    await load()
    setSyncing(false)
  }

  const filtered = filter === 'all' ? devices : devices.filter(d => d.source === filter || d.type === filter)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#040a14', color: '#c8d6e5', padding: 20, gap: 14 }}>
      {showSettings && <MDMSettingsPanel token={token} onClose={() => { setShowSettings(false); load() }} />}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ color: '#ecf0f1', fontSize: 16, fontWeight: 700, letterSpacing: 1 }}>MDM DEVICES</div>
          <div style={{ color: '#4a5568', fontSize: 11 }}>{devices.length} devices from Jamf Pro & Microsoft Intune</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={sync} disabled={syncing} style={{ background: '#0a1628', border: '1px solid #1a2a3e', color: '#0984e3', borderRadius: 5, padding: '7px 14px', cursor: 'pointer', fontSize: 11, fontFamily: 'monospace' }}>
            {syncing ? '⟳ Syncing...' : '⟳ Sync Now'}
          </button>
          <button onClick={() => setShowSettings(true)} style={{ background: '#0a1628', border: '1px solid #1a2a3e', color: '#c8d6e5', borderRadius: 5, padding: '7px 14px', cursor: 'pointer', fontSize: 11, fontFamily: 'monospace' }}>
            ⚙ Settings
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 6 }}>
        {['all', 'mobile', 'computer', 'jamf', 'intune'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ background: filter === f ? '#0984e322' : 'transparent', border: `1px solid ${filter === f ? '#0984e3' : '#1a2a3e'}`, color: filter === f ? '#0984e3' : '#636e7b', borderRadius: 4, padding: '4px 12px', cursor: 'pointer', fontSize: 11, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: 1 }}>
            {f}
          </button>
        ))}
      </div>

      {/* Device grid */}
      {filtered.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: '#2a3a4e' }}>
          <div style={{ fontSize: 40 }}>📱</div>
          <div style={{ fontSize: 13 }}>No MDM devices yet</div>
          <button onClick={() => setShowSettings(true)} style={{ background: '#0984e322', border: '1px solid #0984e344', color: '#0984e3', borderRadius: 5, padding: '8px 18px', cursor: 'pointer', fontSize: 12, fontFamily: 'monospace' }}>
            Configure Jamf / Intune
          </button>
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10, alignContent: 'start' }}>
          {filtered.map(d => (
            <div key={d.id} style={{ background: '#060e1a', border: '1px solid #0f1d30', borderRadius: 6, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ fontSize: 26 }}>{PLATFORM_ICON[d.type] || '📱'}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#ecf0f1', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</div>
                  <div style={{ color: '#636e7b', fontSize: 11, marginTop: 2 }}>{d.model}</div>
                  <div style={{ color: '#4a5568', fontSize: 10, marginTop: 1 }}>{d.os}</div>
                </div>
                <div style={{ background: `${SOURCE_COLOR[d.source]}22`, border: `1px solid ${SOURCE_COLOR[d.source]}44`, color: SOURCE_COLOR[d.source], borderRadius: 3, padding: '2px 7px', fontSize: 9, fontFamily: 'monospace', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                  {d.source}
                </div>
              </div>
              {d.username && <div style={{ color: '#636e7b', fontSize: 10, marginTop: 8 }}>👤 {d.username}</div>}
              {d.lastSeen  && <div style={{ color: '#4a5568',  fontSize: 10, marginTop: 3 }}>🕐 {new Date(d.lastSeen).toLocaleDateString()}</div>}
              {'compliant' in d && (
                <div style={{ marginTop: 8, display: 'inline-block', background: d.compliant ? '#2ed57322' : '#ff475722', border: `1px solid ${d.compliant ? '#2ed57344' : '#ff475744'}`, color: d.compliant ? '#2ed573' : '#ff4757', borderRadius: 3, padding: '2px 8px', fontSize: 9, fontFamily: 'monospace' }}>
                  {d.compliant ? '✓ COMPLIANT' : '✗ NON-COMPLIANT'}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
