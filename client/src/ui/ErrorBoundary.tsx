import { Component, type ReactNode } from "react";

/** Last line of defence: a friendly screen with a reload button instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error("Blitz Buggies crashed:", error); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash">
        <div className="crash-card">
          <div className="crash-emoji">🛠️</div>
          <h2>Oops! A wheel fell off.</h2>
          <p>Something went wrong. Reloading usually fixes it.</p>
          <button className="btn btn-primary btn-big" onClick={() => location.reload()}>Reload game</button>
        </div>
      </div>
    );
  }
}
