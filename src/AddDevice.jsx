import { useState } from "react";

const DEVICE_TYPES = [
  { value: "router",    label: "RTR Router",        modes: ["ping", "snmp"] },
  { value: "switch",    label: "SW Switch",         modes: ["ping", "snmp"] },
  { value: "firewall",  label: "FW Firewall",       modes: ["ping", "snmp"] },
  { value: "ap",        label: "AP Access Point",   modes: ["ping", "snmp"] },
  { value: "server",    label: "SRV Server",         modes: ["ping", "snmp"] },
  { value: "printer",   label: "PRN Printer",        modes: ["ping"] },
  { value: "camera",    label: "CAM IP Camera",      modes: ["ping"] },
  { value: "iot",       label: "IOT IoT Device",     modes: ["ping"] },
  { value: "nas",       label: "NAS NAS",            modes: ["ping", "snmp"] },
  { value: "unknown",   label: "? Other Device",   modes: ["ping", "snmp"] },
];

const TYPE_ICONS = {
  router: "RTR", switch: "SW", firewall: "FW", ap: "AP", server: "SRV",
  printer: "PRN", camera: "CAM", iot: "IOT", nas: "NAS", unknown: "?",
};

export { TYPE_ICONS };

export default function AddDevice({ token, onClose, onAdded }) {
  const [form, setForm] = useState({
    name: "", ip: "", type: "router", mode: "ping",
    community: "public", snmpVersion: "2c",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const selectedType = DEVICE_TYPES.find(t => t.value === form.type);

  const inputStyle = {
    background: "#030810", border: "1px solid #0f1d30", borderRadius: 4,
    color: "#c8d6e5", padding: "8px 10px", fontSize: 12,
    fontFamily: "monospace", outline: "none", width: "100%",
  };

  const handleTest = async () => {
    setTestResult(null); setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/network-devices", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, name: form.name || form.ip }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      // Poll it immediately
      const pollRes = await fetch(`/api/network-devices/${data.id}/poll`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const pollData = await pollRes.json();
      setTestResult({ id: data.id, ...pollData });
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (testResult) { onAdded(); onClose(); return; }
    await handleTest();
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "#000000bb", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        width: 480, background: "#060e1a", border: "1px solid #0f1d30",
        borderRadius: 10, overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "16px 20px", background: "linear-gradient(180deg,#0a1628,#060e1a)",
          borderBottom: "1px solid #0f1d30", display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div>
            <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#ecf0f1", letterSpacing: 2 }}>
              LINK DEVICE
            </div>
            <div style={{ fontSize: 10, color: "#4a5568", marginTop: 2 }}>
              Agent-less monitoring via SNMP or Ping
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "transparent", border: "1px solid #1a2a3e",
            borderRadius: 4, color: "#636e7b", padding: "5px 10px", cursor: "pointer", fontSize: 11,
          }}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 20 }}>
          {/* Device type grid */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 9, color: "#4a5568", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, fontWeight: 700 }}>
              Device Type
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
              {DEVICE_TYPES.map(t => (
                <button key={t.value} type="button" onClick={() => setForm(f => ({ ...f, type: t.value, mode: t.modes[0] }))}
                  style={{
                    padding: "8px 4px", borderRadius: 5, cursor: "pointer",
                    background: form.type === t.value ? "#1e90ff18" : "#030810",
                    border: `1px solid ${form.type === t.value ? "#1e90ff55" : "#0f1d30"}`,
                    color: form.type === t.value ? "#1e90ff" : "#636e7b",
                    fontSize: 18, display: "flex", flexDirection: "column",
                    alignItems: "center", gap: 3,
                  }}>
                  {t.label.split(" ")[0]}
                  <span style={{ fontSize: 8, fontFamily: "monospace", letterSpacing: 0 }}>
                    {t.label.split(" ").slice(1).join(" ")}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: 9, color: "#4a5568", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4, fontWeight: 700 }}>
                Device Name
              </label>
              <input style={inputStyle} required value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Gateway Router" />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 9, color: "#4a5568", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4, fontWeight: 700 }}>
                IP Address
              </label>
              <input style={inputStyle} required value={form.ip}
                onChange={e => setForm(f => ({ ...f, ip: e.target.value }))}
                placeholder="192.168.1.1" />
            </div>
          </div>

          {/* Mode selector */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontSize: 9, color: "#4a5568", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, fontWeight: 700 }}>
              Monitoring Mode
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              {(selectedType?.modes || ["ping"]).map(m => (
                <button key={m} type="button" onClick={() => setForm(f => ({ ...f, mode: m }))}
                  style={{
                    flex: 1, padding: "8px", borderRadius: 5, cursor: "pointer",
                    background: form.mode === m ? (m === "snmp" ? "#0984e318" : "#2ed57318") : "#030810",
                    border: `1px solid ${form.mode === m ? (m === "snmp" ? "#0984e344" : "#2ed57344") : "#0f1d30"}`,
                    color: form.mode === m ? (m === "snmp" ? "#0984e3" : "#2ed573") : "#636e7b",
                    fontFamily: "monospace", fontWeight: 700, fontSize: 11,
                  }}>
                  {m === "snmp" ? "SNMP" : "PING ONLY"}
                  <div style={{ fontSize: 9, fontWeight: 400, marginTop: 2, opacity: 0.7 }}>
                    {m === "snmp" ? "CPU, RAM, interfaces" : "Online / Offline only"}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* SNMP options */}
          {form.mode === "snmp" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12, padding: 12, background: "#030810", borderRadius: 5, border: "1px solid #0984e322" }}>
              <div>
                <label style={{ display: "block", fontSize: 9, color: "#4a5568", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4, fontWeight: 700 }}>
                  Community String
                </label>
                <input style={inputStyle} value={form.community}
                  onChange={e => setForm(f => ({ ...f, community: e.target.value }))}
                  placeholder="public" />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 9, color: "#4a5568", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4, fontWeight: 700 }}>
                  SNMP Version
                </label>
                <select style={inputStyle} value={form.snmpVersion}
                  onChange={e => setForm(f => ({ ...f, snmpVersion: e.target.value }))}>
                  <option value="1">v1</option>
                  <option value="2c">v2c</option>
                </select>
              </div>
            </div>
          )}

          {/* Test result */}
          {testResult && (
            <div style={{
              padding: 12, borderRadius: 5, marginBottom: 12,
              background: testResult.online ? "#2ed57312" : "#ff475712",
              border: `1px solid ${testResult.online ? "#2ed57333" : "#ff475733"}`,
            }}>
              <div style={{ color: testResult.online ? "#2ed573" : "#ff4757", fontFamily: "monospace", fontWeight: 700, fontSize: 12, marginBottom: 4 }}>
                {testResult.online ? "✓ DEVICE REACHABLE" : "✗ DEVICE UNREACHABLE"}
              </div>
              {testResult.sys?.hostname && <div style={{ fontSize: 11, color: "#8395a7" }}>Hostname: {testResult.sys.hostname}</div>}
              {testResult.sys?.cpu?.usage > 0 && <div style={{ fontSize: 11, color: "#8395a7" }}>CPU: {testResult.sys.cpu.usage}%</div>}
              {testResult.sys?.memory?.pct > 0 && <div style={{ fontSize: 11, color: "#8395a7" }}>Memory: {testResult.sys.memory.pct}%</div>}
              {testResult.sys?.sysDescr && <div style={{ fontSize: 10, color: "#636e7b", marginTop: 4 }}>{testResult.sys.sysDescr.substring(0, 80)}</div>}
            </div>
          )}

          {error && (
            <div style={{ background: "#ff475718", border: "1px solid #ff475733", borderRadius: 4, padding: "8px 12px", marginBottom: 12, color: "#ff4757", fontSize: 12 }}>
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" disabled={loading} style={{
              flex: 1, padding: "10px", borderRadius: 5, cursor: loading ? "not-allowed" : "pointer",
              background: testResult ? "linear-gradient(135deg,#00b894,#2ed573)" : "linear-gradient(135deg,#0984e3,#1e90ff)",
              border: "none", color: "white", fontWeight: 700, fontSize: 12, fontFamily: "monospace", letterSpacing: 1,
            }}>
              {loading ? "CONNECTING..." : testResult ? "✓ ADD DEVICE" : "TEST CONNECTION"}
            </button>
            <button type="button" onClick={onClose} style={{
              padding: "10px 16px", background: "transparent", border: "1px solid #1a2a3e",
              borderRadius: 5, color: "#636e7b", cursor: "pointer", fontSize: 12,
            }}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
