#!/bin/bash
# Cyber Defense Agent — macOS Installer
# Installs as a LaunchDaemon (auto-starts on boot, runs as root)
#
# Usage:
#   sudo bash install-macos.sh --server http://YOUR_SERVER:4001 --key YOUR_API_KEY
#   sudo bash install-macos.sh --server http://YOUR_SERVER:4001 --key YOUR_API_KEY --name "Office Mac"

set -e

INSTALL_DIR="/opt/cyber-defense-agent"
CONFIG_DIR="/etc/cyber-defense"
PLIST="/Library/LaunchDaemons/com.cyberdefense.agent.plist"
SERVICE_NAME="com.cyberdefense.agent"

# ── Parse args ─────────────────────────────────────────────────────────────────
SERVER_URL=""
API_KEY=""
DEVICE_NAME=$(hostname)

while [[ $# -gt 0 ]]; do
  case $1 in
    --server) SERVER_URL="$2"; shift 2 ;;
    --key)    API_KEY="$2";    shift 2 ;;
    --name)   DEVICE_NAME="$2"; shift 2 ;;
    *) echo "Unknown: $1"; exit 1 ;;
  esac
done

if [ -z "$SERVER_URL" ] || [ -z "$API_KEY" ]; then
  echo "Usage: sudo bash install-macos.sh --server http://SERVER:4001 --key API_KEY [--name DeviceName]"
  exit 1
fi

if [ "$EUID" -ne 0 ]; then
  echo "Please run with sudo"
  exit 1
fi

echo ""
echo "  Installing Cyber Defense Agent"
echo "  Server:  $SERVER_URL"
echo "  Device:  $DEVICE_NAME"
echo ""

# ── Install Node.js check ──────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "  [!] Node.js not found. Installing via Homebrew..."
  if ! command -v brew &>/dev/null; then
    echo "  [!] Homebrew not found. Install Node.js from https://nodejs.org first."
    exit 1
  fi
  brew install node
fi

NODE_PATH=$(command -v node)
echo "  [✓] Node.js: $(node --version) at $NODE_PATH"

# ── Copy files ─────────────────────────────────────────────────────────────────
mkdir -p "$INSTALL_DIR" "$CONFIG_DIR"

# Copy agent files (assumes script is run from project root)
cp agent/agent.js "$INSTALL_DIR/"
cp agent/package.json "$INSTALL_DIR/"

cd "$INSTALL_DIR" && npm install --production 2>/dev/null
cd - >/dev/null

# ── Write config ───────────────────────────────────────────────────────────────
DEVICE_ID=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || uuidgen | tr '[:upper:]' '[:lower:]' | tr -d '-' | head -c 16)

cat > "$CONFIG_DIR/config.json" <<EOF
{
  "serverUrl": "$SERVER_URL",
  "apiKey": "$API_KEY",
  "deviceId": "$DEVICE_ID",
  "deviceName": "$DEVICE_NAME",
  "intervalSec": 30
}
EOF

chmod 600 "$CONFIG_DIR/config.json"
echo "  [✓] Config written to $CONFIG_DIR/config.json"

# ── LaunchDaemon plist ─────────────────────────────────────────────────────────
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$SERVICE_NAME</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_PATH</string>
    <string>$INSTALL_DIR/agent.js</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>CYBER_CONFIG</key>
    <string>$CONFIG_DIR/config.json</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/var/log/cyber-defense-agent.log</string>
  <key>StandardErrorPath</key>
  <string>/var/log/cyber-defense-agent.log</string>
</dict>
</plist>
EOF

# ── Enable service ─────────────────────────────────────────────────────────────
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load -w "$PLIST"

echo "  [✓] Service installed: $SERVICE_NAME"
echo "  [✓] Agent started"
echo ""
echo "  Logs: tail -f /var/log/cyber-defense-agent.log"
echo "  Stop: sudo launchctl unload $PLIST"
echo "  Start: sudo launchctl load -w $PLIST"
echo "  Uninstall: sudo bash uninstall-macos.sh"
echo ""
