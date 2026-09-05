import { memo } from "react";
import Sidebar, { type SidebarMode } from "../sidebar/Sidebar";
import AppTabBar from "../tabs/AppTabBar";
import WorkspaceViewport from "./WorkspaceViewport";
import { useLauncherStore } from "../../stores/launcherStore";
import { useFilesystemStore } from "../../stores/filesystemStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useResourceStore } from "../../stores/resourceStore";
import azaleaIcon from "../../../asset/icon-azaleaos.png";
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
  const openLauncher = useLauncherStore((s) => s.openLauncher);
  const openFiles = useFilesystemStore((s) => s.open);
  const openSettings = useSettingsStore((s) => s.openSettings);
  const openResourceCenter = useResourceStore((s) => s.openCenter);

  return (
    <div className={styles.shell} data-sidebar={sidebarMode}>
      <div className={styles.wallpaper} aria-hidden />
      <div className={styles.desktopShade} aria-hidden />

      <Sidebar mode={sidebarMode} onToggleExpandCompact={onToggleExpandCompact} onHide={onHideSidebar} />

      <div className={styles.main} role="presentation">
        <div className={styles.topGlass}>
          <AppTabBar />
        </div>
        <div className={styles.workspaceArea}>
          <WorkspaceViewport />
        </div>
      </div>

      <nav className={styles.taskbar} aria-label="Azalea taskbar">
        <button className={styles.taskButton} onClick={openLauncher} aria-label="Open app launcher" title="App launcher (Ctrl+Space)">
          <img src={azaleaIcon} alt="" />
        </button>
        <span className={styles.divider} aria-hidden />
        <button className={styles.taskButton} onClick={openFiles} aria-label="Open Files" title="Files">
          <span aria-hidden>📁</span>
        </button>
        <button className={styles.taskButton} onClick={openResourceCenter} aria-label="Open Resource Center" title="Resource Center">
          <span aria-hidden>◫</span>
        </button>
        <button className={styles.taskButton} onClick={() => openSettings("appearance")} aria-label="Open Settings" title="Settings">
          <span aria-hidden>⚙</span>
        </button>
      </nav>

      <div className={styles.tray} aria-hidden>
        <span className={styles.trayDot} />
        <span>AzaleaOS</span>
      </div>

      {isHidden && (
        <button type="button" className={styles.restoreBtn} onClick={onRestoreSidebar} aria-label="Restore sidebar (Ctrl+Alt+A)" title="Restore sidebar (Ctrl+Alt+A)">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} aria-hidden>
            <rect x="2.5" y="3.5" width="11" height="9" rx="1.2" />
            <path d="M5.5 3.5V12.5" />
            <path d="M10 7 7.5 8 10 9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Sidebar</span>
        </button>
      )}
    </div>
  );
}

const DesktopShell = memo(DesktopShellInner);
export default DesktopShell;
