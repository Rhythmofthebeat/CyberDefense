import { Component } from 'react'
import CyberDefenseCommand from './cyber_defense_command'

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ color: '#ff4757', padding: 30, fontFamily: 'monospace', background: '#040a14', minHeight: '100vh', whiteSpace: 'pre-wrap' }}>
          <div style={{ fontSize: 16, marginBottom: 12 }}>Dashboard render error — please report this:</div>
          <div style={{ color: '#fdcb6e' }}>{this.state.error?.toString()}</div>
          <div style={{ color: '#636e7b', marginTop: 12, fontSize: 11 }}>{this.state.error?.stack}</div>
          <button onClick={() => { window.location.reload(); }}
            style={{ marginTop: 20, padding: '8px 16px', background: '#ff475722', border: '1px solid #ff4757', color: '#ff4757', cursor: 'pointer', borderRadius: 4, fontFamily: 'monospace' }}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Login flow removed — this deployment is a public, no-account demo.
// The dashboard already degrades gracefully when the backend API is unreachable.
export default function App() {
  return (
    <ErrorBoundary>
      <CyberDefenseCommand token={null} onLogout={() => {}} />
    </ErrorBoundary>
  )
}
