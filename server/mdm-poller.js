/**
 * MDM Poller — Jamf Pro + Microsoft Intune
 * Pulls mobile device inventory and normalizes to a common format.
 */

// ── Jamf Pro ──────────────────────────────────────────────────────────────────

async function jamfGetToken(cfg) {
  const res = await fetch(`${cfg.url}/api/v1/auth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${cfg.username}:${cfg.password}`).toString('base64')}`,
    },
  })
  if (!res.ok) throw new Error(`Jamf auth failed: ${res.status}`)
  const { token } = await res.json()
  return token
}

async function jamfFetch(cfg, path) {
  const token = await jamfGetToken(cfg)
  const res = await fetch(`${cfg.url}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`Jamf API error: ${res.status} ${path}`)
  return res.json()
}

export async function pollJamf(cfg) {
  const [mobile, computers] = await Promise.all([
    jamfFetch(cfg, '/JSSResource/mobiledevices').catch(() => ({ mobile_devices: [] })),
    jamfFetch(cfg, '/JSSResource/computers').catch(() => ({ computers: [] })),
  ])

  const devices = []

  for (const d of mobile.mobile_devices || []) {
    devices.push({
      id:           `jamf-mobile-${d.id}`,
      source:       'jamf',
      type:         'mobile',
      name:         d.name || d.udid,
      model:        d.model || 'Unknown',
      os:           d.os_version ? `iOS ${d.os_version}` : 'iOS',
      serial:       d.serial_number || '',
      username:     d.username || '',
      managed:      d.managed ?? true,
      supervised:   d.supervised ?? false,
      lastSeen:     d.last_inventory_update || null,
      status:       'mdm',
    })
  }

  for (const d of computers.computers || []) {
    devices.push({
      id:       `jamf-computer-${d.id}`,
      source:   'jamf',
      type:     'computer',
      name:     d.name || d.serial_number,
      model:    d.model || 'Mac',
      os:       'macOS',
      serial:   d.serial_number || '',
      username: d.username || '',
      managed:  true,
      lastSeen: null,
      status:   'mdm',
    })
  }

  return devices
}

// ── Microsoft Intune (Graph API) ──────────────────────────────────────────────

async function intuneGetToken(cfg) {
  const body = new URLSearchParams({
    client_id:     cfg.clientId,
    client_secret: cfg.clientSecret,
    scope:         'https://graph.microsoft.com/.default',
    grant_type:    'client_credentials',
  })
  const res = await fetch(
    `https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/token`,
    { method: 'POST', body }
  )
  if (!res.ok) throw new Error(`Intune auth failed: ${res.status}`)
  const { access_token } = await res.json()
  return access_token
}

export async function pollIntune(cfg) {
  const token = await intuneGetToken(cfg)
  const devices = []
  let url = 'https://graph.microsoft.com/v1.0/deviceManagement/managedDevices?$select=id,deviceName,model,operatingSystem,osVersion,userPrincipalName,complianceState,lastSyncDateTime,managedDeviceOwnerType,deviceType'

  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`Intune API error: ${res.status}`)
    const data = await res.json()

    for (const d of data.value || []) {
      devices.push({
        id:         `intune-${d.id}`,
        source:     'intune',
        type:       d.deviceType === 'desktop' || d.deviceType === 'windowsRT' ? 'computer' : 'mobile',
        name:       d.deviceName || 'Unknown Device',
        model:      d.model || 'Unknown',
        os:         d.operatingSystem ? `${d.operatingSystem} ${d.osVersion || ''}`.trim() : 'Unknown',
        serial:     '',
        username:   d.userPrincipalName || '',
        managed:    true,
        compliant:  d.complianceState === 'compliant',
        lastSeen:   d.lastSyncDateTime || null,
        status:     'mdm',
      })
    }

    url = data['@odata.nextLink'] || null
  }

  return devices
}

// ── Unified poll ──────────────────────────────────────────────────────────────

export async function pollAllMDM(settings) {
  const results = { devices: [], errors: [] }

  if (settings.jamf?.enabled) {
    try {
      const devices = await pollJamf(settings.jamf)
      results.devices.push(...devices)
    } catch (e) {
      results.errors.push({ source: 'jamf', error: e.message })
    }
  }

  if (settings.intune?.enabled) {
    try {
      const devices = await pollIntune(settings.intune)
      results.devices.push(...devices)
    } catch (e) {
      results.errors.push({ source: 'intune', error: e.message })
    }
  }

  return results
}
