import { Component } from 'react';

// Catches render/lifecycle errors anywhere below it in the tree so a bug in
// one screen shows a recoverable "something went wrong" card instead of a
// blank white page for the whole app. Does NOT catch errors in event
// handlers, async code, or server-side rendering — those still need their
// own try/catch (this is a React limitation, not something we can widen).
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Swap this for real crash reporting (Sentry, etc.) when one is wired up.
    console.error('Unhandled error in app tree:', error, info?.componentStack);
  }

  handleReload = () => {
    this.setState({ hasError: false });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', textAlign: 'center',
          padding: 24, gap: 12, background: 'var(--bg, #0b1325)', color: 'var(--muted, #8b98ac)',
        }}>
          <div style={{ fontSize: 40 }}>⚠️</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>Kuch gadbad ho gayi</div>
          <div style={{ fontSize: 14, maxWidth: 320 }}>
            Is screen ko load karne me error aayi. Reload karke dobara try karo.
          </div>
          <button
            onClick={this.handleReload}
            style={{
              marginTop: 8, padding: '10px 22px', borderRadius: 999, border: 'none',
              background: 'var(--primary, #4f7fff)', color: '#fff', fontWeight: 600, cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
