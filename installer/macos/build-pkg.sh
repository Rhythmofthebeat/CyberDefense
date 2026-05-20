#!/bin/bash
# Build a macOS .pkg installer for the Cyber Defense Agent
# Requires: Xcode Command Line Tools
# Optional: Apple Developer ID (for notarization)
#
# Usage:
#   bash installer/macos/build-pkg.sh
#   SIGN_ID="Developer ID Installer: Your Name (TEAMID)" bash installer/macos/build-pkg.sh

set -e

ARCH=${ARCH:-arm64}
BINARY="dist/cyber-defense-agent-darwin-${ARCH}"
VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "1.0.0")
PKG_OUT=$([ "$ARCH" = "x64" ] && echo "dist/CyberDefenseAgent-x64.pkg" || echo "dist/CyberDefenseAgent.pkg")
SCRIPTS_DIR="installer/macos/scripts"
PAYLOAD_DIR="/tmp/cda-pkg-payload"

echo "  Building macOS .pkg v${VERSION}..."

# Check binary exists
if [ ! -f "$BINARY" ]; then
  echo "  [!] Binary not found. Run: node scripts/build-agent-binary.mjs"
  exit 1
fi

# Payload structure
rm -rf "$PAYLOAD_DIR"
mkdir -p "$PAYLOAD_DIR/opt/cyber-defense-agent"
mkdir -p "$PAYLOAD_DIR/Library/LaunchDaemons"

cp "$BINARY" "$PAYLOAD_DIR/opt/cyber-defense-agent/cyber-defense-agent"
chmod 755 "$PAYLOAD_DIR/opt/cyber-defense-agent/cyber-defense-agent"

# LaunchDaemon plist (starts on boot, no Node.js needed)
cat > "$PAYLOAD_DIR/Library/LaunchDaemons/com.cyberdefense.agent.plist" << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>             <string>com.cyberdefense.agent</string>
  <key>ProgramArguments</key>  <array><string>/opt/cyber-defense-agent/cyber-defense-agent</string></array>
  <key>RunAtLoad</key>         <true/>
  <key>KeepAlive</key>         <true/>
  <key>StandardOutPath</key>   <string>/var/log/cyber-defense-agent.log</string>
  <key>StandardErrorPath</key> <string>/var/log/cyber-defense-agent.log</string>
</dict>
</plist>
EOF

# Install/uninstall scripts
mkdir -p "$SCRIPTS_DIR"

cat > "$SCRIPTS_DIR/postinstall" << 'EOF'
#!/bin/bash
mkdir -p /etc/cyber-defense
cat > /etc/cyber-defense/config.json << 'CONFIG'
{
  "serverUrl": "http://3.230.151.229:4001",
  "apiKey": "56cb6cdfe9e41523b3368d139755c3fcb2d6a86e4d4be04af512bf8ac37117f5",
  "deviceId": "auto",
  "deviceName": "auto",
  "intervalSec": 30
}
CONFIG
chmod 600 /etc/cyber-defense/config.json
launchctl unload /Library/LaunchDaemons/com.cyberdefense.agent.plist 2>/dev/null || true
launchctl load -w /Library/LaunchDaemons/com.cyberdefense.agent.plist
echo "Cyber Defense Agent installed and started."
EOF
chmod +x "$SCRIPTS_DIR/postinstall"

cat > "$SCRIPTS_DIR/preinstall" << 'EOF'
#!/bin/bash
launchctl unload /Library/LaunchDaemons/com.cyberdefense.agent.plist 2>/dev/null || true
exit 0
EOF
chmod +x "$SCRIPTS_DIR/preinstall"

# Build component pkg
pkgbuild \
  --root "$PAYLOAD_DIR" \
  --scripts "$SCRIPTS_DIR" \
  --identifier "com.cyberdefense.agent" \
  --version "$VERSION" \
  --install-location "/" \
  /tmp/cda-component.pkg

# Build product archive (final .pkg)
if [ -n "$SIGN_ID" ]; then
  productsign --sign "$SIGN_ID" /tmp/cda-component.pkg "$PKG_OUT"
  echo "  [✓] Signed with: $SIGN_ID"
else
  cp /tmp/cda-component.pkg "$PKG_OUT"
  echo "  [!] Not signed — users will see Gatekeeper warning"
  echo "      To sign: export SIGN_ID='Developer ID Installer: Name (TEAMID)'"
fi

echo "  [✓] Built: $PKG_OUT"
echo ""
echo "  To notarize (requires Apple Developer account):"
echo "    xcrun notarytool submit $PKG_OUT --apple-id you@email.com --team-id TEAMID --password APP_SPECIFIC_PW"
echo "    xcrun stapler staple $PKG_OUT"
