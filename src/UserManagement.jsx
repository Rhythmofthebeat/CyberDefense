import { useState, useEffect } from "react";

const ROLE_COLORS = {
  admin:    { bg: "#ff475718", color: "#ff4757", label: "ADMIN" },
  operator: { bg: "#0984e318", color: "#0984e3", label: "OPERATOR" },
  viewer:   { bg: "#2ed57318", color: "#2ed573", label: "VIEWER" },
};

function RoleBadge({ role }) {
  const c = ROLE_COLORS[role] || ROLE_COLORS.viewer;
  return (
    <span style={{
      padding: "2px 8px", borderRadius: 3, fontSize: 9, fontWeight: 700,
      fontFamily: "monospace", letterSpacing: 1,
      background: c.bg, color: c.color, border: `1px solid ${c.color}33`,
    }}>{c.label}</span>
  );
}

export default function UserManagement({ token, onClose }) {
  const [users, setUsers] = useState([]);
  const [audit, setAudit] = useState([]);
  const [tab, setTab] = useState("users"); // users | audit | ldap
  const [error, setError] = useState("");
  const [form, setForm] = useState({ username: "", email: "", password: "", role: "viewer" });
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(false);
  const [domains, setDomains] = useState([]);
  const [ldapCfg, setLdapCfg] = useState({
    enabled: false, url: "", baseDN: "", bindDN: "", bindPassword: "",
    userFilter: "(sAMAccountName={{username}})", defaultRole: "viewer",
    adminGroup: "", operatorGroup: "",
  });
  const [ldapStatus, setLdapStatus] = useState(null);
  const [ldapTesting, setLdapTesting] = useState(false);
  const [ldapSaving, setLdapSaving] = useState(false);

  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const load = async () => {
    setLoading(true);
    try {
      const [uRes, aRes, dRes, lRes] = await Promise.all([
        fetch("/api/users", { headers }),
        fetch("/api/audit", { headers }),
        fetch("/api/config/domains", { headers }),
        fetch("/api/config/ldap", { headers }),
      ]);
      if (uRes.ok) setUsers(await uRes.json());
      if (aRes.ok) setAudit(await aRes.json());
      if (dRes.ok) { const d = await dRes.json(); setDomains(d.domains); }
      if (lRes.ok) { const l = await lRes.json(); setLdapCfg(prev => ({ ...prev, ...l })); }
    } catch {}
    setLoading(false);
  };

  const saveLdap = async () => {
    setLdapSaving(true); setLdapStatus(null);
    try {
      const res = await fetch("/api/config/ldap", { method: "POST", headers, body: JSON.stringify(ldapCfg) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLdapStatus({ ok: true, msg: "Settings saved." });
    } catch (e) { setLdapStatus({ ok: false, msg: e.message }); }
    setLdapSaving(false);
  };

  const testLdap = async () => {
    setLdapTesting(true); setLdapStatus(null);
    try {
      await fetch("/api/config/ldap", { method: "POST", headers, body: JSON.stringify(ldapCfg) });
      const res = await fetch("/api/config/ldap/test", { method: "POST", headers });
      const data = await res.json();
      setLdapStatus({ ok: data.ok, msg: data.ok ? data.message : data.error });
    } catch (e) { setLdapStatus({ ok: false, msg: e.message }); }
    setLdapTesting(false);
  };

  useEffect(() => { load(); }, []);

  const createUser = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const res = await fetch("/api/users", { method: "POST", headers, body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setForm({ username: "", email: "", password: "", role: "viewer" });
      setAdding(false);
      load();
    } catch (err) { setError(err.message); }
  };

  const toggleUser = async (username, active) => {
    await fetch(`/api/users/${username}`, { method: "PATCH", headers, body: JSON.stringify({ active }) });
    load();
  };

  const changeRole = async (username, role) => {
    await fetch(`/api/users/${username}`, { method: "PATCH", headers, body: JSON.stringify({ role }) });
    load();
  };

  const deleteUser = async (username) => {
    if (!confirm(`Delete user "${username}"? This cannot be undone.`)) return;
    await fetch(`/api/users/${username}`, { method: "DELETE", headers });
    load();
  };

  const inputStyle = {
    background: "#030810", border: "1px solid #0f1d30", borderRadius: 4,
    color: "#c8d6e5", padding: "7px 10px", fontSize: 12,
    fontFamily: "monospace", outline: "none", width: "100%",
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "#000000bb", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        width: 680, maxHeight: "85vh", background: "#060e1a",
        border: "1px solid #0f1d30", borderRadius: 10, overflow: "hidden",
        display: "flex", flexDirection: "column",
      }}>
        {/* Header */}
        <div style={{
          padding: "16px 20px", background: "linear-gradient(180deg,#0a1628,#060e1a)",
          borderBottom: "1px solid #0f1d30", display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div>
            <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#ecf0f1", letterSpacing: 2 }}>
              PERSONNEL MANAGEMENT
            </div>
            <div style={{ fontSize: 10, color: "#4a5568", marginTop: 2 }}>
              Authorized Government Personnel Only
              {domains.length > 0 && ` · Allowed domains: ${domains.join(", ")}`}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "transparent", border: "1px solid #1a2a3e", borderRadius: 4,
            color: "#636e7b", padding: "5px 10px", cursor: "pointer", fontSize: 11,
          }}>✕ Close</button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid #0f1d30", background: "#040a14" }}>
          {[
            { id: "users", label: `Users (${users.length})` },
            { id: "audit", label: "Audit Log" },
            { id: "ldap",  label: "Active Directory" },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: "10px 20px", background: "transparent",
              border: "none", borderBottom: `2px solid ${tab === t.id ? "#1e90ff" : "transparent"}`,
              color: tab === t.id ? "#1e90ff" : "#4a5568", cursor: "pointer",
              fontSize: 11, fontFamily: "monospace", letterSpacing: 1, textTransform: "uppercase",
            }}>
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ overflowY: "auto", flex: 1, padding: "16px 20px" }}>

          {tab === "users" && (
            <>
              {/* Role legend */}
              <div style={{ display: "flex", gap: 12, marginBottom: 16, fontSize: 10, color: "#636e7b" }}>
                <span><RoleBadge role="admin" /> Full access + user management</span>
                <span><RoleBadge role="operator" /> Can take response actions</span>
                <span><RoleBadge role="viewer" /> Read-only</span>
              </div>

              {/* User list */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
                {loading && <div style={{ color: "#4a5568", fontSize: 12 }}>Loading...</div>}
                {users.map(u => (
                  <div key={u.username} style={{
                    display: "grid", gridTemplateColumns: "1fr auto auto auto",
                    alignItems: "center", gap: 12, padding: "10px 14px",
                    background: u.active ? "#060e1a" : "#030810",
                    border: `1px solid ${u.active ? "#0f1d30" : "#1a0a0a"}`,
                    borderRadius: 5, opacity: u.active ? 1 : 0.5,
                  }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{
                          width: 7, height: 7, borderRadius: "50%",
                          background: u.active ? "#2ed573" : "#ff4757",
                          display: "inline-block", flexShrink: 0,
                        }} />
                        <span style={{ color: "#ecf0f1", fontSize: 13, fontFamily: "monospace", fontWeight: 600 }}>
                          {u.username}
                        </span>
                        <RoleBadge role={u.role} />
                      </div>
                      <div style={{ fontSize: 10, color: "#4a5568", marginTop: 3, marginLeft: 15 }}>
                        {u.email || "no email"} · Added {new Date(u.createdAt).toLocaleDateString()}
                      </div>
                    </div>

                    {/* Role selector */}
                    <select value={u.role} onChange={e => changeRole(u.username, e.target.value)}
                      style={{ ...inputStyle, width: "auto", fontSize: 11, padding: "4px 8px" }}>
                      <option value="viewer">Viewer</option>
                      <option value="operator">Operator</option>
                      <option value="admin">Admin</option>
                    </select>

                    {/* Activate/deactivate */}
                    <button onClick={() => toggleUser(u.username, !u.active)} style={{
                      padding: "4px 10px", borderRadius: 4, fontSize: 10, cursor: "pointer",
                      fontFamily: "monospace", fontWeight: 700,
                      background: u.active ? "#ffa50218" : "#2ed57318",
                      border: `1px solid ${u.active ? "#ffa50233" : "#2ed57333"}`,
                      color: u.active ? "#ffa502" : "#2ed573",
                    }}>
                      {u.active ? "DEACTIVATE" : "ACTIVATE"}
                    </button>

                    {/* Delete */}
                    <button onClick={() => deleteUser(u.username)} style={{
                      padding: "4px 10px", borderRadius: 4, fontSize: 10, cursor: "pointer",
                      background: "#ff475712", border: "1px solid #ff475733",
                      color: "#ff4757", fontFamily: "monospace", fontWeight: 700,
                    }}>DELETE</button>
                  </div>
                ))}
              </div>

              {/* Add user form */}
              {adding ? (
                <form onSubmit={createUser} style={{
                  background: "#040a14", border: "1px solid #1e90ff22",
                  borderRadius: 6, padding: 16,
                }}>
                  <div style={{ fontSize: 10, color: "#1e90ff", fontFamily: "monospace", letterSpacing: 1, marginBottom: 12, fontWeight: 700 }}>
                    ADD GOVERNMENT PERSONNEL
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                    <div>
                      <label style={{ display: "block", fontSize: 9, color: "#4a5568", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Username</label>
                      <input style={inputStyle} required value={form.username}
                        onChange={e => setForm(f => ({ ...f, username: e.target.value }))} placeholder="jsmith" />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 9, color: "#4a5568", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
                        Gov Email {domains.length > 0 && `(${domains.join(" / ")})`}
                      </label>
                      <input style={inputStyle} type="email" value={form.email}
                        onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                        placeholder={domains.length ? `name@${domains[0]}` : "name@agency.gov"} />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 9, color: "#4a5568", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Temp Password</label>
                      <input style={inputStyle} type="password" required value={form.password}
                        onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Minimum 12 chars recommended" />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 9, color: "#4a5568", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Role</label>
                      <select style={inputStyle} value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                        <option value="viewer">Viewer — read only</option>
                        <option value="operator">Operator — can respond</option>
                        <option value="admin">Admin — full access</option>
                      </select>
                    </div>
                  </div>
                  {error && (
                    <div style={{ background: "#ff475718", border: "1px solid #ff475733", borderRadius: 4, padding: "8px 12px", marginBottom: 10, color: "#ff4757", fontSize: 12 }}>
                      {error}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="submit" style={{
                      padding: "8px 20px", background: "linear-gradient(135deg,#0984e3,#1e90ff)",
                      border: "none", borderRadius: 4, color: "white", fontWeight: 700,
                      fontSize: 12, cursor: "pointer", fontFamily: "monospace",
                    }}>ADD PERSONNEL</button>
                    <button type="button" onClick={() => { setAdding(false); setError(""); }} style={{
                      padding: "8px 16px", background: "transparent", border: "1px solid #1a2a3e",
                      borderRadius: 4, color: "#636e7b", cursor: "pointer", fontSize: 12,
                    }}>Cancel</button>
                  </div>
                </form>
              ) : (
                <button onClick={() => setAdding(true)} style={{
                  padding: "10px 20px", background: "#1e90ff12",
                  border: "1px dashed #1e90ff44", borderRadius: 5,
                  color: "#1e90ff", cursor: "pointer", fontSize: 12,
                  fontFamily: "monospace", fontWeight: 700, letterSpacing: 1, width: "100%",
                }}>
                  + INVITE GOVERNMENT PERSONNEL
                </button>
              )}
            </>
          )}

          {tab === "audit" && (
            <div style={{ fontFamily: "monospace", fontSize: 11 }}>
              <div style={{ color: "#4a5568", marginBottom: 10, fontSize: 10 }}>
                Last 200 authentication and user management events
              </div>
              {audit.length === 0 && <div style={{ color: "#2a3a4e" }}>No audit events yet.</div>}
              {audit.map((e, i) => (
                <div key={i} style={{
                  display: "grid", gridTemplateColumns: "160px 160px 120px 1fr",
                  gap: 8, padding: "5px 0", borderBottom: "1px solid #0a1628",
                  color: e.action.includes("FAIL") ? "#ff4757" : e.action.includes("DELETE") ? "#ffa502" : "#636e7b",
                }}>
                  <span style={{ color: "#2a3a4e" }}>{new Date(e.ts).toLocaleString()}</span>
                  <span style={{ color: e.action.includes("FAIL") ? "#ff4757" : "#0984e3" }}>{e.action}</span>
                  <span style={{ color: "#c8d6e5" }}>{e.actor}</span>
                  <span>{e.target}{e.ip ? ` · ${e.ip}` : ""}{e.role ? ` · role:${e.role}` : ""}</span>
                </div>
              ))}
            </div>
          )}

          {tab === "ldap" && (
            <div>
              <div style={{ color: "#4a5568", fontSize: 10, marginBottom: 16, lineHeight: 1.6 }}>
                Connect to Active Directory or LDAP. Users log in with their existing government credentials.
                Local admin accounts always work as fallback.
              </div>

              {/* Enable toggle */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, padding: "12px 16px", background: "#040a14", borderRadius: 6, border: "1px solid #0f1d30" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#ecf0f1" }}>Enable Active Directory / LDAP</div>
                  <div style={{ fontSize: 10, color: "#4a5568", marginTop: 2 }}>When enabled, users authenticate against your directory server</div>
                </div>
                <button onClick={() => setLdapCfg(c => ({ ...c, enabled: !c.enabled }))} style={{
                  width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
                  background: ldapCfg.enabled ? "#0984e3" : "#1a2a3e",
                  position: "relative", transition: "background 0.2s",
                }}>
                  <span style={{
                    position: "absolute", top: 3, left: ldapCfg.enabled ? 23 : 3,
                    width: 18, height: 18, borderRadius: "50%", background: "white",
                    transition: "left 0.2s",
                  }} />
                </button>
              </div>

              {/* Fields */}
              {[
                { key: "url", label: "LDAP Server URL", placeholder: "ldap://dc.agency.gov  or  ldaps://dc.agency.gov:636" },
                { key: "baseDN", label: "Base DN", placeholder: "DC=agency,DC=gov" },
                { key: "bindDN", label: "Service Account DN", placeholder: "CN=svc-cdc,OU=ServiceAccounts,DC=agency,DC=gov" },
                { key: "bindPassword", label: "Service Account Password", placeholder: "••••••••", type: "password" },
                { key: "userFilter", label: "User Search Filter", placeholder: "(sAMAccountName={{username}})" },
              ].map(f => (
                <div key={f.key} style={{ marginBottom: 12 }}>
                  <label style={{ display: "block", fontSize: 9, color: "#4a5568", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginBottom: 4 }}>{f.label}</label>
                  <input
                    type={f.type || "text"}
                    value={ldapCfg[f.key] || ""}
                    onChange={e => setLdapCfg(c => ({ ...c, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    style={{ background: "#030810", border: "1px solid #0f1d30", borderRadius: 4, color: "#c8d6e5", padding: "8px 10px", fontSize: 12, fontFamily: "monospace", outline: "none", width: "100%" }}
                  />
                </div>
              ))}

              {/* Role mapping */}
              <div style={{ background: "#040a14", border: "1px solid #0f1d30", borderRadius: 6, padding: 14, marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: "#4a5568", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginBottom: 10 }}>Role Mapping (by AD Group)</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 9, color: "#ff4757", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginBottom: 4 }}>Admin Group</label>
                    <input value={ldapCfg.adminGroup || ""} onChange={e => setLdapCfg(c => ({ ...c, adminGroup: e.target.value }))}
                      placeholder="CyberDefense-Admins"
                      style={{ background: "#030810", border: "1px solid #ff475733", borderRadius: 4, color: "#c8d6e5", padding: "7px 10px", fontSize: 11, fontFamily: "monospace", outline: "none", width: "100%" }} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 9, color: "#0984e3", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginBottom: 4 }}>Operator Group</label>
                    <input value={ldapCfg.operatorGroup || ""} onChange={e => setLdapCfg(c => ({ ...c, operatorGroup: e.target.value }))}
                      placeholder="CyberDefense-Operators"
                      style={{ background: "#030810", border: "1px solid #0984e333", borderRadius: 4, color: "#c8d6e5", padding: "7px 10px", fontSize: 11, fontFamily: "monospace", outline: "none", width: "100%" }} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 9, color: "#2ed573", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginBottom: 4 }}>Default Role</label>
                    <select value={ldapCfg.defaultRole || "viewer"} onChange={e => setLdapCfg(c => ({ ...c, defaultRole: e.target.value }))}
                      style={{ background: "#030810", border: "1px solid #2ed57333", borderRadius: 4, color: "#c8d6e5", padding: "7px 10px", fontSize: 11, fontFamily: "monospace", outline: "none", width: "100%" }}>
                      <option value="viewer">Viewer</option>
                      <option value="operator">Operator</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                </div>
                <div style={{ fontSize: 10, color: "#4a5568", marginTop: 8 }}>
                  Group name matching is partial — "CyberDefense-Admins" matches any group CN containing that string.
                  Users not in admin/operator groups get the default role.
                </div>
              </div>

              {ldapStatus && (
                <div style={{
                  padding: "10px 14px", borderRadius: 5, marginBottom: 12,
                  background: ldapStatus.ok ? "#2ed57312" : "#ff475712",
                  border: `1px solid ${ldapStatus.ok ? "#2ed57333" : "#ff475733"}`,
                  color: ldapStatus.ok ? "#2ed573" : "#ff4757", fontSize: 12, fontFamily: "monospace",
                }}>
                  {ldapStatus.ok ? "✓ " : "✗ "}{ldapStatus.msg}
                </div>
              )}

              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={testLdap} disabled={ldapTesting} style={{
                  padding: "10px 20px", borderRadius: 5, cursor: ldapTesting ? "not-allowed" : "pointer",
                  background: "#0984e318", border: "1px solid #0984e344", color: "#0984e3",
                  fontFamily: "monospace", fontWeight: 700, fontSize: 12, letterSpacing: 1,
                }}>
                  {ldapTesting ? "TESTING..." : "TEST CONNECTION"}
                </button>
                <button onClick={saveLdap} disabled={ldapSaving} style={{
                  flex: 1, padding: "10px", borderRadius: 5, cursor: ldapSaving ? "not-allowed" : "pointer",
                  background: "linear-gradient(135deg,#0984e3,#1e90ff)", border: "none",
                  color: "white", fontFamily: "monospace", fontWeight: 700, fontSize: 12, letterSpacing: 1,
                }}>
                  {ldapSaving ? "SAVING..." : "SAVE SETTINGS"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
