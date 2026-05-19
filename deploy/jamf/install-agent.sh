#!/bin/bash
# Cyber Defense Agent — Jamf Pro Policy Script
# Deploy as a Jamf Policy to all managed Macs.
#
# In Jamf:
#   1. Computers > Management Settings > Scripts > New
#   2. Paste this script, set Parameters 4-6
#   3. Create a Policy: trigger=Enrollment, script=this, scope=All Computers
#
# Parameters (set in Jamf policy):
#   $4 = Server URL    (e.g. http://10.0.0.100:4001)
#   $5 = API Key       (from server startup output)
#   $6 = Device Name   (optional, defaults to computer name)

set -e

SERVER_URL="${4:-http://REPLACE_WITH_SERVER:4001}"
API_KEY="${5:-REPLACE_WITH_API_KEY}"
DEVICE_NAME="${6:-$(scutil --get ComputerName 2>/dev/null || hostname)}"

INSTALL_DIR="/opt/cyber-defense-agent"
CONFIG_DIR="/etc/cyber-defense"
PLIST="/Library/LaunchDaemons/com.cyberdefense.agent.plist"
LOG="/var/log/cyber-defense-agent.log"

echo "Cyber Defense Agent — Jamf Install"
echo "Server:  $SERVER_URL"
echo "Device:  $DEVICE_NAME"

# ── Create directories ────────────────────────────────────────────────────────
mkdir -p "$INSTALL_DIR" "$CONFIG_DIR"

# ── Download binary from server ───────────────────────────────────────────────
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
  BINARY_NAME="cyber-defense-agent-darwin-arm64"
else
  BINARY_NAME="cyber-defense-agent-darwin-x64"
fi

echo "Downloading $BINARY_NAME..."
curl -fsSL "${SERVER_URL}/download/${BINARY_NAME}" -o "${INSTALL_DIR}/cyber-defense-agent" 2>/dev/null \
  || { echo "Download failed — check server URL and that binaries are served"; exit 1; }
chmod 755 "${INSTALL_DIR}/cyber-defense-agent"

# ── Write config ──────────────────────────────────────────────────────────────
DEVICE_ID=$(ioreg -rd1 -c IOPlatformExpertDevice | awk '/IOPlatformUUID/ {gsub(/[^A-Za-z0-9]/, "", $3); print substr($3,1,16)}')

cat > "${CONFIG_DIR}/config.json" <<EOF
{
  "serverUrl":   "$SERVER_URL",
  "apiKey":      "$API_KEY",
  "deviceId":    "$DEVICE_ID",
  "deviceName":  "$DEVICE_NAME",
  "intervalSec": 30
}
EOF
chmod 600 "${CONFIG_DIR}/config.json"

# ── LaunchDaemon ──────────────────────────────────────────────────────────────
launchctl unload "$PLIST" 2>/dev/null || true

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.cyberdefense.agent</string>
  <key>ProgramArguments</key>
  <array><string>${INSTALL_DIR}/cyber-defense-agent</string></array>
  <key>EnvironmentVariables</key>
  <dict><key>CYBER_CONFIG</key><string>${CONFIG_DIR}/config.json</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${LOG}</string>
  <key>StandardErrorPath</key><string>${LOG}</string>
</dict>
</plist>
EOF

launchctl load -w "$PLIST"
echo "Agent installed and started successfully."
exit 0
