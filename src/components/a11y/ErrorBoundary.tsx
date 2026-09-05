import { Component, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean; error?: Error };

export default class ErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false };
  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }
  override componentDidCatch(error: Error, info: unknown): void {
    // local-only logging; no cloud
    console.error("[Azalea ErrorBoundary]", error, info);
  }
  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div role="alert" style={{
          display: "grid", placeItems: "center", gap: 12, padding: 32, textAlign: "center",
          background: "var(--color-bg)", color: "var(--color-text)", minHeight: "50vh"
        }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, display: "grid", placeItems: "center", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", color: "var(--color-danger)" }} aria-hidden>
            <svg width="22" height="22" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4}><path d="M8 4.2V8.5" strokeLinecap="round"/><circle cx="8" cy="11.2" r="1" fill="currentColor" stroke="none"/><path d="M2.5 13H13.5L8 2.8 2.5 13Z" strokeLinejoin="round"/></svg>
          </div>
          <h2 style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: 600 }}>Something went wrong</h2>
          <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--color-text-muted)", maxWidth: 420 }}>AzaleaOS encountered an unexpected error, but your files and current version remain safe. Try reloading the workspace.</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => window.location.reload()} style={{ height: 32, padding: "0 14px", borderRadius: 999, border: "1px solid var(--color-accent)", background: "var(--color-accent)", color: "white", fontSize: 12, fontWeight: 500, cursor: "pointer" }}>Reload</button>
            <button type="button" onClick={() => this.setState({ hasError: false, error: undefined })} style={{ height: 32, padding: "0 14px", borderRadius: 999, border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text)", fontSize: 12, cursor: "pointer" }}>Dismiss</button>
          </div>
          {this.state.error && <code style={{ fontSize: 10, color: "var(--color-text-faint)", maxWidth: 520, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{this.state.error.message}</code>}
        </div>
      );
    }
    return this.props.children;
  }
}
