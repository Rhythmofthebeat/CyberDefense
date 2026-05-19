const ALERT_COLORS = {
  SEVERE:   { bg: '#ff475722', color: '#ff4757' },
  HIGH:     { bg: '#ff634822', color: '#ff6348' },
  ELEVATED: { bg: '#ffa50222', color: '#ffa502' },
  GUARDED:  { bg: '#2ed57322', color: '#2ed573' },
}

async function loadSummary() {
  const { serverUrl, apiKey, lastSummary, lastUpdated } = await chrome.storage.sync.get(['serverUrl', 'apiKey'])
    .then(sync => chrome.storage.local.get(['lastSummary', 'lastUpdated']).then(local => ({ ...sync, ...local })))

  if (!serverUrl || !apiKey) {
    document.getElementById('stats-section').style.display = 'none'
    document.getElementById('offline-section').style.display = 'block'
    document.getElementById('input-url').value = serverUrl || ''
    document.getElementById('settings-panel').style.display = 'block'
    return
  }

  document.getElementById('btn-open').onclick = () => chrome.tabs.create({ url: serverUrl })

  if (lastSummary) renderSummary(lastSummary, lastUpdated)

  try {
    const res = await fetch(`${serverUrl}/api/fleet/summary`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) throw new Error()
    const data = await res.json()
    await chrome.storage.local.set({ lastSummary: data, lastUpdated: Date.now() })
    renderSummary(data, Date.now())
    document.getElementById('stats-section').style.display = 'block'
    document.getElementById('offline-section').style.display = 'none'
  } catch {
    if (!lastSummary) {
      document.getElementById('stats-section').style.display = 'none'
      document.getElementById('offline-section').style.display = 'block'
    }
  }
}

function renderSummary(data, timestamp) {
  const level = data.alertLevel || 'GUARDED'
  const colors = ALERT_COLORS[level] || ALERT_COLORS.GUARDED
  const badge = document.getElementById('alert-badge')
  badge.textContent = level
  badge.style.background = colors.bg
  badge.style.color = colors.color
  badge.style.border = `1px solid ${colors.color}44`

  document.getElementById('stat-online').textContent = data.online ?? '—'
  document.getElementById('stat-offline').textContent = data.offline ?? '—'
  document.getElementById('stat-cpu').textContent = data.avgCpu ? `${data.avgCpu}%` : '—'
  document.getElementById('stat-highcpu').textContent = data.highCpuDevices ?? '—'
  document.getElementById('stat-conns').textContent = data.totalConnections ?? '—'
  document.getElementById('stat-suspicious').textContent = data.suspiciousConnections ?? '—'

  if (timestamp) {
    const ago = Math.round((Date.now() - timestamp) / 1000)
    document.getElementById('last-updated').textContent = `Updated ${ago < 5 ? 'just now' : ago + 's ago'}`
  }
}

// Settings toggle
document.getElementById('toggle-settings').onclick = () => {
  const panel = document.getElementById('settings-panel')
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none'
}

// Save settings
document.getElementById('btn-save').onclick = async () => {
  const url = document.getElementById('input-url').value.trim().replace(/\/$/, '')
  const key = document.getElementById('input-key').value.trim()
  if (!url || !key) return
  await chrome.storage.sync.set({ serverUrl: url, apiKey: key })
  document.getElementById('settings-panel').style.display = 'none'
  loadSummary()
}

// Pre-fill settings
chrome.storage.sync.get(['serverUrl', 'apiKey']).then(({ serverUrl, apiKey }) => {
  if (serverUrl) document.getElementById('input-url').value = serverUrl
  if (apiKey) document.getElementById('input-key').value = apiKey
})

loadSummary()
