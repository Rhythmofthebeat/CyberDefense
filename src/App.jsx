import { useState, useEffect, Component } from 'react'
import Login from './Login'
import CyberDefenseCommand from './cyber_defense_command'

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ color: '#ff4757', padding: 30, fontFamily: 'monospace', background: '#040a14', minHeight: '100vh', whiteSpace: 'pre-wrap' }}>
          <div style={{ fontSize: 16, marginBottom: 12 }}>⚠ Dashboard render error — please report this:</div>
          <div style={{ color: '#fdcb6e' }}>{this.state.error?.toString()}</div>
          <div style={{ color: '#636e7b', marginTop: 12, fontSize: 11 }}>{this.state.error?.stack}</div>
          <button onClick={() => { localStorage.removeItem('cdc-token'); window.location.reload(); }}
            style={{ marginTop: 20, padding: '8px 16px', background: '#ff475722', border: '1px solid #ff4757', color: '#ff4757', cursor: 'pointer', borderRadius: 4, fontFamily: 'monospace' }}>
            Sign out & reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('cdc-token'))
  const [checking, setChecking] = useState(true)

  // Verify token is still valid on load
  useEffect(() => {
    if (!token) { setChecking(false); return }
    fetch('/api/fleet', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { if (!r.ok) throw new Error(); setChecking(false) })
      .catch(() => { localStorage.removeItem('cdc-token'); setToken(null); setChecking(false) })
  }, [])

  const handleLogin = (t) => setToken(t)

  const handleLogout = () => {
    localStorage.removeItem('cdc-token')
    localStorage.removeItem('cdc-user')
    setToken(null)
  }

  if (checking) return null

  if (!token) return <Login onLogin={handleLogin} />

  return (
    <ErrorBoundary>
      <CyberDefenseCommand token={token} onLogout={handleLogout} />
    </ErrorBoundary>
  )
}
