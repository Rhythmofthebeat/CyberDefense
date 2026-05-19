import { useState } from "react";

export default function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      localStorage.setItem("cdc-token", data.token);
      localStorage.setItem("cdc-user", data.username);
      onLogin(data.token);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", background: "#040a14",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Segoe UI', sans-serif",
    }}>
      <div style={{
        width: 360,
        background: "#060e1a",
        border: "1px solid #0f1d30",
        borderRadius: 10,
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          background: "linear-gradient(180deg, #0a1628, #060e1a)",
          borderBottom: "1px solid #0f1d30",
          padding: "28px 32px",
          textAlign: "center",
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🛡️</div>
          <div style={{
            fontFamily: "monospace", fontSize: 13, fontWeight: 900,
            letterSpacing: 3, color: "#ecf0f1", marginBottom: 4,
          }}>
            CYBER DEFENSE COMMAND
          </div>
          <div style={{ fontSize: 10, color: "#4a5568", letterSpacing: 2 }}>
            SECURE ACCESS PORTAL
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: "28px 32px" }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 10, color: "#4a5568", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginBottom: 6 }}>
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoFocus
              required
              style={{
                width: "100%", background: "#030810", border: "1px solid #0f1d30",
                borderRadius: 5, color: "#c8d6e5", padding: "10px 12px",
                fontSize: 13, fontFamily: "monospace", outline: "none",
                transition: "border-color 0.2s",
              }}
              onFocus={e => e.target.style.borderColor = "#1e90ff55"}
              onBlur={e => e.target.style.borderColor = "#0f1d30"}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", fontSize: 10, color: "#4a5568", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginBottom: 6 }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              style={{
                width: "100%", background: "#030810", border: "1px solid #0f1d30",
                borderRadius: 5, color: "#c8d6e5", padding: "10px 12px",
                fontSize: 13, fontFamily: "monospace", outline: "none",
                transition: "border-color 0.2s",
              }}
              onFocus={e => e.target.style.borderColor = "#1e90ff55"}
              onBlur={e => e.target.style.borderColor = "#0f1d30"}
            />
          </div>

          {error && (
            <div style={{
              background: "#ff475718", border: "1px solid #ff475733",
              borderRadius: 5, padding: "10px 12px", marginBottom: 16,
              color: "#ff4757", fontSize: 12, fontFamily: "monospace",
            }}>
              ⚠ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%", padding: "12px",
              background: loading ? "#0a1628" : "linear-gradient(135deg, #0984e3, #1e90ff)",
              border: loading ? "1px solid #1e90ff33" : "none",
              borderRadius: 5, color: loading ? "#4a5568" : "white",
              fontWeight: 700, fontSize: 13, fontFamily: "monospace",
              letterSpacing: 1, cursor: loading ? "not-allowed" : "pointer",
              transition: "all 0.2s",
            }}
          >
            {loading ? "AUTHENTICATING..." : "SIGN IN"}
          </button>
        </form>

        <div style={{ padding: "0 32px 20px", textAlign: "center", fontSize: 10, color: "#2a3a4e" }}>
          AUTHORIZED PERSONNEL ONLY
        </div>
      </div>
    </div>
  );
}
