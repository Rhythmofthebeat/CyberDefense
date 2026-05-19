#!/bin/bash
# Cyber Defense Command — One-command production deploy
#
# Usage on a fresh Ubuntu/Debian VPS:
#   curl -fsSL https://yourdomain.com/install.sh | sudo bash
#
# Or manually:
#   sudo bash scripts/deploy.sh --domain yourdomain.com --email admin@yourdomain.com

set -e

DOMAIN=""
EMAIL=""
ADMIN_USER="admin"
ADMIN_PASS=""
PORT=4001
INSTALL_DIR="/opt/cyber-defense-server"
SERVICE="cyber-defense-server"

# ── Parse args ─────────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --domain)   DOMAIN="$2";     shift 2 ;;
    --email)    EMAIL="$2";      shift 2 ;;
    --user)     ADMIN_USER="$2"; shift 2 ;;
    --password) ADMIN_PASS="$2"; shift 2 ;;
    --port)     PORT="$2";       shift 2 ;;
    *) echo "Unknown: $1"; exit 1 ;;
  esac
done

if [ "$EUID" -ne 0 ]; then echo "Run as root (sudo)"; exit 1; fi

# Auto-generate admin password if not provided
if [ -z "$ADMIN_PASS" ]; then
  ADMIN_PASS=$(openssl rand -base64 16 | tr -d '+=/' | head -c 16)
  GENERATED_PASS=true
fi

echo ""
echo "  ╔══════════════════════════════════════════════════════╗"
echo "  ║    Cyber Defense Command — Production Deploy         ║"
echo "  ╚══════════════════════════════════════════════════════╝"
echo ""
echo "  Domain:  ${DOMAIN:-localhost}"
echo "  Port:    $PORT"
echo "  User:    $ADMIN_USER"
echo ""

# ── Node.js ────────────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null || [[ "$(node --version | cut -d. -f1 | tr -d 'v')" -lt 20 ]]; then
  echo "  Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
echo "  [✓] Node.js $(node --version)"

# ── Caddy (for TLS) ────────────────────────────────────────────────────────────
if [ -n "$DOMAIN" ] && ! command -v caddy &>/dev/null; then
  echo "  Installing Caddy..."
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl 2>/dev/null
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update && apt-get install -y caddy
  echo "  [✓] Caddy $(caddy version)"
fi

# ── Install server ─────────────────────────────────────────────────────────────
echo "  Installing server to $INSTALL_DIR..."
mkdir -p "$INSTALL_DIR"

# Copy files (assumes running from project root)
cp server/server.js   "$INSTALL_DIR/"
cp server/package.json "$INSTALL_DIR/"
[ -d dist ] && cp -r dist "$INSTALL_DIR/"

cd "$INSTALL_DIR" && npm install --production 2>/dev/null
cd - >/dev/null
echo "  [✓] Server files installed"

# ── systemd service ────────────────────────────────────────────────────────────
cat > "/etc/systemd/system/${SERVICE}.service" <<EOF
[Unit]
Description=Cyber Defense Command Server
After=network.target
StartLimitIntervalSec=0

[Service]
Type=simple
Restart=always
RestartSec=5
WorkingDirectory=$INSTALL_DIR
ExecStart=$(which node) $INSTALL_DIR/server.js
Environment=PORT=$PORT
Environment=NODE_ENV=production
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SERVICE
User=www-data
Group=www-data

[Install]
WantedBy=multi-user.target
EOF

chown -R www-data:www-data "$INSTALL_DIR"
systemctl daemon-reload
systemctl enable "$SERVICE"
systemctl restart "$SERVICE"
sleep 2
echo "  [✓] Service started"

# ── Create admin user ─────────────────────────────────────────────────────────
# Wait for data dir to be created by the server
sleep 2
node "$INSTALL_DIR/server.js" setup "$ADMIN_USER" "$ADMIN_PASS"
# Restart to pick up the new user
systemctl restart "$SERVICE"
echo "  [✓] Admin user created"

# ── Caddy config for TLS ──────────────────────────────────────────────────────
if [ -n "$DOMAIN" ]; then
  mkdir -p /var/log/caddy
  cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
    reverse_proxy localhost:$PORT
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        -Server
    }
    encode gzip
    log { output file /var/log/caddy/cyber-defense.log }
}
EOF
  systemctl enable caddy
  systemctl restart caddy
  echo "  [✓] Caddy configured for $DOMAIN"
fi

# ── Firewall ──────────────────────────────────────────────────────────────────
if command -v ufw &>/dev/null; then
  ufw allow 22/tcp   2>/dev/null || true  # SSH
  ufw allow 80/tcp   2>/dev/null || true  # HTTP (redirect)
  ufw allow 443/tcp  2>/dev/null || true  # HTTPS
  ufw allow $PORT/tcp 2>/dev/null || true # Direct server access for agents
  echo "  [✓] Firewall configured"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
API_KEY=$(node -e "const fs=require('fs'); console.log(JSON.parse(fs.readFileSync('$INSTALL_DIR/data/config.json')).apiKey)" 2>/dev/null || echo "see $INSTALL_DIR/data/config.json")

echo ""
echo "  ╔══════════════════════════════════════════════════════╗"
echo "  ║              DEPLOY COMPLETE                         ║"
echo "  ╚══════════════════════════════════════════════════════╝"
echo ""
if [ -n "$DOMAIN" ]; then
  echo "  Dashboard:  https://$DOMAIN"
else
  echo "  Dashboard:  http://YOUR_SERVER_IP:$PORT"
fi
echo ""
echo "  Login credentials:"
echo "    Username: $ADMIN_USER"
if [ -n "$GENERATED_PASS" ]; then
  echo "    Password: $ADMIN_PASS  ← SAVE THIS NOW"
fi
echo ""
echo "  Agent API key: $API_KEY"
echo ""
echo "  Install agent on other devices:"
echo "    macOS/Linux: sudo bash install.sh --server http://YOUR_SERVER:$PORT --key $API_KEY"
echo "    Windows:     .\\install.ps1 -Server 'http://YOUR_SERVER:$PORT' -Key '$API_KEY'"
echo ""
echo "  Logs:   journalctl -u $SERVICE -f"
echo "  Stop:   systemctl stop $SERVICE"
echo ""
