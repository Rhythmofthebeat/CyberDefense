#!/bin/bash
# Build .deb package for Debian/Ubuntu
# Run: bash installer/linux/build-deb.sh

set -e

BINARY="dist/cyber-defense-agent-linux-x64"
VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "1.0.0")
PKG_NAME="cyber-defense-agent"
PKG_DIR="/tmp/${PKG_NAME}_${VERSION}"

if [ ! -f "$BINARY" ]; then
  echo "[!] Binary not found. Run: node scripts/build-agent-binary.mjs"
  exit 1
fi

echo "  Building .deb v${VERSION}..."

# Directory structure
mkdir -p "${PKG_DIR}/DEBIAN"
mkdir -p "${PKG_DIR}/usr/bin"
mkdir -p "${PKG_DIR}/etc/cyber-defense"
mkdir -p "${PKG_DIR}/lib/systemd/system"

# Binary
cp "$BINARY" "${PKG_DIR}/usr/bin/cyber-defense-agent"
chmod 755 "${PKG_DIR}/usr/bin/cyber-defense-agent"

# Default config (user fills in after install)
cat > "${PKG_DIR}/etc/cyber-defense/config.json" << 'EOF'
{
  "serverUrl": "http://YOUR_SERVER_IP:4001",
  "apiKey":    "REPLACE_WITH_API_KEY",
  "deviceId":  "",
  "deviceName": "",
  "intervalSec": 30
}
EOF

# systemd service
cat > "${PKG_DIR}/lib/systemd/system/cyber-defense-agent.service" << 'EOF'
[Unit]
Description=Cyber Defense Agent
After=network.target
StartLimitIntervalSec=0

[Service]
Type=simple
Restart=always
RestartSec=10
ExecStart=/usr/bin/cyber-defense-agent
Environment=CYBER_CONFIG=/etc/cyber-defense/config.json
StandardOutput=journal
StandardError=journal
SyslogIdentifier=cyber-defense-agent

[Install]
WantedBy=multi-user.target
EOF

# DEBIAN control
cat > "${PKG_DIR}/DEBIAN/control" << EOF
Package: ${PKG_NAME}
Version: ${VERSION}
Section: net
Priority: optional
Architecture: amd64
Maintainer: Cyber Defense Command <admin@cyberdefense.local>
Description: Cyber Defense Agent
 System monitor agent for the Cyber Defense Command dashboard.
 Reports CPU, memory, network connections, and process data
 to the central Cyber Defense Command server.
EOF

# postinst — generate deviceId and start service
cat > "${PKG_DIR}/DEBIAN/postinst" << 'EOF'
#!/bin/bash
set -e
CONFIG="/etc/cyber-defense/config.json"
# Generate unique deviceId if not set
if python3 -c "import json,sys; d=json.load(open('$CONFIG')); sys.exit(0 if d.get('deviceId') else 1)" 2>/dev/null; then
  true
else
  ID=$(cat /proc/sys/kernel/random/uuid | tr -d '-' | head -c 16)
  NAME=$(hostname)
  python3 -c "
import json
with open('$CONFIG') as f: d=json.load(f)
d['deviceId']   = '$ID'
d['deviceName'] = '$NAME'
with open('$CONFIG','w') as f: json.dump(d,f,indent=2)
" 2>/dev/null || true
fi
chmod 600 "$CONFIG"
systemctl daemon-reload
systemctl enable cyber-defense-agent
systemctl restart cyber-defense-agent || true
echo ""
echo "  Cyber Defense Agent installed."
echo "  Edit /etc/cyber-defense/config.json with your server URL and API key,"
echo "  then restart: sudo systemctl restart cyber-defense-agent"
EOF
chmod 755 "${PKG_DIR}/DEBIAN/postinst"

# prerm — stop service before removal
cat > "${PKG_DIR}/DEBIAN/prerm" << 'EOF'
#!/bin/bash
systemctl stop cyber-defense-agent 2>/dev/null || true
systemctl disable cyber-defense-agent 2>/dev/null || true
EOF
chmod 755 "${PKG_DIR}/DEBIAN/prerm"

# Build
dpkg-deb --build "${PKG_DIR}" "dist/${PKG_NAME}_${VERSION}_amd64.deb"
echo "  [✓] Built: dist/${PKG_NAME}_${VERSION}_amd64.deb"
