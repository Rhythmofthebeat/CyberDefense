// Cyber Defense Command — Extension Service Worker
// Polls the central server every 30s and updates the badge

const ALARM_NAME = 'poll-fleet'
const BADGE_COLORS = {
  SEVERE:   '#ff4757',
  HIGH:     '#ff6348',
  ELEVATED: '#ffa502',
  GUARDED:  '#2ed573',
  OFFLINE:  '#636e7b',
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 0.5 })
  pollFleet()
})

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === ALARM_NAME) pollFleet()
})

async function pollFleet() {
  const { serverUrl, apiKey } = await chrome.storage.sync.get(['serverUrl', 'apiKey'])
  if (!serverUrl || !apiKey) {
    setBadge('?', '#636e7b')
    return
  }

  try {
    const res = await fetch(`${serverUrl}/api/fleet/summary`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()

    const alertLevel = data.alertLevel || 'GUARDED'
    const color = BADGE_COLORS[alertLevel] || BADGE_COLORS.GUARDED
    const label = data.suspiciousConnections > 0 ? `${data.suspiciousConnections}` : `${data.online}`

    setBadge(label, color)
    chrome.storage.local.set({ lastSummary: data, lastUpdated: Date.now() })
  } catch {
    setBadge('!', BADGE_COLORS.OFFLINE)
  }
}

function setBadge(text, color) {
  chrome.action.setBadgeText({ text: String(text) })
  chrome.action.setBadgeBackgroundColor({ color })
}
