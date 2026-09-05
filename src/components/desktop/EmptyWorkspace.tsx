import styles from "./WorkspaceViewport.module.css";
import { useLauncherStore } from "../../stores/launcherStore";

export default function EmptyWorkspace({ workspaceName = "Development" }: { workspaceName?: string }) {
  const openLauncher = useLauncherStore((s) => s.openLauncher);
  return (
    <div className={styles.emptyWrap} role="status" aria-live="polite">
      <div className={styles.emptyCard}>
        <div className={styles.emptyKicker} aria-hidden>
          <span className={styles.kickerDot} />
          Workspace
        </div>
        <div aria-hidden style={{ width: 56, height: 56, display: "grid", placeItems: "center", borderRadius: "var(--radius-lg)", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", color: "var(--color-accent)", margin: "2px 0" }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.35}>
            <rect x="3" y="7" width="18" height="12" rx="1.5" />
            <path d="M7 7V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2" />
            <circle cx="12" cy="13" r="2.2" />
          </svg>
        </div>
        <h1 className={styles.emptyTitle} title={workspaceName} style={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{workspaceName}</h1>
        <p className={styles.emptyText}>Nothing is open yet. Launch an app to start this workspace.</p>

        <button type="button" className={styles.launcherBtn} onClick={openLauncher} aria-label="Open App Launcher" title="Open App Launcher (Ctrl+Space)">
          Open App Launcher
        </button>

        <p className={styles.emptyHint}>
          Press <kbd className={styles.kbd}>Ctrl</kbd> + <kbd className={styles.kbd}>Space</kbd> · <span className={styles.hintMuted}>+ New App (10 max)</span>
        </p>
      </div>
    </div>
  );
}
