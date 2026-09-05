import { memo } from "react";
import Sidebar, { type SidebarMode } from "../sidebar/Sidebar";
import AppTabBar from "../tabs/AppTabBar";
import WorkspaceViewport from "./WorkspaceViewport";
import Taskbar from "./Taskbar";
import styles from "./DesktopShell.module.css";

function DesktopShellInner({
  sidebarMode,
  onToggleExpandCompact,
  onHideSidebar,
  onRestoreSidebar,
}: {
  sidebarMode: SidebarMode;
  onToggleExpandCompact: () => void;
  onHideSidebar: () => void;
  onRestoreSidebar: () => void;
}) {
  const isHidden = sidebarMode === "hidden";

  return (
    <div className={styles.shellOuter} data-sidebar={sidebarMode}>
      <div className={styles.shell}>
        <Sidebar mode={sidebarMode} onToggleExpandCompact={onToggleExpandCompact} onHide={onHideSidebar} />

        <div className={styles.main} role="presentation">
          {/* Future ResourceBar placeholder - intentionally empty reserved strip */}
          <div className={styles.resourcePlaceholder} aria-hidden />

          <AppTabBar />

          <div className={styles.workspaceArea}>
            <WorkspaceViewport />
          </div>
        </div>

        {isHidden && (
          <button
            type="button"
            className={styles.restoreBtn}
            onClick={onRestoreSidebar}
            aria-label="Restore sidebar (Ctrl+Alt+A)"
            title="Restore sidebar (Ctrl+Alt+A)"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} aria-hidden>
              <rect x="2.5" y="3.5" width="11" height="9" rx="1.2" />
              <path d="M5.5 3.5V12.5" />
              <path d="M10 7 7.5 8 10 9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className={styles.restoreLabel}>Sidebar</span>
            <span className={styles.restoreKbd} aria-hidden>
              Ctrl+Alt+A
            </span>
          </button>
        )}
      </div>

      <Taskbar />
    </div>
  );
}
const DesktopShell = memo(DesktopShellInner);
export default DesktopShell;
