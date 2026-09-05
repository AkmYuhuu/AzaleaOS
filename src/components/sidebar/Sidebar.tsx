import { useState } from "react";
import { MAX_OS_TABS } from "../../types/workspace";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useResourceStore } from "../../stores/resourceStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useFilesystemStore } from "../../stores/filesystemStore";
import ConfirmCloseWorkspaceDialog from "../dialogs/ConfirmCloseWorkspaceDialog";
import OsTabItem from "./OsTabItem";
import styles from "./Sidebar.module.css";

export type SidebarMode = "expanded" | "compact" | "hidden";

type UtilityItem = { id: string; label: string; icon: "resources" | "files" | "settings" };

const UTILITIES: UtilityItem[] = [
  { id: "resources", label: "Resources", icon: "resources" },
  { id: "files", label: "Files", icon: "files" },
  { id: "settings", label: "Settings", icon: "settings" },
];

function Icon({ name }: { name: UtilityItem["icon"] }) {
  const common = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", "aria-hidden": true } as const;
  if (name === "resources")
    return (
      <svg {...common} stroke="currentColor" strokeWidth={1.35}>
        <rect x="1.5" y="9.5" width="3" height="5" rx="0.7" />
        <rect x="6.5" y="5.5" width="3" height="9" rx="0.7" />
        <rect x="11.5" y="2.5" width="3" height="12" rx="0.7" />
      </svg>
    );
  if (name === "files")
    return (
      <svg {...common} stroke="currentColor" strokeWidth={1.35}>
        <path d="M2.5 3.5A1 1 0 0 1 3.5 2.5H6l1.5 1.5H12.5A1 1 0 0 1 13.5 5V12.5A1 1 0 0 1 12.5 13.5H3.5A1 1 0 0 1 2.5 12.5V3.5Z" />
        <path d="M6 4H3.5" strokeLinecap="round" />
      </svg>
    );
  return (
    <svg {...common} stroke="currentColor" strokeWidth={1.35}>
      <circle cx="8" cy="8" r="2.2" />
      <path d="M8 3.2V4.2M8 11.8V12.8M12.8 8H11.8M4.2 8H3.2M11.1 4.9 10.35 5.65M5.65 10.35 4.9 11.1M11.1 11.1 10.35 10.35M5.65 5.65 4.9 4.9" strokeLinecap="round" />
    </svg>
  );
}

function CollapseIcon({ mode }: { mode: SidebarMode }) {
  if (mode === "compact") {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} aria-hidden>
        <path d="M6 3 10 8 6 13" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} aria-hidden>
      <path d="M10 3 6 8 10 13" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export default function Sidebar({
  mode,
  onToggleExpandCompact,
  onHide,
}: {
  mode: SidebarMode;
  onToggleExpandCompact: () => void;
  onHide: () => void;
}) {
  const osTabs = useWorkspaceStore((s) => s.osTabs);
  const activeId = useWorkspaceStore((s) => s.activeOsTabId);
  const createOsTab = useWorkspaceStore((s) => s.createOsTab);
  const switchOsTab = useWorkspaceStore((s) => s.switchOsTab);
  const renameOsTab = useWorkspaceStore((s) => s.renameOsTab);
  const closeOsTab = useWorkspaceStore((s) => s.closeOsTab);

  const [pendingCloseId, setPendingCloseId] = useState<string | null>(null);

  if (mode === "hidden") return null;

  const isCompact = mode === "compact";
  const atLimit = osTabs.length >= MAX_OS_TABS;
  const pendingTab = pendingCloseId ? osTabs.find((t) => t.id === pendingCloseId) : null;

  return (
    <>
      <aside className={`${styles.sidebar} ${isCompact ? styles.compact : styles.expanded}`} aria-label="Primary" data-mode={mode}>
        {/* Brand */}
        <div className={styles.brandRow}>
          <div className={styles.brand} aria-label="AzaleaOS">
            <span className={styles.brandMark} aria-hidden>🌸</span>
            {!isCompact && <span className={styles.brandWord}>AzaleaOS</span>}
          </div>
          {!isCompact && <span className={styles.brandEdition}>Full</span>}
        </div>

        <div className={styles.divider} aria-hidden />

        {/* OS Tabs */}
        <nav className={styles.navSection} aria-label="Workspaces">
          {!isCompact && <span className={styles.sectionLabel}>Workspaces</span>}
          <ul className={styles.osList} role="tablist" aria-label="Workspaces" aria-orientation="vertical">
            {osTabs.map((t, idx) => (
              <li key={t.id}>
                <OsTabItem
                  num={pad2(idx + 1)}
                  name={t.name}
                  active={t.id === activeId}
                  isCompact={isCompact}
                  onSwitch={() => switchOsTab(t.id)}
                  onRename={(next) => renameOsTab(t.id, next)}
                  onRequestClose={() => setPendingCloseId(t.id)}
                />
              </li>
            ))}
            <li>
              {isCompact ? (
                <button
                  type="button"
                  className={`${styles.osTab} ${styles.osTabNew} ${styles.osTabCompact}`}
                  onClick={() => createOsTab()}
                  disabled={atLimit}
                  aria-disabled={atLimit}
                  aria-label={atLimit ? "Workspace limit reached (10)" : "New OS Tab (Ctrl+Alt+N)"}
                  title={atLimit ? "Workspace limit reached (10)" : "New OS Tab - Ctrl+Alt+N"}
                >
                  <span className={styles.osNum} aria-hidden>+</span>
                </button>
              ) : (
                <button
                  type="button"
                  className={`${styles.osTab} ${styles.osTabNew}`}
                  onClick={() => createOsTab()}
                  disabled={atLimit}
                  aria-disabled={atLimit}
                  title={atLimit ? "Workspace limit reached (10)" : "New OS Tab - Ctrl+Alt+N"}
                >
                  <span className={styles.osNum} aria-hidden>+</span>
                  <span className={styles.osNameMuted}>New OS Tab</span>
                  {!atLimit && (
                    <span
                      aria-hidden
                      style={{
                        marginLeft: "auto",
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        color: "var(--color-text-faint)",
                      }}
                    >
                      Ctrl+Alt+N
                    </span>
                  )}
                </button>
              )}
            </li>
          </ul>
          {!isCompact && (
            <div className={styles.limitRow} aria-live="polite">
              <span>
                {osTabs.length} / {MAX_OS_TABS} workspaces
              </span>
              {atLimit && <span className={styles.limitReached}>Workspace limit reached (10)</span>}
            </div>
          )}
          {isCompact && (
            <div className={styles.limitRow} style={{ justifyContent: "center", paddingLeft: 0, paddingRight: 0 }} aria-live="polite">
              <span title={`${osTabs.length} / ${MAX_OS_TABS}`}>{osTabs.length}/{MAX_OS_TABS}</span>
            </div>
          )}
        </nav>

        <div className={styles.divider} aria-hidden />

        {/* Utility */}
        <nav className={styles.navSection} aria-label="Tools">
          {!isCompact && <span className={styles.sectionLabel}>Tools</span>}
          <ul className={styles.toolList} role="list" aria-label="Tools">
            {UTILITIES.map((u) => {
              const isResources = u.id === "resources";
              const isSettings = u.id === "settings";
              const isFiles = u.id === "files";
              const handleClick = () => {
                if (isResources) useResourceStore.getState().openCenter();
                else if (isSettings) useSettingsStore.getState().openSettings();
                else if (isFiles) useFilesystemStore.getState().open();
              };
              return (
                <li key={u.id}>
                  <button
                    type="button"
                    className={`${styles.toolBtn} ${isCompact ? styles.toolBtnCompact : ""}`}
                    aria-label={u.label}
                    title={isCompact ? u.label : u.label}
                    onClick={handleClick}
                  >
                    <span className={styles.toolIcon} aria-hidden>
                      <Icon name={u.icon} />
                    </span>
                    {!isCompact && <span className={styles.toolLabel}>{u.label}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className={styles.spacer} aria-hidden />

        {/* Footer */}
        <div className={styles.footer}>
          <button
            type="button"
            className={styles.toggleBtn}
            onClick={onToggleExpandCompact}
            aria-label={isCompact ? "Expand sidebar" : "Collapse sidebar"}
            title={isCompact ? "Expand - 240px" : "Collapse - 64px"}
          >
            <CollapseIcon mode={mode} />
          </button>
          <button
            type="button"
            className={styles.hideBtn}
            onClick={onHide}
            aria-label="Hide sidebar"
            title="Hide sidebar (Ctrl+Alt+A)"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} aria-hidden>
              <path d="M3 8H13M8 3V13" opacity={0} />
              <rect x="2.5" y="3.5" width="11" height="9" rx="1.2" />
              <path d="M5.5 3.5V12.5" />
              <path d="M10 7 7.5 8 10 9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {!isCompact && <span>Hide</span>}
          </button>
          {!isCompact && (
            <span className={styles.shortcutHint} aria-hidden>
              Ctrl+Alt+A
            </span>
          )}
        </div>
      </aside>

      <ConfirmCloseWorkspaceDialog
        open={!!pendingTab}
        workspaceName={pendingTab?.name ?? ""}
        onCancel={() => setPendingCloseId(null)}
        onConfirm={() => {
          if (pendingCloseId) closeOsTab(pendingCloseId);
          setPendingCloseId(null);
        }}
      />
    </>
  );
}
