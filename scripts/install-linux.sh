#!/bin/bash
# Cyber Defense Agent — Linux Installer
# Installs as a systemd service (auto-starts on boot)
#
# Usage:
#   sudo bash install-linux.sh --server http://YOUR_SERVER:4001 --key YOUR_API_KEY
#   sudo bash install-linux.sh --server http://YOUR_SERVER:4001 --key YOUR_API_KEY --name "Server-01"

set -e

INSTALL_DIR="/opt/cyber-defense-agent"
CONFIG_DIR="/etc/cyber-defense"
SERVICE_FILE="/etc/systemd/system/cyber-defense-agent.service"

# ── Parse args ─────────────────────────────────────────────────────────────────
SERVER_URL=""
API_KEY=""
DEVICE_NAME=$(hostname)

while [[ $# -gt 0 ]]; do
  case $1 in
    --server) SERVER_URL="$2"; shift 2 ;;
    --key)    API_KEY="$2";    shift 2 ;;
    --name)   DEVICE_NAME="$2"; shift 2 ;;
    *) echo "Unknown argument: $1"; exit 1 ;;
  esac
done

if [ -z "$SERVER_URL" ] || [ -z "$API_KEY" ]; then
  echo "Usage: sudo bash install-linux.sh --server http://SERVER:4001 --key API_KEY [--name DeviceName]"
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

# ── Node.js check ──────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "  [!] Node.js not found. Installing..."
  if command -v apt-get &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
  elif command -v dnf &>/dev/null; then
    dnf install -y nodejs npm
  elif command -v yum &>/dev/null; then
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
    yum install -y nodejs
  else
    echo "  [!] Could not auto-install Node.js. Install from https://nodejs.org"
    exit 1
  fi
fi

NODE_PATH=$(command -v node)
echo "  [✓] Node.js: $(node --version) at $NODE_PATH"

# ── Copy files ─────────────────────────────────────────────────────────────────
mkdir -p "$INSTALL_DIR" "$CONFIG_DIR"
cp agent/agent.js "$INSTALL_DIR/"
cp agent/package.json "$INSTALL_DIR/"
cd "$INSTALL_DIR" && npm install --production 2>/dev/null
cd - >/dev/null

# ── Write config ───────────────────────────────────────────────────────────────
DEVICE_ID=$(cat /proc/sys/kernel/random/uuid 2>/dev/null | tr -d '-' | head -c 16 || echo "$(hostname)-$(date +%s)")

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

# ── systemd service ────────────────────────────────────────────────────────────
cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Cyber Defense Agent
After=network.target
StartLimitIntervalSec=0

[Service]
Type=simple
Restart=always
RestartSec=10
ExecStart=$NODE_PATH $INSTALL_DIR/agent.js
Environment=CYBER_CONFIG=$CONFIG_DIR/config.json
StandardOutput=journal
StandardError=journal
SyslogIdentifier=cyber-defense-agent

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable cyber-defense-agent
systemctl restart cyber-defense-agent

echo "  [✓] Service installed and started"
echo ""
echo "  Logs:    journalctl -u cyber-defense-agent -f"
echo "  Status:  systemctl status cyber-defense-agent"
echo "  Stop:    systemctl stop cyber-defense-agent"
echo "  Remove:  systemctl disable cyber-defense-agent && rm $SERVICE_FILE"
echo ""
