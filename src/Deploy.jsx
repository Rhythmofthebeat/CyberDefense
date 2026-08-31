import { useState, useEffect } from "react";

const BASE = window.location.origin;

const PLATFORMS = [
  {
    id: "macos",
    icon: "",
    label: "macOS",
    sub: "Apple Silicon & Intel",
    color: "#0984e3",
    steps: [
      { label: "One-line install (Terminal)", type: "shell", cmd: `curl -fsSL ${BASE}/download/install-macos.sh | sudo bash` },
      { label: "Or download and inspect first", type: "download", url: `${BASE}/download/install-macos.sh`, file: "install-macos.sh" },
    ],
    note: "Installs as a LaunchDaemon — starts automatically on boot. Requires admin password.",
  },
  {
    id: "linux",
    icon: "LNX",
    label: "Linux",
    sub: "Ubuntu · Debian · RHEL · Fedora",
    color: "#fdcb6e",
    steps: [
      { label: "One-line install (as root)", type: "shell", cmd: `curl -fsSL ${BASE}/download/install-linux.sh | sudo bash` },
      { label: "Or download .sh script", type: "download", url: `${BASE}/download/install-linux.sh`, file: "install-linux.sh" },
    ],
    note: "Installs as a systemd service — starts automatically on boot.",
  },
  {
    id: "windows",
    icon: "WIN",
    label: "Windows",
    sub: "Windows 10 / 11 (64-bit)",
    color: "#74b9ff",
    steps: [
      { label: "Download PowerShell installer", type: "download", url: `${BASE}/download/install-windows.ps1`, file: "install-windows.ps1" },
      { label: "Run in PowerShell as Administrator", type: "shell", cmd: `.\\install-windows.ps1 -Server "${BASE}" -Key "YOUR_API_KEY"` },
    ],
    note: "Installs as a Windows Service — starts automatically on boot.",
  },
  {
    id: "ansible",
    icon: "ANS",
    label: "Ansible",
    sub: "Deploy to hundreds of machines at once",
    color: "#e17055",
    steps: [
      { label: "Download playbook (pre-filled)", type: "download", url: `${BASE}/download/deploy-ansible.yml`, file: "deploy-agent.yml" },
      { label: "Run against your inventory", type: "shell", cmd: `ansible-playbook deploy-agent.yml -i inventory.ini` },
    ],
    note: "Works on any Linux or macOS host. Server URL and API key are pre-filled in the download.",
  },
  {
    id: "jamf",
    icon: "MAC",
    label: "Jamf Pro",
    sub: "Mass deploy to managed Macs",
    color: "#a29bfe",
    steps: [
      { label: "Download Jamf policy script", type: "download", url: `${BASE}/download/jamf-install.sh`, file: "jamf-install.sh" },
      { label: "In Jamf: Computers → Scripts → New → paste script", type: "info" },
      { label: "Create Policy: trigger=Enrollment, scope=All Computers", type: "info" },
    ],
    note: "Parameters 4–6 in the Jamf policy: Server URL, API Key, Device Name.",
  },
  {
    id: "intune",
    icon: "MDM",
    label: "Microsoft Intune",
    sub: "Mass deploy to managed Windows devices",
    color: "#00b894",
    steps: [
      { label: "Download Intune install script", type: "download", url: `${BASE}/download/intune-install.ps1`, file: "Install-CyberDefenseAgent.ps1" },
      { label: "Package with Win32 Content Prep Tool → upload to Intune", type: "info" },
      { label: "Assign to device groups", type: "info" },
    ],
    note: "Detection rule: File exists at C:\\Program Files\\CyberDefenseAgent\\cyber-defense-agent.exe",
  },
];

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} style={{
      padding: "3px 10px", borderRadius: 3, fontSize: 10, cursor: "pointer",
      background: copied ? "#2ed57322" : "#1e90ff22",
      border: `1px solid ${copied ? "#2ed57344" : "#1e90ff44"}`,
      color: copied ? "#2ed573" : "#1e90ff",
      fontFamily: "monospace", fontWeight: 700, whiteSpace: "nowrap",
    }}>
      {copied ? "✓ COPIED" : "COPY"}
    </button>
  );
}

export default function Deploy({ token, onClose }) {
  const [apiKey, setApiKey] = useState("loading...");
  const [selected, setSelected] = useState("macos");

  useEffect(() => {
    fetch("/api/health").then(r => r.json()).then(() => {
      // Get API key from fleet summary (admin only endpoint returns it indirectly)
      // We'll just show the server URL and let admin copy key from settings
      fetch("/api/users", { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? setApiKey("(see server startup log or ~/cyber-defense-server/data/config.json)") : null)
        .catch(() => {})
    })
  }, [])

  const platform = PLATFORMS.find(p => p.id === selected);

  const inputStyle = {
    background: "#030810", border: "1px solid #0f1d30", borderRadius: 4,
    color: "#2ed573", padding: "8px 12px", fontSize: 11,
    fontFamily: "monospace", width: "100%", outline: "none",
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "#000000cc", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        width: 780, maxHeight: "90vh", background: "#060e1a",
        border: "1px solid #0f1d30", borderRadius: 10, overflow: "hidden",
        display: "flex", flexDirection: "column",
      }}>
        {/* Header */}
        <div style={{
          padding: "16px 24px", background: "linear-gradient(180deg,#0a1628,#060e1a)",
          borderBottom: "1px solid #0f1d30", display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div>
            <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#ecf0f1", letterSpacing: 2 }}>
              DEPLOY AGENT
            </div>
            <div style={{ fontSize: 10, color: "#4a5568", marginTop: 2 }}>
              Install the monitoring agent on any device — all scripts are pre-filled with your server details
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "transparent", border: "1px solid #1a2a3e",
            borderRadius: 4, color: "#636e7b", padding: "5px 10px", cursor: "pointer", fontSize: 11,
          }}>✕ Close</button>
        </div>

        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {/* Sidebar */}
          <div style={{ width: 200, borderRight: "1px solid #0f1d30", overflowY: "auto", background: "#040a14" }}>
            {PLATFORMS.map(p => (
              <button key={p.id} onClick={() => setSelected(p.id)} style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "12px 16px", background: selected === p.id ? "#060e1a" : "transparent",
                border: "none", borderLeft: `3px solid ${selected === p.id ? p.color : "transparent"}`,
                cursor: "pointer", transition: "all 0.15s",
              }}>
                <div style={{ fontSize: 18 }}>{p.icon}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: selected === p.id ? "#ecf0f1" : "#636e7b", marginTop: 2 }}>{p.label}</div>
                <div style={{ fontSize: 9, color: "#4a5568", marginTop: 1 }}>{p.sub}</div>
              </button>
            ))}
          </div>

          {/* Content */}
          <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
              <span style={{ fontSize: 32 }}>{platform.icon}</span>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#ecf0f1" }}>{platform.label}</div>
                <div style={{ fontSize: 11, color: "#636e7b" }}>{platform.sub}</div>
              </div>
            </div>

            {/* Server info box */}
            <div style={{ background: "#040a14", border: "1px solid #0f1d30", borderRadius: 6, padding: 16, marginBottom: 20 }}>
              <div style={{ fontSize: 10, color: "#4a5568", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginBottom: 10 }}>
                Your Server Details
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 9, color: "#4a5568", marginBottom: 3 }}>SERVER URL</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input readOnly value={BASE} style={inputStyle} />
                    <CopyButton text={BASE} />
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: "#4a5568", marginBottom: 3 }}>API KEY (for agents)</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input readOnly value={apiKey} style={{ ...inputStyle, color: "#fdcb6e" }} />
                    <CopyButton text={apiKey} />
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 10, color: "#4a5568", marginTop: 8 }}>
                All downloaded scripts have your server URL and API key pre-filled automatically.
              </div>
            </div>

            {/* Steps */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: "#4a5568", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginBottom: 12 }}>
                Install Steps
              </div>
              {platform.steps.map((step, i) => (
                <div key={i} style={{ display: "flex", gap: 14, marginBottom: 14, alignItems: "flex-start" }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
                    background: `${platform.color}22`, border: `1px solid ${platform.color}44`,
                    color: platform.color, fontSize: 11, fontWeight: 700,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>{i + 1}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: "#c8d6e5", marginBottom: 6 }}>{step.label}</div>
                    {step.type === "shell" && (
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <div style={{
                          flex: 1, background: "#030810", border: "1px solid #0a1628",
                          borderRadius: 4, padding: "8px 12px", fontFamily: "monospace",
                          fontSize: 11, color: "#00ff88", overflowX: "auto", whiteSpace: "nowrap",
                        }}>
                          {step.cmd}
                        </div>
                        <CopyButton text={step.cmd} />
                      </div>
                    )}
                    {step.type === "download" && (
                      <a href={step.url} download={step.file} style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        padding: "7px 14px", borderRadius: 4,
                        background: `${platform.color}18`, border: `1px solid ${platform.color}44`,
                        color: platform.color, textDecoration: "none",
                        fontSize: 11, fontFamily: "monospace", fontWeight: 700,
                      }}>
                        {step.file}
                      </a>
                    )}
                    {step.type === "info" && (
                      <div style={{ fontSize: 11, color: "#636e7b", fontStyle: "italic" }}>
                        {step.label}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Note */}
            <div style={{
              background: "#040a14", border: "1px solid #0f1d30", borderRadius: 5,
              padding: "10px 14px", fontSize: 11, color: "#636e7b",
            }}>
              {platform.note}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
