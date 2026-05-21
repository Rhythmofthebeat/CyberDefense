import { useState, useEffect, useRef } from 'react'

const PLATFORM_ICON = { darwin: '🍎', win32: '🪟', linux: '🐧' }
const PLATFORM_NAME = { darwin: 'macOS', win32: 'Windows', linux: 'Linux' }

function UsageBar({ value, color }) {
  return (
    <div style={{ width: '100%', height: 4, background: '#0a1628', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ width: `${Math.min(value, 100)}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 1s ease' }} />
    </div>
  )
}

function DeviceCard({ device, selected, onClick }) {
  const cpu = device.sys?.cpu?.usage ?? 0
  const mem = device.sys?.memory?.pct ?? 0
  const cpuColor = cpu > 80 ? '#ff4757' : cpu > 60 ? '#ffa502' : '#2ed573'
  const memColor = mem > 85 ? '#ff4757' : mem > 70 ? '#ffa502' : '#0984e3'
  const platform = device.sys?.platform || 'unknown'

  return (
    <div onClick={onClick} style={{
      padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #0a1628',
      background: selected ? '#0984e311' : 'transparent',
      borderLeft: `3px solid ${selected ? '#0984e3' : 'transparent'}`,
      transition: 'all 0.15s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 16 }}>{PLATFORM_ICON[platform] || '💻'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#ecf0f1', fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{device.name}</div>
          <div style={{ color: '#4a5568', fontSize: 10 }}>{PLATFORM_NAME[platform] || platform}</div>
        </div>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: device.online ? '#2ed573' : '#4a5568', flexShrink: 0 }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ color: '#4a5568', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1 }}>CPU</span>
            <span style={{ color: cpuColor, fontSize: 9, fontFamily: 'monospace' }}>{cpu.toFixed(0)}%</span>
          </div>
          <UsageBar value={cpu} color={cpuColor} />
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ color: '#4a5568', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1 }}>MEM</span>
            <span style={{ color: memColor, fontSize: 9, fontFamily: 'monospace' }}>{mem}%</span>
          </div>
          <UsageBar value={mem} color={memColor} />
        </div>
      </div>
      <div style={{ color: '#2a3a4e', fontSize: 9, marginTop: 5, fontFamily: 'monospace' }}>
        {device.net?.length ?? 0} connections · {device.procs?.length ?? 0} processes
      </div>
    </div>
  )
}

function DeviceDetail({ device, threats, token }) {
  const [tab, setTab] = useState('overview')
  if (!device) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2a3a4e', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 32 }}>💻</div>
      <div style={{ fontSize: 13 }}>Select a device</div>
    </div>
  )

  const cpu = device.sys?.cpu?.usage ?? 0
  const mem = device.sys?.memory?.pct ?? 0
  const memUsed = device.sys?.memory?.used ? (device.sys.memory.used / 1e9).toFixed(1) : '?'
  const memTotal = device.sys?.memory?.total ? (device.sys.memory.total / 1e9).toFixed(1) : '?'
  const uptime = device.sys?.uptime ? `${Math.floor(device.sys.uptime / 3600)}h ${Math.floor((device.sys.uptime % 3600) / 60)}m` : '?'
  const platform = device.sys?.platform || 'unknown'
  const deviceThreats = threats.filter(t => t.device === device.name || t.deviceId === device.id)

  const tabs = ['overview', 'processes', 'network', 'threats']

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      {/* Device header */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #0f1d30', background: '#060e1a', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 28 }}>{PLATFORM_ICON[platform] || '💻'}</span>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#ecf0f1', fontSize: 16, fontWeight: 700 }}>{device.name}</div>
          <div style={{ color: '#4a5568', fontSize: 11 }}>
            {PLATFORM_NAME[platform] || platform} · {device.sys?.cpu?.model || 'Unknown CPU'} · Uptime {uptime}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: device.online ? '#2ed573' : '#4a5568' }} />
          <span style={{ color: device.online ? '#2ed573' : '#4a5568', fontSize: 11, fontFamily: 'monospace', fontWeight: 700 }}>
            {device.online ? 'ONLINE' : 'OFFLINE'}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #0f1d30', background: '#060e1a' }}>
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 16px', background: 'transparent', border: 'none',
            borderBottom: `2px solid ${tab === t ? '#0984e3' : 'transparent'}`,
            color: tab === t ? '#0984e3' : '#4a5568', cursor: 'pointer',
            fontSize: 11, fontWeight: 700, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: 1,
          }}>{t}</button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>

        {tab === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {/* CPU */}
            <div style={{ background: '#060e1a', border: '1px solid #0f1d30', borderRadius: 6, padding: 14 }}>
              <div style={{ color: '#4a5568', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>CPU Usage</div>
              <div style={{ color: cpu > 80 ? '#ff4757' : '#ecf0f1', fontSize: 32, fontWeight: 800, fontFamily: 'monospace' }}>{cpu.toFixed(1)}%</div>
              <div style={{ color: '#4a5568', fontSize: 11, marginTop: 4 }}>{device.sys?.cpu?.cores} cores · {device.sys?.cpu?.model?.split(' ').slice(0, 3).join(' ')}</div>
              <div style={{ marginTop: 10 }}><UsageBar value={cpu} color={cpu > 80 ? '#ff4757' : cpu > 60 ? '#ffa502' : '#2ed573'} /></div>
            </div>
            {/* Memory */}
            <div style={{ background: '#060e1a', border: '1px solid #0f1d30', borderRadius: 6, padding: 14 }}>
              <div style={{ color: '#4a5568', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Memory</div>
              <div style={{ color: mem > 85 ? '#ff4757' : '#ecf0f1', fontSize: 32, fontWeight: 800, fontFamily: 'monospace' }}>{mem}%</div>
              <div style={{ color: '#4a5568', fontSize: 11, marginTop: 4 }}>{memUsed} GB used of {memTotal} GB</div>
              <div style={{ marginTop: 10 }}><UsageBar value={mem} color={mem > 85 ? '#ff4757' : mem > 70 ? '#ffa502' : '#0984e3'} /></div>
            </div>
            {/* Network */}
            <div style={{ background: '#060e1a', border: '1px solid #0f1d30', borderRadius: 6, padding: 14 }}>
              <div style={{ color: '#4a5568', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Network</div>
              <div style={{ color: '#ecf0f1', fontSize: 32, fontWeight: 800, fontFamily: 'monospace' }}>{device.net?.length ?? 0}</div>
              <div style={{ color: '#4a5568', fontSize: 11, marginTop: 4 }}>active connections</div>
            </div>
            {/* Threats */}
            <div style={{ background: '#060e1a', border: '1px solid #0f1d30', borderRadius: 6, padding: 14 }}>
              <div style={{ color: '#4a5568', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Threats</div>
              <div style={{ color: deviceThreats.length > 0 ? '#ff4757' : '#2ed573', fontSize: 32, fontWeight: 800, fontFamily: 'monospace' }}>{deviceThreats.length}</div>
              <div style={{ color: '#4a5568', fontSize: 11, marginTop: 4 }}>detected this session</div>
            </div>
          </div>
        )}

        {tab === 'processes' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px', gap: 8, padding: '6px 10px', color: '#4a5568', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, borderBottom: '1px solid #0a1628' }}>
              <span>Process</span><span>PID</span><span style={{ textAlign: 'right' }}>CPU</span>
            </div>
            {(device.procs || []).map((p, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px', gap: 8, padding: '7px 10px', background: '#060e1a', borderRadius: 4, alignItems: 'center' }}>
                <span style={{ color: '#c8d6e5', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                <span style={{ color: '#4a5568', fontSize: 11, fontFamily: 'monospace' }}>{p.pid}</span>
                <span style={{ color: p.cpu > 50 ? '#ff4757' : p.cpu > 20 ? '#ffa502' : '#636e7b', fontSize: 11, fontFamily: 'monospace', textAlign: 'right' }}>{(p.cpu ?? 0).toFixed(1)}%</span>
              </div>
            ))}
            {(!device.procs || device.procs.length === 0) && <div style={{ color: '#2a3a4e', fontSize: 12, textAlign: 'center', padding: 30 }}>No process data</div>}
          </div>
        )}

        {tab === 'network' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 60px', gap: 8, padding: '6px 10px', color: '#4a5568', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, borderBottom: '1px solid #0a1628' }}>
              <span>Remote IP</span><span>Port</span><span>State</span>
            </div>
            {(device.net || []).map((c, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 60px', gap: 8, padding: '7px 10px', background: '#060e1a', borderRadius: 4, alignItems: 'center' }}>
                <span style={{ color: '#c8d6e5', fontSize: 11, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.ip || '—'}</span>
                <span style={{ color: '#636e7b', fontSize: 11, fontFamily: 'monospace' }}>{c.port}</span>
                <span style={{ color: c.state === 'ESTABLISHED' ? '#2ed573' : '#636e7b', fontSize: 10, fontFamily: 'monospace' }}>{c.state || '—'}</span>
              </div>
            ))}
            {(!device.net || device.net.length === 0) && <div style={{ color: '#2a3a4e', fontSize: 12, textAlign: 'center', padding: 30 }}>No connections</div>}
          </div>
        )}

        {tab === 'threats' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {deviceThreats.length === 0
              ? <div style={{ color: '#2ed573', fontSize: 12, textAlign: 'center', padding: 30 }}>✓ No threats detected on this device</div>
              : deviceThreats.map((t, i) => (
                <div key={i} style={{ background: '#060e1a', border: '1px solid #ff475722', borderRadius: 5, padding: '10px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#ecf0f1', fontSize: 12, fontWeight: 700 }}>{t.type?.label || t.type}</span>
                    <span style={{ color: t.severity === 'CRITICAL' ? '#ff4757' : t.severity === 'HIGH' ? '#ff6348' : '#ffa502', fontSize: 10, fontFamily: 'monospace', fontWeight: 700 }}>{t.severity}</span>
                  </div>
                  <div style={{ color: '#636e7b', fontSize: 11, marginTop: 4 }}>{t.conn?.ip}:{t.conn?.port}</div>
                </div>
              ))
            }
          </div>
        )}
      </div>
    </div>
  )
}

export default function FleetView({ token, threats = [] }) {
  const [devices, setDevices]   = useState([])
  const [selected, setSelected] = useState(null)
  const [search, setSearch]     = useState('')

  useEffect(() => {
    const load = () =>
      fetch('/api/fleet', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(d => {
          const devs = d.devices || []
          setDevices(devs)
          if (!selected && devs.length > 0) setSelected(devs[0].id)
        }).catch(() => {})
    load()
    const iv = setInterval(load, 5000)
    return () => clearInterval(iv)
  }, [token])

  const filtered = devices.filter(d =>
    d.name?.toLowerCase().includes(search.toLowerCase()) ||
    d.sys?.platform?.toLowerCase().includes(search.toLowerCase())
  )

  const selectedDevice = devices.find(d => d.id === selected)

  return (
    <div style={{ display: 'flex', height: '100%', background: '#040a14' }}>
      {/* Device list sidebar */}
      <div style={{ width: 220, borderRight: '1px solid #0f1d30', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '10px 12px', borderBottom: '1px solid #0a1628' }}>
          <div style={{ color: '#ecf0f1', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
            FLEET
            <span style={{ marginLeft: 8, color: '#2ed573', fontSize: 10, fontFamily: 'monospace' }}>
              {devices.filter(d => d.online).length}/{devices.length}
            </span>
          </div>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search devices..."
            style={{ width: '100%', background: '#0a1628', border: '1px solid #1a2a3e', borderRadius: 4, padding: '6px 8px', color: '#c8d6e5', fontSize: 11, outline: 'none', fontFamily: 'monospace' }}
          />
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.length === 0
            ? <div style={{ color: '#2a3a4e', fontSize: 11, textAlign: 'center', padding: 20 }}>No devices found</div>
            : filtered.map(d => <DeviceCard key={d.id} device={d} selected={selected === d.id} onClick={() => setSelected(d.id)} />)
          }
        </div>
      </div>

      {/* Device detail */}
      <DeviceDetail device={selectedDevice} threats={threats} token={token} />
    </div>
  )
}
