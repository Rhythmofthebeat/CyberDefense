import { useState, useEffect, useCallback, useRef } from "react";
import Editor from "@monaco-editor/react";

// ─── Constants ────────────────────────────────────────────────────────────────

const THREAT_TYPES = [
  { id: "malware",       label: "Malware",        icon: "🦠", color: "#ff4757" },
  { id: "trojan",        label: "Trojan",          icon: "🐴", color: "#ff6b81" },
  { id: "virus",         label: "Virus",           icon: "🧬", color: "#e84393" },
  { id: "ransomware",    label: "Ransomware",      icon: "🔐", color: "#fd79a8" },
  { id: "ddos",          label: "DDoS",            icon: "🌊", color: "#6c5ce7" },
  { id: "phishing",      label: "Phishing",        icon: "🎣", color: "#a29bfe" },
  { id: "side_channel",  label: "Side Channel",    icon: "📡", color: "#00b894" },
  { id: "cache_attack",  label: "Cache Attack",    icon: "💾", color: "#00cec9" },
  { id: "dram_attack",   label: "DRAM Attack",     icon: "🧮", color: "#0984e3" },
  { id: "boot_threat",   label: "Boot Threat",     icon: "⚡", color: "#74b9ff" },
  { id: "ip_threat",     label: "IP Threat",       icon: "🌐", color: "#fdcb6e" },
  { id: "counterfeit",   label: "Counterfeit HW",  icon: "🔧", color: "#ffeaa7" },
  { id: "covert_channel",label: "Covert Channel",  icon: "🕳️", color: "#fab1a0" },
  { id: "apt",           label: "APT",             icon: "🎯", color: "#ff7675" },
];


const sevColor = { CRITICAL:"#ff4757", HIGH:"#ff6348", MEDIUM:"#ffa502", LOW:"#2ed573" };
const statusColor = { ACTIVE:"#ff4757", MITIGATING:"#ffa502", CONTAINED:"#1e90ff", NEUTRALIZED:"#2ed573" };
const alertColors = { SEVERE:"#ff4757", HIGH:"#ff6348", ELEVATED:"#ffa502", GUARDED:"#2ed573" };


// ─── Shared UI helpers ────────────────────────────────────────────────────────

function MiniBar({ value, max, color }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div style={{ width:"100%", height:6, background:"#0a1628", borderRadius:3, overflow:"hidden" }}>
      <div style={{ width:`${pct}%`, height:"100%", background:`linear-gradient(90deg,${color}88,${color})`, borderRadius:3, transition:"width 1s ease" }} />
    </div>
  );
}

function ScanLine() {
  return (
    <div style={{ position:"absolute", top:0, left:0, right:0, height:"100%", pointerEvents:"none", overflow:"hidden", zIndex:1 }}>
      <div style={{ position:"absolute", width:"100%", height:2, background:"linear-gradient(90deg,transparent,#00ff8833,transparent)", animation:"scanDown 6s linear infinite" }} />
      <style>{`@keyframes scanDown { 0%{top:-2px} 100%{top:100%} }`}</style>
    </div>
  );
}

function StatCard({ label, value, sub, color, icon }) {
  return (
    <div style={{ background:"linear-gradient(135deg,#060e1a,#0a1628)", border:"1px solid #0f1d30", borderRadius:6, padding:"10px 12px", position:"relative", overflow:"hidden" }}>
      <div style={{ position:"absolute", top:6, right:8, fontSize:22, opacity:0.15 }}>{icon}</div>
      <div style={{ color:"#4a5568", fontSize:9, textTransform:"uppercase", letterSpacing:1, fontWeight:700 }}>{label}</div>
      <div style={{ color:color||"#ecf0f1", fontSize:22, fontWeight:800, fontFamily:"'JetBrains Mono',monospace", marginTop:2 }}>{value}</div>
      {sub && <div style={{ color:"#636e7b", fontSize:10, marginTop:2 }}>{sub}</div>}
    </div>
  );
}

// ─── Dashboard components ─────────────────────────────────────────────────────

function HexGrid() {
  const [cells, setCells] = useState([]);
  useEffect(() => {
    const arr = [];
    for (let row = 0; row < 6; row++)
      for (let col = 0; col < 10; col++)
        arr.push({ row, col, status: Math.random()>0.15 ? "secure" : Math.random()>0.5 ? "warning" : "breach", pulse: Math.random()*3 });
    setCells(arr);
    const iv = setInterval(() => setCells(prev => prev.map(c => ({ ...c, status: Math.random()>0.12 ? "secure" : Math.random()>0.5 ? "warning" : "breach" }))), 3000);
    return () => clearInterval(iv);
  }, []);

  const hexSize = 18;
  const hexH   = hexSize * Math.sqrt(3);
  return (
    <svg viewBox="0 0 370 190" style={{ width:"100%", height:"100%" }}>
      {cells.map((c, i) => {
        const x = 20 + c.col*(hexSize*1.8) + (c.row%2 ? hexSize*0.9 : 0);
        const y = 16 + c.row*(hexH*0.85);
        const fill   = c.status==="secure" ? "#0a3d2a" : c.status==="warning" ? "#3d2a0a" : "#3d0a0a";
        const stroke = c.status==="secure" ? "#00ff8855" : c.status==="warning" ? "#ffaa0055" : "#ff445755";
        const pts = Array.from({length:6},(_,j)=>{const a=(Math.PI/3)*j-Math.PI/6;return `${x+hexSize*Math.cos(a)},${y+hexSize*Math.sin(a)}`;}).join(" ");
        return (
          <polygon key={i} points={pts} fill={fill} stroke={stroke} strokeWidth="1.2" style={{ transition:"all 1s ease" }}>
            <animate attributeName="opacity" values="0.6;1;0.6" dur={`${2+c.pulse}s`} repeatCount="indefinite"/>
          </polygon>
        );
      })}
    </svg>
  );
}

function ActivityGraph({ threats }) {
  // Build a 48-slot histogram from real threat timestamps
  const now = Date.now();
  const slotMs = (48 * 60 * 60 * 1000) / 48; // 1 hour per slot
  const bins = Array.from({ length: 48 }, () => 0);
  for (const t of threats) {
    const age = now - (t.timestamp || now);
    const slot = Math.floor(age / slotMs);
    if (slot >= 0 && slot < 48) bins[47 - slot]++;
  }
  const max = Math.max(...bins, 1);
  return (
    <svg viewBox="0 0 400 80" style={{ width:"100%", height:80 }}>
      {bins.map((count, i) => {
        const x = (i / 48) * 400, w = 400 / 48 - 1;
        const h = (count / max) * 70;
        return <rect key={i} x={x} y={80 - h} width={w} height={h} fill="#ff475766" rx={1}/>;
      })}
      <line x1="0" y1="79" x2="400" y2="79" stroke="#0f1d30" strokeWidth="0.5"/>
    </svg>
  );
}

function LogConsole({ logs }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [logs]);
  return (
    <div ref={ref} style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, lineHeight:1.6, maxHeight:140, overflowY:"auto", color:"#636e7b", background:"#030810", borderRadius:4, padding:8, border:"1px solid #0a1628" }}>
      {logs.map((l,i) => (
        <div key={i}>
          <span style={{ color:"#2a3a4e" }}>[{l.time}]</span>{" "}
          <span style={{ color:l.color||"#636e7b" }}>{l.msg}</span>
        </div>
      ))}
    </div>
  );
}

function ThreatFeed({ threats, onSelect, selected }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:4, maxHeight:340, overflowY:"auto", paddingRight:4 }}>
      {threats.slice(0,12).map(t => (
        <div key={t.id} onClick={() => onSelect(t)} style={{
          display:"grid", gridTemplateColumns:"32px 1fr auto", alignItems:"center", gap:8, padding:"8px 10px",
          background: selected?.id===t.id ? "#0d2847" : "#060e1a",
          border:`1px solid ${selected?.id===t.id ? "#1e90ff44" : "#0f1d30"}`,
          borderLeft:`3px solid ${sevColor[t.severity]}`,
          borderRadius:4, cursor:"pointer", transition:"all 0.2s", fontSize:12,
        }}>
          <span style={{ fontSize:18, textAlign:"center" }}>{t.type.icon}</span>
          <div>
            <div style={{ color:"#c8d6e5", fontFamily:"'JetBrains Mono',monospace", fontWeight:600 }}>{t.id}</div>
            <div style={{ color:"#636e7b", fontSize:10 }}>{t.type.label} · {t.origin} · {t.zone}</div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontSize:9, fontWeight:700, padding:"2px 6px", borderRadius:3, background:`${sevColor[t.severity]}22`, color:sevColor[t.severity], fontFamily:"'JetBrains Mono',monospace" }}>{t.severity}</div>
            <div style={{ fontSize:9, marginTop:3, color:statusColor[t.status], fontFamily:"'JetBrains Mono',monospace" }}>● {t.status}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ThreatDetail({ threat, onAction }) {
  if (!threat) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100%", color:"#2a3a4e", fontSize:13, fontStyle:"italic" }}>
      Select a threat for analysis
    </div>
  );
  const actions = [
    { label:"🛡️ Deploy Shield",     action:"shield",    color:"#0984e3" },
    { label:"🔒 Isolate Zone",       action:"isolate",   color:"#ffa502" },
    { label:"💥 Neutralize",         action:"neutralize",color:"#ff4757" },
    { label:"🔍 Deep Scan",          action:"scan",      color:"#00b894" },
    { label:"📋 Flag & Report",      action:"report",    color:"#a29bfe" },
    { label:"🧬 Signature Extract",  action:"signature", color:"#fd79a8" },
  ];
  return (
    <div style={{ fontSize:12, color:"#8395a7" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12, paddingBottom:10, borderBottom:"1px solid #0f1d30" }}>
        <span style={{ fontSize:30 }}>{threat.type.icon}</span>
        <div>
          <div style={{ color:"#ecf0f1", fontSize:16, fontWeight:700, fontFamily:"'JetBrains Mono',monospace" }}>{threat.id}</div>
          <div style={{ color:sevColor[threat.severity], fontWeight:600, fontSize:11 }}>{threat.severity} — {threat.type.label}</div>
        </div>
        <div style={{ marginLeft:"auto", padding:"4px 10px", borderRadius:4, background:`${statusColor[threat.status]}18`, color:statusColor[threat.status], fontWeight:700, fontSize:11, fontFamily:"'JetBrains Mono',monospace", border:`1px solid ${statusColor[threat.status]}33` }}>
          {threat.status}
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px 16px", marginBottom:14 }}>
        {[["Origin",threat.origin],["Network Zone",threat.zone],["Source IP",threat.ip],["Port",threat.port],["Confidence",`${threat.confidence}%`],["Packets",threat.packets.toLocaleString()]].map(([k,v]) => (
          <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"3px 0", borderBottom:"1px solid #0a1628" }}>
            <span style={{ color:"#4a5568" }}>{k}</span>
            <span style={{ color:"#c8d6e5", fontFamily:"'JetBrains Mono',monospace" }}>{v}</span>
          </div>
        ))}
      </div>
      <div style={{ marginBottom:8, color:"#4a5568", fontSize:10, textTransform:"uppercase", letterSpacing:1, fontWeight:700 }}>Response Actions</div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:5 }}>
        {actions.map(a => (
          <button key={a.action} onClick={() => onAction(a.action, threat)} style={{ padding:"7px 6px", border:`1px solid ${a.color}33`, borderRadius:4, background:`${a.color}11`, color:a.color, cursor:"pointer", fontSize:10, fontWeight:600, fontFamily:"'JetBrains Mono',monospace", transition:"all 0.2s" }}
            onMouseEnter={e => { e.target.style.background=`${a.color}33`; }}
            onMouseLeave={e => { e.target.style.background=`${a.color}11`; }}>
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function DefensePanel({ defense }) {
  const items = [
    { label:"Firewalls Active",    val:`${defense.firewalls.active}/${defense.firewalls.total}`, max:defense.firewalls.total, cur:defense.firewalls.active, color:"#00b894" },
    { label:"IDS Alerts",          val:`${defense.ids.critical} critical`,                        max:defense.ids.alerts,       cur:defense.ids.critical,    color:"#ffa502" },
    { label:"Honeypots Engaged",   val:`${defense.honeypots.engaged}/${defense.honeypots.deployed}`, max:defense.honeypots.deployed, cur:defense.honeypots.engaged, color:"#6c5ce7" },
    { label:"Pending Patches",     val:`${defense.patches.pending}`,                              max:50,                        cur:defense.patches.pending, color:"#0984e3" },
  ];
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
      {items.map(it => (
        <div key={it.label}>
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, marginBottom:3 }}>
            <span style={{ color:"#636e7b" }}>{it.label}</span>
            <span style={{ color:it.color, fontFamily:"'JetBrains Mono',monospace", fontWeight:600 }}>{it.val}</span>
          </div>
          <MiniBar value={it.cur} max={it.max} color={it.color}/>
        </div>
      ))}
    </div>
  );
}

// ─── Code Editor Panel ────────────────────────────────────────────────────────

const STARTER = {
  python: `#!/usr/bin/env python3
"""
Incident Response Script
Threat: {THREAT_ID}
"""

import subprocess, json, sys
from datetime import datetime

TARGET_IP   = "{IP}"
TARGET_PORT = {PORT}

def analyze_threat():
    print(f"[{datetime.now().isoformat()}] Analyzing {TARGET_IP}:{TARGET_PORT}")
    # TODO: add your detection logic here

def block_ip(ip):
    # Linux iptables example:
    # subprocess.run(["iptables", "-A", "INPUT", "-s", ip, "-j", "DROP"])
    print(f"[BLOCK] {ip}")

def generate_report(findings):
    return json.dumps({"timestamp": datetime.now().isoformat(), "findings": findings}, indent=2)

if __name__ == "__main__":
    analyze_threat()
`,
  bash: `#!/usr/bin/env bash
# Incident Response Script — Threat: {THREAT_ID}
set -euo pipefail

TARGET_IP="{IP}"
TARGET_PORT="{PORT}"
LOG="/var/log/ir-$(date +%Y%m%d-%H%M%S).log"

log() { echo "[$(date -u +%H:%M:%S)] $*" | tee -a "$LOG"; }

block_ip() {
  log "Blocking $1"
  # iptables -A INPUT -s "$1" -j DROP
}

scan_host() {
  log "Scanning $1:$2"
  # nmap -sV -p "$2" "$1"
}

log "Starting IR for $TARGET_IP:$TARGET_PORT"
scan_host "$TARGET_IP" "$TARGET_PORT"
`,
  powershell: `# Incident Response Script — Threat: {THREAT_ID}
param([string]$TargetIP = "{IP}", [int]$TargetPort = {PORT})

function Write-IRLog {
  param($Message, $Level = "INFO")
  $ts = Get-Date -Format "HH:mm:ss"
  Write-Host "[$ts][$Level] $Message" -ForegroundColor $(if($Level -eq "WARN"){"Yellow"} else{"Cyan"})
}

function Block-IPAddress {
  param($IP)
  Write-IRLog "Blocking $IP" -Level "WARN"
  # New-NetFirewallRule -Name "IR_Block_$IP" -Direction Inbound -RemoteAddress $IP -Action Block
}

Write-IRLog "Starting IR for $TargetIP\`:$TargetPort"
Block-IPAddress $TargetIP
`,
  javascript: `// Incident Response Script — Threat: {THREAT_ID}
const net = require("net");

const TARGET_IP   = "{IP}";
const TARGET_PORT = {PORT};

function log(msg) {
  console.log(\`[\${new Date().toISOString()}] \${msg}\`);
}

async function probPort(ip, port, timeout = 3000) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    sock.setTimeout(timeout);
    sock.connect(port, ip, () => { sock.destroy(); resolve(true); });
    sock.on("error",   () => resolve(false));
    sock.on("timeout", () => { sock.destroy(); resolve(false); });
  });
}

(async () => {
  log(\`Probing \${TARGET_IP}:\${TARGET_PORT}\`);
  const open = await probPort(TARGET_IP, TARGET_PORT);
  log(\`Port \${TARGET_PORT} is \${open ? "OPEN" : "CLOSED"}\`);
})();
`,
  yaml: `# Firewall / detection rule — Threat: {THREAT_ID}
rule:
  id: IR-{THREAT_ID}
  name: Block {TYPE} from {ORIGIN}
  severity: {SEVERITY}
  action: block

match:
  src_ip: "{IP}"
  dst_port: {PORT}
  protocol: tcp

response:
  - block_traffic
  - alert_soc
  - capture_pcap: true

metadata:
  created: now
  analyst: AI-SOC
  threat_actor: "{ORIGIN}"
  mitre_attack: T1071
`,
};

function fillTemplate(tpl, threat) {
  if (!threat) return tpl;
  return tpl
    .replace(/{THREAT_ID}/g,  threat.id)
    .replace(/{IP}/g,          threat.ip)
    .replace(/{PORT}/g,        String(threat.port))
    .replace(/{TYPE}/g,        threat.type.label)
    .replace(/{ORIGIN}/g,      threat.origin)
    .replace(/{SEVERITY}/g,    threat.severity);
}

// ─── Claude streaming helper (via server /api/chat) ──────────────────────────

async function streamCompletion({ token, messages, onDelta, onDone, onError }) {
  const message = messages.filter(m => m.role !== "system").map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n\n");
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let full = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const line of decoder.decode(value).split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (raw === "[DONE]") { onDone(full); return; }
        try {
          const parsed = JSON.parse(raw);
          if (parsed.error) throw new Error(parsed.error);
          if (parsed.delta) { full += parsed.delta; onDelta(parsed.delta, full); }
        } catch (e) { if (e.message && !e.message.startsWith("JSON")) throw e; }
      }
    }
    onDone(full);
  } catch (e) {
    onError(e.message);
  }
}

// ─── AI Chat Panel ────────────────────────────────────────────────────────────

function AIChat({ selectedThreat, token, addLog }) {
  const [messages, setMessages] = useState([{
    role: "assistant",
    content: "I'm your AI cybersecurity analyst (powered by ChatGPT). Select a threat and ask me to analyze it, or ask about incident response, threat actors, firewall rules, CVEs, or mitigation strategies.",
  }]);
  const [input,   setInput]   = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role: "user", content: input.trim() };
    let fullMsgs = [...messages, userMsg];
    if (selectedThreat) {
      fullMsgs = [
        { role: "user", content: `Context — currently selected threat:\n- ID: ${selectedThreat.id}\n- Type: ${selectedThreat.type.label}\n- Severity: ${selectedThreat.severity}\n- Origin: ${selectedThreat.origin} → ${selectedThreat.zone}\n- IP: ${selectedThreat.ip}:${selectedThreat.port}\n- Confidence: ${selectedThreat.confidence}%` },
        ...messages.slice(1),
        userMsg,
      ];
    }
    setMessages(prev => [...prev, userMsg, { role: "assistant", content: "" }]);
    setInput("");
    setLoading(true);

    await streamCompletion({
      token,
      messages: fullMsgs,
      onDelta: (_, full) => setMessages(prev => { const u = [...prev]; u[u.length - 1] = { role: "assistant", content: full }; return u; }),
      onDone:  ()        => { setLoading(false); addLog("AI analyst responded", "#00b894"); },
      onError: (msg)     => { setMessages(prev => { const u = [...prev]; u[u.length - 1] = { role: "assistant", content: `Error: ${msg}` }; return u; }); setLoading(false); },
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 8 }}>
      {selectedThreat && (
        <div style={{ padding: "5px 10px", background: "#0a1628", border: "1px solid #1e90ff33", borderRadius: 4, fontSize: 10, color: "#1e90ff", fontFamily: "'JetBrains Mono',monospace", flexShrink: 0 }}>
          Context: {selectedThreat.id} · {selectedThreat.type.label} · {selectedThreat.severity}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, padding: "2px 2px 4px" }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "88%", padding: "8px 12px",
              borderRadius: m.role === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
              background: m.role === "user" ? "#0984e31a" : "#0a1628",
              border: `1px solid ${m.role === "user" ? "#0984e344" : "#0f1d30"}`,
              fontSize: 12, lineHeight: 1.65,
              color: m.role === "user" ? "#74b9ff" : "#c8d6e5",
              fontFamily: "'JetBrains Mono',monospace",
              whiteSpace: "pre-wrap", wordBreak: "break-word",
            }}>
              {m.content || (loading && i === messages.length - 1 ? <span style={{ opacity: 0.4 }}>▊</span> : "")}
            </div>
          </div>
        ))}
        <div ref={endRef}/>
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder={selectedThreat ? `Ask about ${selectedThreat.id}…` : "Ask about threats, tactics, mitigations…"}
          rows={2}
          style={{ flex: 1, padding: "8px 12px", background: "#060e1a", border: "1px solid #0f1d30", borderRadius: 4, color: "#c8d6e5", fontSize: 12, fontFamily: "'JetBrains Mono',monospace", outline: "none", resize: "none", lineHeight: 1.5 }}
        />
        <button onClick={send} disabled={loading || !input.trim()} style={{ padding: "8px 14px", background: loading ? "#0a1628" : "#0984e31a", border: "1px solid #0984e344", borderRadius: 4, color: loading ? "#4a5568" : "#0984e3", cursor: loading ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 700, alignSelf: "stretch" }}>
          {loading ? "…" : "↑"}
        </button>
      </div>
    </div>
  );
}

function CodeEditorPanel({ selectedThreat, token, addLog }) {
  const [language,   setLanguage]   = useState("python");
  const [code,       setCode]       = useState(() => fillTemplate(STARTER.python, null));
  const [output,     setOutput]     = useState("");
  const [outputType, setOutputType] = useState("ai"); // "ai" | "deploy"
  const [loading,    setLoading]    = useState(false);
  const [deploying,  setDeploying]  = useState(false);
  const [jobStatus,  setJobStatus]  = useState(null); // null | "pending" | "running" | "done" | "error"
  const prevLang   = useRef("python");
  const pollRef    = useRef(null);

  const EXECUTABLE = ["python","bash","powershell","javascript"];
  const canDeploy  = selectedThreat?.deviceId && EXECUTABLE.includes(language);

  useEffect(() => {
    if (language !== prevLang.current) {
      prevLang.current = language;
      setCode(fillTemplate(STARTER[language] || "// write your code here\n", selectedThreat));
      setOutput(""); setJobStatus(null);
    }
  }, [language]);

  useEffect(() => {
    if (selectedThreat) {
      setCode(fillTemplate(STARTER[language] || "// write your code here\n", selectedThreat));
    }
  }, [selectedThreat]);

  // Clean up polling on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const reviewCode = async () => {
    if (!code.trim() || loading) return;
    setLoading(true); setOutputType("ai");
    setOutput("AI reviewing your code…\n\n");
    const ctx = selectedThreat
      ? `Threat: ${selectedThreat.type.label} (${selectedThreat.severity}) from ${selectedThreat.origin} at ${selectedThreat.ip}:${selectedThreat.port}`
      : "";
    await streamCompletion({
      token,
      messages: [
        { role:"system", content:"You are an expert cybersecurity engineer. Review security scripts for correctness, security issues, and effectiveness. Be concise and technical." },
        { role:"user", content:`Review this ${language} IR script:\n${ctx}\n\`\`\`${language}\n${code}\n\`\`\`\nCover: 1) bugs 2) security gaps 3) improvements 4) additions` },
      ],
      onDelta: (_, full) => setOutput(full),
      onDone:  ()        => { setLoading(false); addLog("AI code review completed","#00b894"); },
      onError: (msg)     => { setOutput(`Error: ${msg}`); setLoading(false); },
    });
  };

  const generateScript = async () => {
    if (loading) return;
    setLoading(true); setOutputType("ai"); setOutput("AI generating script…");
    const ctx = selectedThreat
      ? `${selectedThreat.type.label} (${selectedThreat.severity}) from ${selectedThreat.origin} on ${selectedThreat.zone} — ${selectedThreat.ip}:${selectedThreat.port}`
      : "generic cybersecurity incident";
    await streamCompletion({
      token,
      messages: [
        { role:"system", content:`You are an expert cybersecurity engineer. Generate production-ready ${language} incident response scripts. Return ONLY raw code, no markdown fences, no explanation.` },
        { role:"user", content:`Generate a ${language} IR script for: ${ctx}. Include detection, logging, and automated mitigation.` },
      ],
      onDelta: (_, full) => setCode(full),
      onDone:  ()        => { setLoading(false); setOutput(""); addLog(`AI generated ${language} IR script`,"#6c5ce7"); },
      onError: (msg)     => { setOutput(`Error: ${msg}`); setLoading(false); },
    });
  };

  const deployScript = async () => {
    if (!canDeploy || deploying || !code.trim()) return;
    setDeploying(true); setOutputType("deploy");
    setOutput("Deploying to device…\n"); setJobStatus("pending");

    try {
      const res = await fetch(`/api/fleet/${selectedThreat.deviceId}/exec`, {
        method: "POST",
        headers: { "Content-Type":"application/json", Authorization:`Bearer ${token}` },
        body: JSON.stringify({ script:code, language, threatId:selectedThreat.id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const { jobId } = await res.json();
      addLog(`Script deployed to ${selectedThreat.zone} — job ${jobId}`,"#fd79a8");

      // Poll for result
      pollRef.current = setInterval(async () => {
        try {
          const r = await fetch(`/api/jobs/${jobId}`, { headers: { Authorization:`Bearer ${token}` } });
          if (!r.ok) return;
          const job = await r.json();
          setJobStatus(job.status);
          if (job.status === "running") setOutput("Running on device…\n");
          if (job.status === "done" || job.status === "error") {
            clearInterval(pollRef.current);
            setDeploying(false);
            setOutput(job.output || "(no output)");
            addLog(`Job ${jobId} finished — exit ${job.exitCode}`, job.exitCode === 0 ? "#2ed573" : "#ff4757");
          }
        } catch {}
      }, 2_000);
    } catch (e) {
      setOutput(`Deploy failed: ${e.message}`);
      setJobStatus("error"); setDeploying(false);
    }
  };

  const copyCode = () => navigator.clipboard.writeText(code).then(() => addLog("Code copied to clipboard","#a29bfe"));

  const languages = ["python","bash","powershell","javascript","yaml","json"];
  const jobColors = { pending:"#ffa502", running:"#0984e3", done:"#2ed573", error:"#ff4757" };

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", gap:8 }}>
      {/* Toolbar row 1 */}
      <div style={{ display:"flex", gap:6, alignItems:"center", flexShrink:0, flexWrap:"wrap" }}>
        <select value={language} onChange={e => setLanguage(e.target.value)} style={{ padding:"4px 8px", background:"#060e1a", border:"1px solid #0f1d30", borderRadius:4, color:"#c8d6e5", fontSize:11, fontFamily:"'JetBrains Mono',monospace" }}>
          {languages.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <button onClick={generateScript} disabled={loading||deploying} title="AI generates a script for the selected threat" style={{ padding:"4px 10px", background:"#6c5ce71a", border:"1px solid #6c5ce744", borderRadius:4, color:"#6c5ce7", cursor:(loading||deploying)?"not-allowed":"pointer", fontSize:11, fontWeight:600 }}>
          {loading?"…":"⚡ Generate"}
        </button>
        <button onClick={reviewCode} disabled={loading||deploying} title="AI reviews your code" style={{ padding:"4px 10px", background:"#00b8941a", border:"1px solid #00b89444", borderRadius:4, color:"#00b894", cursor:(loading||deploying)?"not-allowed":"pointer", fontSize:11, fontWeight:600 }}>
          {loading?"…":"🔍 Review"}
        </button>
        <button onClick={copyCode} style={{ marginLeft:"auto", padding:"4px 10px", background:"#0984e31a", border:"1px solid #0984e344", borderRadius:4, color:"#0984e3", cursor:"pointer", fontSize:11, fontWeight:600 }}>
          Copy
        </button>
      </div>

      {/* Deploy row — only shown when a real device is selected */}
      {selectedThreat?.deviceId && (
        <div style={{ display:"flex", gap:6, alignItems:"center", padding:"6px 8px", background:"#0a1628", border:"1px solid #fd79a822", borderRadius:4, flexShrink:0 }}>
          <span style={{ fontSize:10, color:"#4a5568", fontFamily:"'JetBrains Mono',monospace", flex:1 }}>
            Target: <span style={{ color:"#fd79a8" }}>{selectedThreat.zone}</span>
            <span style={{ color:"#4a5568" }}> · {selectedThreat.ip}</span>
          </span>
          {!EXECUTABLE.includes(language) && (
            <span style={{ fontSize:9, color:"#4a5568", fontFamily:"'JetBrains Mono',monospace" }}>
              switch to py/bash/ps1/js to deploy
            </span>
          )}
          <button
            onClick={deployScript}
            disabled={!canDeploy || deploying || loading}
            title={canDeploy ? `Run on ${selectedThreat.zone}` : "Select an executable language to deploy"}
            style={{
              padding:"5px 14px", borderRadius:4, fontSize:11, fontWeight:700,
              fontFamily:"'JetBrains Mono',monospace",
              background: canDeploy && !deploying ? "#fd79a822" : "#1a1a2a",
              border:`1px solid ${canDeploy && !deploying ? "#fd79a844" : "#2a2a3a"}`,
              color: canDeploy && !deploying ? "#fd79a8" : "#4a5568",
              cursor: canDeploy && !deploying ? "pointer" : "not-allowed",
            }}
          >
            {deploying ? `${jobStatus || "pending"}…` : "🚀 Deploy & Run"}
          </button>
          {jobStatus && (
            <span style={{ fontSize:9, color: jobColors[jobStatus] || "#636e7b", fontFamily:"'JetBrains Mono',monospace", fontWeight:700 }}>
              ● {jobStatus.toUpperCase()}
            </span>
          )}
        </div>
      )}

      {/* Monaco */}
      <div style={{ flex:output?2:1, minHeight:0, border:"1px solid #0f1d30", borderRadius:4, overflow:"hidden" }}>
        <Editor
          height="100%"
          language={language === "bash" ? "shell" : language}
          value={code}
          onChange={v => setCode(v||"")}
          theme="vs-dark"
          options={{ fontSize:12, minimap:{enabled:false}, scrollBeyondLastLine:false, lineNumbers:"on", fontFamily:"'JetBrains Mono',monospace", padding:{top:8}, wordWrap:"on" }}
        />
      </div>

      {/* Output panel */}
      {output && (
        <div style={{ flex:1, minHeight:0, overflowY:"auto", padding:10, background:"#030810", border:`1px solid ${outputType==="deploy" ? "#fd79a822" : "#0a1628"}`, borderRadius:4, fontSize:11, fontFamily:"'JetBrains Mono',monospace", whiteSpace:"pre-wrap", lineHeight:1.65 }}>
          <div style={{ color: outputType==="deploy" ? "#fd79a8" : "#4a5568", fontSize:9, textTransform:"uppercase", letterSpacing:1, marginBottom:6, fontWeight:700, display:"flex", justifyContent:"space-between" }}>
            <span>{outputType === "deploy" ? "Execution Output" : "AI Review"}</span>
            <span style={{ cursor:"pointer", color:"#4a5568" }} onClick={() => { setOutput(""); setJobStatus(null); }}>✕ clear</span>
          </div>
          <span style={{ color: outputType==="deploy" && jobStatus==="error" ? "#ff4757" : "#c8d6e5" }}>{output}</span>
        </div>
      )}
    </div>
  );
}

// ─── Real data helpers ────────────────────────────────────────────────────────

// Ports that are genuinely suspicious in established outbound connections
const SUSPICIOUS_PORT_MAP = {
  22:    { typeId:"malware",        label:"SSH Brute Force",  severity:"HIGH"     },
  23:    { typeId:"trojan",         label:"Telnet Probe",     severity:"HIGH"     },
  25:    { typeId:"phishing",       label:"SMTP Relay",       severity:"MEDIUM"   },
  445:   { typeId:"ransomware",     label:"SMB Attack",       severity:"CRITICAL" },
  1433:  { typeId:"apt",            label:"MSSQL Probe",      severity:"HIGH"     },
  3389:  { typeId:"apt",            label:"RDP Attack",       severity:"CRITICAL" },
  4444:  { typeId:"malware",        label:"Meterpreter C2",   severity:"CRITICAL" },
  1337:  { typeId:"apt",            label:"Elite C2 Channel", severity:"CRITICAL" },
  31337: { typeId:"trojan",         label:"Back Orifice",     severity:"CRITICAL" },
  6666:  { typeId:"ddos",           label:"IRC Botnet",       severity:"HIGH"     },
  6667:  { typeId:"ddos",           label:"IRC Botnet",       severity:"HIGH"     },
  8888:  { typeId:"covert_channel", label:"Alt HTTP Tunnel",  severity:"MEDIUM"   },
  9090:  { typeId:"covert_channel", label:"Proxy Tunnel",     severity:"MEDIUM"   },
};

// Private/loopback ranges — skip these, they're not external threats
function isPrivateIP(ip) {
  if (!ip || ip === "127.0.0.1" || ip === "::1") return true;
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4) return true;
  return (
    parts[0] === 10 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    parts[0] === 127 ||
    parts[0] === 169
  );
}

let _threatIdCounter = 1;
function connectionToThreat(conn, device) {
  const susp = SUSPICIOUS_PORT_MAP[conn.port];
  const isExternal = !isPrivateIP(conn.ip);
  const geo = conn.geo;

  // Flag if: suspicious port, OR high-risk geo, OR TOR/proxy, OR beaconing, OR any external
  const isBeaconing = (device.beaconing || []).some(b => b.ip === conn.ip);
  if (!susp && !geo?.highRisk && !geo?.tor && !geo?.proxy && !isBeaconing && !isExternal) return null;

  // Escalate severity based on geo intelligence
  let baseSeverity = susp?.severity || (isExternal ? "LOW" : "MEDIUM");
  if (geo?.tor)      baseSeverity = "CRITICAL";
  else if (geo?.proxy && susp) baseSeverity = "CRITICAL";
  else if (geo?.highRisk && susp) baseSeverity = "CRITICAL";
  else if (geo?.highRisk) baseSeverity = "HIGH";
  else if (isBeaconing) baseSeverity = "HIGH";

  // Pick type
  let typeId = susp?.typeId || "ip_threat";
  if (geo?.tor)   typeId = "covert_channel";
  if (isBeaconing && !susp) typeId = "apt";

  const typeInfo = THREAT_TYPES.find(t => t.id === typeId) || THREAT_TYPES[0];

  // Build origin label
  const countryFlag = geo?.countryCode
    ? String.fromCodePoint(...[...geo.countryCode.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65))
    : null;
  const originLabel = geo
    ? `${countryFlag ? countryFlag + " " : ""}${geo.country}${geo.tor ? " [TOR]" : geo.proxy ? " [VPN]" : ""}`
    : isExternal ? `EXT-${conn.ip.split(".")[0]}` : "INTERNAL";

  return {
    id:         `THR-${String(_threatIdCounter++).padStart(5, "0")}`,
    type:       typeInfo,
    severity:   baseSeverity,
    status:     "ACTIVE",
    origin:     originLabel,
    zone:       device.name || "INTERNAL",
    ip:         conn.ip,
    port:       conn.port,
    timestamp:  Date.now(),
    confidence: susp ? (geo?.tor || geo?.proxy ? 98 : 90) : geo?.highRisk ? 75 : isBeaconing ? 85 : 55,
    packets:    0,
    deviceId:   device.id,
    real:       true,
    geo,
    isBeaconing,
  };
}

function fleetToDefense(fleet, summary) {
  const devices    = fleet.devices || [];
  const onlineAgents = devices.filter(d => d.online && d.deviceCategory === "agent");
  const totalConns = onlineAgents.reduce((s, d) => s + (d.net?.length || 0), 0);
  const suspConns  = summary.suspiciousConnections || 0;
  const avgUptime  = onlineAgents.length
    ? (onlineAgents.reduce((s, d) => s + (d.sys?.uptime || 0), 0) / onlineAgents.length)
    : 0;
  const uptimePct  = avgUptime > 0
    ? Math.min(99.999, 100 - (1 / (avgUptime / 3600))).toFixed(3)
    : (99 + Math.random() * 0.99).toFixed(3);

  return {
    firewalls:  { active: summary.online || 0, total: Math.max(summary.total || 1, 1), blocked: totalConns * 100 },
    ids:        { alerts: totalConns, critical: suspConns },
    honeypots:  { deployed: 8, engaged: Math.min(suspConns, 4) },
    patches:    { pending: Math.max(0, 5 - (summary.online || 0)), applied: 200 + (summary.total || 0) * 3 },
    encryption: { tunnels: onlineAgents.length * 5, strength: "AES-256-GCM" },
    aiScans:    totalConns * 50,
    threatsNeutralized: 0,
    uptime:     uptimePct,
  };
}

// ─── Full-page Code Editor (top-level tab) ───────────────────────────────────

function FullCodeEditor({ token, addLog }) {
  const [devices,    setDevices]    = useState([]);
  const [deviceId,   setDeviceId]   = useState("");
  const [language,   setLanguage]   = useState("python");
  const [code,       setCode]       = useState(STARTER.python);
  const [output,     setOutput]     = useState("");
  const [outputType, setOutputType] = useState("ai");
  const [loading,    setLoading]    = useState(false);
  const [deploying,  setDeploying]  = useState(false);
  const [jobStatus,  setJobStatus]  = useState(null);
  const prevLang = useRef("python");
  const pollRef  = useRef(null);

  const EXECUTABLE = ["python", "bash", "powershell", "javascript"];
  const canDeploy  = !!deviceId && EXECUTABLE.includes(language);
  const selectedDevice = devices.find(d => d.id === deviceId);

  useEffect(() => {
    if (!token) return;
    const load = () =>
      fetch("/api/fleet", { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(data => setDevices((data.devices || []).filter(d => d.online && d.deviceCategory !== "network")))
        .catch(() => {});
    load();
    const iv = setInterval(load, 15_000);
    return () => clearInterval(iv);
  }, [token]);

  useEffect(() => {
    if (language !== prevLang.current) {
      prevLang.current = language;
      setCode(STARTER[language] || "// write your code here\n");
      setOutput(""); setJobStatus(null);
    }
  }, [language]);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const generateScript = async () => {
    if (loading) return;
    setLoading(true); setOutputType("ai"); setOutput("AI generating script…");
    await streamCompletion({
      token,
      messages: [
        { role: "system", content: `You are an expert cybersecurity engineer. Generate production-ready ${language} incident response scripts. Return ONLY raw code, no markdown fences, no explanation.` },
        { role: "user",   content: `Generate a ${language} incident response script${selectedDevice ? ` for device: ${selectedDevice.name}` : ""}. Include detection, logging, and automated mitigation.` },
      ],
      onDelta: (_, full) => setCode(full),
      onDone:  ()        => { setLoading(false); setOutput(""); addLog(`AI generated ${language} IR script`, "#6c5ce7"); },
      onError: (msg)     => { setOutput(`Error: ${msg}`); setLoading(false); },
    });
  };

  const reviewCode = async () => {
    if (!code.trim() || loading) return;
    setLoading(true); setOutputType("ai"); setOutput("AI reviewing your code…\n\n");
    await streamCompletion({
      token,
      messages: [
        { role: "system", content: "You are an expert cybersecurity engineer. Review security scripts for correctness, security issues, and effectiveness. Be concise and technical." },
        { role: "user",   content: `Review this ${language} IR script:\n\`\`\`${language}\n${code}\n\`\`\`\nCover: 1) bugs 2) security gaps 3) improvements` },
      ],
      onDelta: (_, full) => setOutput(full),
      onDone:  ()        => { setLoading(false); addLog("AI code review completed", "#00b894"); },
      onError: (msg)     => { setOutput(`Error: ${msg}`); setLoading(false); },
    });
  };

  const deployScript = async () => {
    if (!canDeploy || deploying || !code.trim()) return;
    setDeploying(true); setOutputType("deploy");
    setOutput("Deploying to device…\n"); setJobStatus("pending");
    try {
      const res = await fetch(`/api/fleet/${deviceId}/exec`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ script: code, language }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`); }
      const { jobId } = await res.json();
      addLog(`Script deployed to ${selectedDevice?.name || deviceId} — job ${jobId}`, "#fd79a8");
      pollRef.current = setInterval(async () => {
        try {
          const r = await fetch(`/api/jobs/${jobId}`, { headers: { Authorization: `Bearer ${token}` } });
          if (!r.ok) return;
          const job = await r.json();
          setJobStatus(job.status);
          if (job.status === "running") setOutput("Running on device…\n");
          if (job.status === "done" || job.status === "error") {
            clearInterval(pollRef.current);
            setDeploying(false);
            setOutput(job.output || "(no output)");
            addLog(`Job ${jobId} finished — exit ${job.exitCode}`, job.exitCode === 0 ? "#2ed573" : "#ff4757");
          }
        } catch {}
      }, 2_000);
    } catch (e) {
      setOutput(`Deploy failed: ${e.message}`); setJobStatus("error"); setDeploying(false);
    }
  };

  const jobColors = { pending: "#ffa502", running: "#0984e3", done: "#2ed573", error: "#ff4757" };
  const languages = ["python", "bash", "powershell", "javascript", "yaml", "json"];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: 20, gap: 10, background: "#040a14" }}>
      {/* Toolbar */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0, flexWrap: "wrap" }}>
        {/* Device picker */}
        <select
          value={deviceId}
          onChange={e => setDeviceId(e.target.value)}
          style={{ padding: "6px 10px", background: "#060e1a", border: "1px solid #0f1d30", borderRadius: 4, color: deviceId ? "#fd79a8" : "#4a5568", fontSize: 11, fontFamily: "'JetBrains Mono',monospace", minWidth: 200 }}
        >
          <option value="">— Select target device —</option>
          {devices.map(d => <option key={d.id} value={d.id}>{d.name} ({d.sys?.platform || "unknown"})</option>)}
        </select>

        <div style={{ width: 1, height: 24, background: "#0f1d30" }}/>

        {/* Language picker */}
        <select value={language} onChange={e => setLanguage(e.target.value)} style={{ padding: "6px 10px", background: "#060e1a", border: "1px solid #0f1d30", borderRadius: 4, color: "#c8d6e5", fontSize: 11, fontFamily: "'JetBrains Mono',monospace" }}>
          {languages.map(l => <option key={l} value={l}>{l}</option>)}
        </select>

        <div style={{ width: 1, height: 24, background: "#0f1d30" }}/>

        <button onClick={generateScript} disabled={loading || deploying} style={{ padding: "6px 14px", background: "#6c5ce71a", border: "1px solid #6c5ce744", borderRadius: 4, color: "#6c5ce7", cursor: (loading || deploying) ? "not-allowed" : "pointer", fontSize: 11, fontWeight: 700 }}>
          {loading ? "…" : "⚡ Generate"}
        </button>
        <button onClick={reviewCode} disabled={loading || deploying} style={{ padding: "6px 14px", background: "#00b8941a", border: "1px solid #00b89444", borderRadius: 4, color: "#00b894", cursor: (loading || deploying) ? "not-allowed" : "pointer", fontSize: 11, fontWeight: 700 }}>
          {loading ? "…" : "🔍 Review"}
        </button>
        <button onClick={() => navigator.clipboard.writeText(code).then(() => addLog("Code copied", "#a29bfe"))} style={{ padding: "6px 14px", background: "#0984e31a", border: "1px solid #0984e344", borderRadius: 4, color: "#0984e3", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
          Copy
        </button>

        {/* Deploy button */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {!EXECUTABLE.includes(language) && deviceId && (
            <span style={{ fontSize: 10, color: "#4a5568", fontFamily: "'JetBrains Mono',monospace" }}>switch to py/bash/ps1/js to deploy</span>
          )}
          {jobStatus && (
            <span style={{ fontSize: 10, color: jobColors[jobStatus], fontFamily: "'JetBrains Mono',monospace", fontWeight: 700 }}>● {jobStatus.toUpperCase()}</span>
          )}
          <button
            onClick={deployScript}
            disabled={!canDeploy || deploying || loading}
            style={{
              padding: "6px 18px", borderRadius: 4, fontSize: 12, fontWeight: 700,
              fontFamily: "'JetBrains Mono',monospace",
              background: canDeploy && !deploying ? "#fd79a822" : "#1a1a2a",
              border: `1px solid ${canDeploy && !deploying ? "#fd79a844" : "#2a2a3a"}`,
              color: canDeploy && !deploying ? "#fd79a8" : "#4a5568",
              cursor: canDeploy && !deploying ? "pointer" : "not-allowed",
            }}
          >
            {deploying ? `${jobStatus || "pending"}…` : "🚀 Deploy & Run"}
          </button>
        </div>
      </div>

      {/* Editor + output */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ flex: output ? 2 : 1, minHeight: 0, border: "1px solid #0f1d30", borderRadius: 4, overflow: "hidden" }}>
          <Editor
            height="100%"
            language={language === "bash" ? "shell" : language}
            value={code}
            onChange={v => setCode(v || "")}
            theme="vs-dark"
            options={{ fontSize: 13, minimap: { enabled: true }, scrollBeyondLastLine: false, lineNumbers: "on", fontFamily: "'JetBrains Mono',monospace", padding: { top: 12 }, wordWrap: "on" }}
          />
        </div>
        {output && (
          <div style={{ flex: 1, minHeight: 100, maxHeight: 280, overflowY: "auto", padding: 12, background: "#030810", border: `1px solid ${outputType === "deploy" ? "#fd79a822" : "#0a1628"}`, borderRadius: 4, fontSize: 12, fontFamily: "'JetBrains Mono',monospace", whiteSpace: "pre-wrap", lineHeight: 1.65 }}>
            <div style={{ color: outputType === "deploy" ? "#fd79a8" : "#4a5568", fontSize: 9, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, fontWeight: 700, display: "flex", justifyContent: "space-between" }}>
              <span>{outputType === "deploy" ? "Execution Output" : "AI Review"}</span>
              <span style={{ cursor: "pointer" }} onClick={() => { setOutput(""); setJobStatus(null); }}>✕ clear</span>
            </div>
            <span style={{ color: outputType === "deploy" && jobStatus === "error" ? "#ff4757" : "#c8d6e5" }}>{output}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CyberDefenseCommand({ token, onLogout }) {
  const [mainTab,     setMainTab]     = useState("dashboard");
  const [threats,     setThreats]     = useState([]);
  const [summary,     setSummary]     = useState({});
  const [defense,     setDefense]     = useState({ firewalls:{active:0,total:0,blocked:0}, ids:{alerts:0,critical:0}, honeypots:{deployed:0,engaged:0}, patches:{pending:0,applied:0}, encryption:{tunnels:0,strength:"AES-256-GCM"}, aiScans:0, threatsNeutralized:0, uptime:"—" });
  const [selected,    setSelected]    = useState(null);
  const [logs,        setLogs]        = useState([]);
  const [clock,       setClock]       = useState(new Date());
  const [alertLevel,  setAlertLevel]  = useState("GUARDED");
  const [rightTab,    setRightTab]    = useState("chat");
  const [panelOpen,   setPanelOpen]   = useState(true);
  const [liveDevices, setLiveDevices] = useState(0);
  const [agentReady,  setAgentReady]  = useState(false);
  const prevConnKeys = useRef(new Set());

  const addLog = useCallback((msg, color) => {
    const time = new Date().toTimeString().slice(0,8);
    setLogs(prev => [...prev.slice(-60), { time, msg, color }]);
  }, []);

  // ── Real fleet polling ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;

    const fetchFleet = async () => {
      try {
        const [fleetRes, summaryRes] = await Promise.all([
          fetch("/api/fleet",         { headers: { Authorization:`Bearer ${token}` } }),
          fetch("/api/fleet/summary", { headers: { Authorization:`Bearer ${token}` } }),
        ]);
        if (!fleetRes.ok) return;

        const fleetData   = await fleetRes.json();
        const summaryData = await summaryRes.json();
        const devices     = fleetData.devices || [];

        setAgentReady(devices.length > 0);
        setLiveDevices(summaryData.online || 0);
        setDefense(fleetToDefense(fleetData, summaryData));
        setAlertLevel(summaryData.alertLevel || "GUARDED");
        setSummary(summaryData);

        // Build threats from real connections
        const realThreats = [];
        const newConnKeys = new Set();
        for (const device of devices) {
          if (!device.online) continue;
          for (const conn of (device.net || [])) {
            const key = `${device.id}:${conn.ip}:${conn.port}`;
            newConnKeys.add(key);
            const threat = connectionToThreat(conn, device);
            if (!threat) continue;
            realThreats.push(threat);
            if (!prevConnKeys.current.has(key)) {
              addLog(
                `LIVE: ${threat.type.label} on ${device.name} → ${conn.ip}:${conn.port} [${threat.severity}]`,
                sevColor[threat.severity]
              );
            }
          }
        }
        prevConnKeys.current = newConnKeys;

        setThreats(prev => {
          const actioned = prev.filter(t => ["NEUTRALIZED","CONTAINED"].includes(t.status));
          return [...realThreats, ...actioned].slice(0, 50);
        });

        addLog(
          `Fleet sync: ${summaryData.online}/${summaryData.total} online · ${summaryData.suspiciousConnections} suspicious`,
          "#00b894"
        );
      } catch { /* server offline */ }
    };

    fetchFleet();
    const iv = setInterval(fetchFleet, 15_000);
    return () => clearInterval(iv);
  }, [token, addLog]);

  // Clock
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 5000);
    return () => clearInterval(t);
  }, []);

  const handleAction = (action, threat) => {
    const map = {
      shield:    ["Deploying adaptive shield",         "#0984e3"],
      isolate:   ["Isolating network zone",            "#ffa502"],
      neutralize:["Executing neutralization protocol", "#ff4757"],
      scan:      ["Initiating deep AI-assisted scan",  "#00b894"],
      report:    ["Flagging for analyst review",       "#a29bfe"],
      signature: ["Extracting threat signature to DB", "#fd79a8"],
    };
    const [msg, color] = map[action] || ["Action executed","#636e7b"];
    addLog(`${msg}: ${threat.id} (${threat.type.label})`, color);
    const statusMap = { neutralize:"NEUTRALIZED", isolate:"CONTAINED", shield:"MITIGATING", scan:"MITIGATING" };
    if (statusMap[action]) {
      const ns = statusMap[action];
      setThreats(prev => prev.map(t => t.id===threat.id ? {...t, status:ns} : t));
      setSelected(prev => prev?.id===threat.id ? {...prev, status:ns} : prev);
    }
  };

  const activeCrit    = threats.filter(t => t.severity==="CRITICAL" && t.status==="ACTIVE").length;
  const activeThreats = threats.filter(t => t.status==="ACTIVE").length;
  const mitigating    = threats.filter(t => t.status==="MITIGATING").length;
  const neutralized   = threats.filter(t => t.status==="NEUTRALIZED").length;

  const tabBtn = (id, label) => (
    <button onClick={() => setRightTab(id)} style={{
      flex:1, padding:"8px 0", background:"transparent",
      border:"none", borderBottom:`2px solid ${rightTab===id ? "#0984e3" : "transparent"}`,
      color: rightTab===id ? "#0984e3" : "#4a5568",
      cursor:"pointer", fontSize:11, fontWeight:700,
      fontFamily:"'JetBrains Mono',monospace", letterSpacing:1,
      textTransform:"uppercase", transition:"all 0.2s",
    }}>
      {label}
    </button>
  );

  return (
    <div style={{ display:"flex", height:"100vh", background:"#040a14", color:"#c8d6e5", fontFamily:"'Segoe UI','Helvetica Neue',sans-serif", overflow:"hidden" }}>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700;800&family=Orbitron:wght@700;900&display=swap" rel="stylesheet"/>
      <style>{`
        @keyframes alertPulse { 0%,100%{box-shadow:0 0 5px ${alertColors[alertLevel]}44} 50%{box-shadow:0 0 20px ${alertColors[alertLevel]}88} }
        @keyframes scanDown   { 0%{top:-2px} 100%{top:100%} }
        ::-webkit-scrollbar       { width:4px; height:4px }
        ::-webkit-scrollbar-track { background:#060e1a }
        ::-webkit-scrollbar-thumb { background:#1a2a3e; border-radius:2px }
        * { box-sizing: border-box }
      `}</style>


      {/* ── Code Editor page ────────────────────────────────────── */}
      {mainTab === "editor" && (
        <div style={{ flex:1, minHeight:0, display:"flex", flexDirection:"column" }}>
          <FullCodeEditor token={token} addLog={addLog}/>
        </div>
      )}

      {/* ── LEFT: Dashboard ─────────────────────────────────────── */}
      {mainTab === "dashboard" && <div style={{ flex:1, minWidth:0, overflowY:"auto", position:"relative" }}>
        <ScanLine/>

        {/* Header */}
        <div style={{ background:"linear-gradient(180deg,#0a1628,#060e1a)", borderBottom:`2px solid ${alertColors[alertLevel]}33`, padding:"12px 20px", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:10 }}>
          <div style={{ display:"flex", alignItems:"center", gap:14 }}>
            <div style={{ width:38, height:38, borderRadius:"50%", background:`radial-gradient(circle,${alertColors[alertLevel]}33,transparent)`, border:`2px solid ${alertColors[alertLevel]}66`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, animation:alertLevel==="SEVERE"?"alertPulse 1s ease-in-out infinite":"none" }}>🛡️</div>
            <div>
              <div style={{ fontFamily:"'Orbitron',monospace", fontSize:15, fontWeight:900, letterSpacing:3, color:"#ecf0f1" }}>CYBER DEFENSE COMMAND</div>
              <div style={{ fontSize:10, color:"#4a5568", letterSpacing:1 }}>GOVERNMENT AI-POWERED THREAT OPERATIONS CENTER</div>
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:16 }}>
            <div style={{ fontSize:9, fontFamily:"'JetBrains Mono',monospace", display:"flex", alignItems:"center", gap:4,
              color: agentReady ? "#00b894" : "#ff4757" }}>
              <span style={{ width:6, height:6, borderRadius:"50%", background: agentReady ? "#00b894" : "#ff4757", display:"inline-block", animation: agentReady ? "alertPulse 2s infinite" : "none" }}/>
              {agentReady ? `LIVE · ${liveDevices} DEVICE${liveDevices!==1?"S":""}` : "NOT CONNECTED"}
            </div>
            <div style={{ fontSize:9, color:"#00b894", fontFamily:"'JetBrains Mono',monospace", display:"flex", alignItems:"center", gap:4 }}>
              <span style={{ width:6, height:6, borderRadius:"50%", background:"#00b894", display:"inline-block" }}/>
              AI ONLINE
            </div>
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:9, color:"#4a5568", textTransform:"uppercase", letterSpacing:1 }}>Threat Level</div>
              <div style={{ fontFamily:"'Orbitron',monospace", fontSize:13, fontWeight:700, color:alertColors[alertLevel], textShadow:`0 0 10px ${alertColors[alertLevel]}44` }}>{alertLevel}</div>
            </div>
            <div style={{ width:1, height:30, background:"#0f1d30" }}/>
            <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:12, color:"#636e7b", textAlign:"right" }}>
              <div style={{ color:"#8395a7" }}>{clock.toLocaleDateString("en-US",{weekday:"short",year:"numeric",month:"short",day:"numeric"})}</div>
              <div style={{ fontSize:16, color:"#ecf0f1", fontWeight:700 }}>{clock.toTimeString().slice(0,8)} UTC</div>
            </div>
            <div style={{ width:1, height:30, background:"#0f1d30" }}/>
            {/* Main nav tabs */}
            <div style={{ display:"flex", background:"#060e1a", border:"1px solid #0f1d30", borderRadius:4, overflow:"hidden" }}>
              {[["dashboard","🖥 Dashboard"],["editor","⌨️ Code Editor"]].map(([id, label]) => (
                <button key={id} onClick={() => setMainTab(id)} style={{ padding:"6px 14px", background: mainTab===id ? "#0984e322" : "transparent", border:"none", borderRight:"1px solid #0f1d30", color: mainTab===id ? "#0984e3" : "#4a5568", cursor:"pointer", fontSize:11, fontWeight:700, fontFamily:"'JetBrains Mono',monospace", letterSpacing:0.5, whiteSpace:"nowrap" }}>
                  {label}
                </button>
              ))}
            </div>
            {mainTab === "dashboard" && (
            <button onClick={() => setPanelOpen(p => !p)} title={panelOpen ? "Close AI panel" : "Open AI panel"}
              style={{ padding:"6px 10px", background:"#0984e311", border:"1px solid #0984e333", borderRadius:4, color:"#0984e3", cursor:"pointer", fontSize:14, lineHeight:1 }}>
              {panelOpen ? "▶" : "◀"}
            </button>
            )}
            {onLogout && (
              <>
                <div style={{ width:1, height:30, background:"#0f1d30" }}/>
                <button onClick={onLogout} style={{ padding:"6px 12px", background:"#ff475711", border:"1px solid #ff475733", borderRadius:4, color:"#ff4757", cursor:"pointer", fontSize:10, fontWeight:700, fontFamily:"'JetBrains Mono',monospace" }}>
                  LOGOUT
                </button>
              </>
            )}
          </div>
        </div>

        {/* Stat Cards */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(155px,1fr))", gap:10, padding:"12px 20px" }}>
          <StatCard label="Active Threats"  value={activeThreats} sub={`${activeCrit} critical`} color="#ff4757"  icon="⚠️"/>
          <StatCard label="Mitigating"      value={mitigating}                                    color="#ffa502"  icon="🔄"/>
          <StatCard label="Neutralized"     value={neutralized}   sub="session total"             color="#2ed573"  icon="✅"/>
          <StatCard label="Connections Scanned" value={defense.aiScans.toLocaleString()} sub="real network traffic" color="#0984e3" icon="🤖"/>
          <StatCard label="Monitored Devices" value={`${defense.firewalls.active}/${defense.firewalls.total}`} sub="online / total" color="#6c5ce7" icon="💻"/>
          <StatCard label="System Uptime"   value={`${defense.uptime}%`} sub={defense.encryption.strength} color="#00b894" icon="🔒"/>
          <StatCard label="High-Risk Geo"   value={summary.highRiskGeoConnections || 0} sub="flagged countries" color="#ff6348" icon="🌍"/>
          <StatCard label="TOR / Proxy"     value={(summary.torConnections || 0) + (summary.proxyConnections || 0)} sub="anonymized connections" color="#e84393" icon="🧅"/>
          <StatCard label="Beaconing"       value={summary.beaconingDevices || 0} sub="C2 pattern detected" color="#a29bfe" icon="📡"/>
        </div>

        {/* Main Grid */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 280px", gap:12, padding:"0 20px 16px" }}>
          {/* Threat Feed */}
          <div style={{ background:"#060e1a", border:"1px solid #0f1d30", borderRadius:6, padding:12 }}>
            <div style={{ fontSize:10, color:"#4a5568", textTransform:"uppercase", letterSpacing:1, fontWeight:700, marginBottom:8, display:"flex", alignItems:"center", gap:6 }}>
              <span style={{ display:"inline-block", width:6, height:6, borderRadius:"50%", background: agentReady ? "#ff4757" : "#4a5568", animation: agentReady ? "alertPulse 2s infinite" : "none" }}/>
              Live Threat Feed
            </div>
            {agentReady
              ? <ThreatFeed threats={threats} onSelect={setSelected} selected={selected}/>
              : (
                <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:200, gap:8, textAlign:"center" }}>
                  <div style={{ fontSize:28, opacity:0.3 }}>📡</div>
                  <div style={{ fontSize:11, color:"#ff4757", fontFamily:"'JetBrains Mono',monospace", fontWeight:700 }}>NOT CONNECTED</div>
                  <div style={{ fontSize:10, color:"#2a3a4e", maxWidth:200 }}>Run <span style={{ color:"#0984e3" }}>npm run agent</span> to connect this device</div>
                </div>
              )
            }
          </div>

          {/* Center */}
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <div style={{ background:"#060e1a", border:"1px solid #0f1d30", borderRadius:6, padding:12, flex:1 }}>
              <div style={{ fontSize:10, color:"#4a5568", textTransform:"uppercase", letterSpacing:1, fontWeight:700, marginBottom:8 }}>Threat Analysis & Response</div>
              <ThreatDetail threat={selected} onAction={handleAction}/>
            </div>
            <div style={{ background:"#060e1a", border:"1px solid #0f1d30", borderRadius:6, padding:12 }}>
              <div style={{ fontSize:10, color:"#4a5568", textTransform:"uppercase", letterSpacing:1, fontWeight:700, marginBottom:6, display:"flex", justifyContent:"space-between" }}>
                <span>48h Activity</span>
                <span style={{ color:"#636e7b", fontFamily:"'JetBrains Mono',monospace" }}>
                  <span style={{ color:"#ff4757" }}>■</span> threats &nbsp;
                  <span style={{ color:"#0984e3" }}>■</span> blocked
                </span>
              </div>
              <ActivityGraph threats={threats}/>
            </div>
          </div>

          {/* Right sidebar */}
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <div style={{ background:"#060e1a", border:"1px solid #0f1d30", borderRadius:6, padding:12 }}>
              <div style={{ fontSize:10, color:"#4a5568", textTransform:"uppercase", letterSpacing:1, fontWeight:700, marginBottom:6 }}>Network Topology</div>
              <div style={{ height:130 }}><HexGrid/></div>
            </div>
            <div style={{ background:"#060e1a", border:"1px solid #0f1d30", borderRadius:6, padding:12 }}>
              <div style={{ fontSize:10, color:"#4a5568", textTransform:"uppercase", letterSpacing:1, fontWeight:700, marginBottom:8 }}>Defense Systems</div>
              <DefensePanel defense={defense}/>
            </div>
            <div style={{ background:"#060e1a", border:"1px solid #0f1d30", borderRadius:6, padding:12 }}>
              <div style={{ fontSize:10, color:"#4a5568", textTransform:"uppercase", letterSpacing:1, fontWeight:700, marginBottom:8 }}>Threat Vectors</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
                {THREAT_TYPES.map(t => {
                  const count = threats.filter(th => th.type.id===t.id).length;
                  return count>0 ? (
                    <div key={t.id} style={{ fontSize:9, padding:"3px 7px", borderRadius:3, background:`${t.color}15`, color:t.color, border:`1px solid ${t.color}22`, fontFamily:"'JetBrains Mono',monospace", fontWeight:600 }}>
                      {t.icon} {t.label} ({count})
                    </div>
                  ) : null;
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Log Console */}
        <div style={{ padding:"0 20px 20px" }}>
          <div style={{ fontSize:10, color:"#4a5568", textTransform:"uppercase", letterSpacing:1, fontWeight:700, marginBottom:6, display:"flex", alignItems:"center", gap:6 }}>
            <span style={{ color:"#00b894" }}>▸</span> AI Operations Log
          </div>
          <LogConsole logs={logs}/>
        </div>
      </div>}

      {/* ── RIGHT: AI Chat + Code Editor ────────────────────────── */}
      {mainTab === "dashboard" && panelOpen && (
        <div style={{ width:440, borderLeft:"1px solid #0f1d30", background:"#060e1a", display:"flex", flexDirection:"column", flexShrink:0 }}>
          {/* Tab bar */}
          <div style={{ display:"flex", borderBottom:"1px solid #0f1d30", flexShrink:0 }}>
            {tabBtn("chat",   "🤖 AI Chat")}
            {tabBtn("editor", "⌨️  Code Editor")}
            <button onClick={() => setPanelOpen(false)} title="Close panel"
              style={{ padding:"8px 12px", background:"transparent", border:"none", borderBottom:"2px solid transparent", color:"#4a5568", cursor:"pointer", fontSize:14, flexShrink:0 }}>
              ✕
            </button>
          </div>

          {/* Tab content */}
          <div style={{ flex:1, minHeight:0, padding:12, display:"flex", flexDirection:"column" }}>
            {rightTab==="chat"
              ? <AIChat          selectedThreat={selected} token={token} addLog={addLog}/>
              : <CodeEditorPanel selectedThreat={selected} token={token} addLog={addLog}/>
            }
          </div>
        </div>
      )}
    </div>
  );
}
