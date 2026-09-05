import { useEffect, useMemo, useState } from "react";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useAppTabStore } from "../../stores/appTabStore";
import { useLauncherStore } from "../../stores/launcherStore";
import { useResourceStore } from "../../stores/resourceStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useFilesystemStore } from "../../stores/filesystemStore";
import { LAUNCHER_ITEMS } from "../../features/applications/launcherData";
import { MAX_APPS_PER_OS_TAB } from "../../types/workspace";
import styles from "./Taskbar.module.css";

// honey: pinned dock apps are the first real app descriptors from the launcher
// catalog (same source AppLauncher uses) - not separate mock content.
const PINNED_APP_IDS = ["vscode", "chrome", "terminal", "files"] as const;

function initials(label: string): string {
  const parts = label.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

function useClock(): string {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000 * 15);
    return () => window.clearInterval(id);
  }, []);
  return now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export default function Taskbar() {
  const activeOsTabId = useWorkspaceStore((s) => s.activeOsTabId);
  const appTabs = useAppTabStore((s) => (activeOsTabId ? s.appTabsByOsTab[activeOsTabId] ?? [] : []));
  const activeAppTabId = useAppTabStore((s) => (activeOsTabId ? s.activeAppTabIdByOsTab[activeOsTabId] ?? null : null));
  const addAppTab = useAppTabStore((s) => s.addAppTab);
  const switchAppTab = useAppTabStore((s) => s.switchAppTab);
  const openLauncher = useLauncherStore((s) => s.openLauncher);
  const isCenterOpen = useResourceStore((s) => s.isCenterOpen);
  const clock = useClock();

  const pinnedItems = useMemo(
    () => LAUNCHER_ITEMS.filter((i) => i.kind === "app" && PINNED_APP_IDS.includes(i.descriptor!.id as (typeof PINNED_APP_IDS)[number])),
    [],
  );

  const runningByAppId = useMemo(() => {
    const map = new Map<string, string>(); // appId -> appTabId (first match)
    for (const t of appTabs) if (!map.has(t.appId)) map.set(t.appId, t.id);
    return map;
  }, [appTabs]);

  const extraRunning = useMemo(
    () => appTabs.filter((t) => !PINNED_APP_IDS.includes(t.appId as (typeof PINNED_APP_IDS)[number])),
    [appTabs],
  );

  const atLimit = appTabs.length >= MAX_APPS_PER_OS_TAB;

  const handleDockClick = (appId: string, descriptor: NonNullable<(typeof LAUNCHER_ITEMS)[number]["descriptor"]>) => {
    if (!activeOsTabId) return;
    const runningTabId = runningByAppId.get(appId);
    if (runningTabId) {
      switchAppTab(activeOsTabId, runningTabId);
      return;
    }
    if (atLimit) return;
    addAppTab(activeOsTabId, descriptor);
  };

  return (
    <div className={styles.taskbar} role="toolbar" aria-label="Taskbar">
      <button
        type="button"
        className={styles.startBtn}
        onClick={openLauncher}
        aria-label="Open App Launcher (Ctrl+Space)"
        title="AzaleaOS - Open App Launcher (Ctrl+Space)"
      >
        <span className={styles.startMark} aria-hidden>
          <img src="/icon-azaleaos.png" alt="" width={20} height={20} />
        </span>
      </button>

      <div className={styles.dock} role="group" aria-label="Pinned and running apps">
        {pinnedItems.map((item) => {
          const descriptor = item.descriptor!;
          const running = runningByAppId.has(descriptor.id);
          const active = running && activeAppTabId === runningByAppId.get(descriptor.id);
          return (
            <button
              key={item.id}
              type="button"
              className={`${styles.dockIcon} ${active ? styles.dockIconActive : ""}`}
              onClick={() => handleDockClick(descriptor.id, descriptor)}
              aria-label={item.label}
              title={item.label}
              disabled={!running && atLimit}
            >
              <span className={styles.dockGlyph} aria-hidden>{item.icon ?? initials(item.label)}</span>
              {running && <span className={styles.runningDot} aria-hidden />}
            </button>
          );
        })}

        {extraRunning.length > 0 && <span className={styles.dockDivider} aria-hidden />}

        {extraRunning.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`${styles.dockIcon} ${tab.id === activeAppTabId ? styles.dockIconActive : ""}`}
            onClick={() => activeOsTabId && switchAppTab(activeOsTabId, tab.id)}
            aria-label={tab.label}
            title={tab.label}
          >
            <span className={styles.dockGlyph} aria-hidden>{initials(tab.label)}</span>
            <span className={styles.runningDot} aria-hidden />
          </button>
        ))}
      </div>

      <div className={styles.tray} role="group" aria-label="System tray">
        <button
          type="button"
          className={`${styles.trayBtn} ${isCenterOpen ? styles.trayBtnActive : ""}`}
          onClick={() => useResourceStore.getState().toggleCenter()}
          aria-label="Resource Center (Shift+Esc)"
          title="Resource Center (Shift+Esc)"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.35} aria-hidden>
            <rect x="1.5" y="9.5" width="3" height="5" rx="0.7" />
            <rect x="6.5" y="5.5" width="3" height="9" rx="0.7" />
            <rect x="11.5" y="2.5" width="3" height="12" rx="0.7" />
          </svg>
        </button>
        <button
          type="button"
          className={styles.trayBtn}
          onClick={() => useFilesystemStore.getState().open()}
          aria-label="Files"
          title="Files"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.35} aria-hidden>
            <path d="M2.5 3.5A1 1 0 0 1 3.5 2.5H6l1.5 1.5H12.5A1 1 0 0 1 13.5 5V12.5A1 1 0 0 1 12.5 13.5H3.5A1 1 0 0 1 2.5 12.5V3.5Z" />
          </svg>
        </button>
        <button
          type="button"
          className={styles.trayBtn}
          onClick={() => useSettingsStore.getState().openSettings()}
          aria-label="Settings"
          title="Settings"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.35} aria-hidden>
            <circle cx="8" cy="8" r="2.2" />
            <path d="M8 3.2V4.2M8 11.8V12.8M12.8 8H11.8M4.2 8H3.2M11.1 4.9 10.35 5.65M5.65 10.35 4.9 11.1M11.1 11.1 10.35 10.35M5.65 5.65 4.9 4.9" strokeLinecap="round" />
          </svg>
        </button>
        <span className={styles.clock} aria-label={`Current time ${clock}`}>{clock}</span>
      </div>
    </div>
  );
}
