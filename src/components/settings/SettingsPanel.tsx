import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSettingsStore } from "../../stores/settingsStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useAppTabStore } from "../../stores/appTabStore";
import { useUpdateStore } from "../../stores/updateStore";
import { CATEGORY_LABEL, CATEGORY_ORDER, type CategoryId } from "../../types/settings";
import { SettingRow, Switch, Select, Slider } from "./SettingRow";
import styles from "./SettingsPanel.module.css";

const CAT_ICON: Record<CategoryId, string> = {
  general: "◈",
  appearance: "◐",
  workspace: "▦",
  applications: "◧",
  resourceManagement: "▮",
  sidebar: "☰",
  shortcuts: "⌘",
  notifications: "◑",
  files: "⧉",
  performance: "⚡",
  privacy: "⬢",
  dataStorage: "⬣",
  updates: "↻",
  advanced: "⚙",
};

const ACCENT_PRESETS = ["#7c6dff", "#5b6ae8", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444"];

function LockBadge() {
  return <span className={styles.lockBadge}>Locked</span>;
}

export default function SettingsPanel(): JSX.Element | null {
  const isOpen = useSettingsStore((s) => s.isOpen);
  const activeCategory = useSettingsStore((s) => s.activeCategory);
  const settings = useSettingsStore((s) => s.settings);
  const toast = useSettingsStore((s) => s.toast);
  const setCategory = useSettingsStore((s) => s.setCategory);
  const closeSettings = useSettingsStore((s) => s.closeSettings);
  const updateSection = useSettingsStore((s) => s.updateSection);
  const resetSection = useSettingsStore((s) => s.resetSection);
  const resetAll = useSettingsStore((s) => s.resetAll);
  const clearCache = useSettingsStore((s) => s.clearCache);
  const exportDiagnostics = useSettingsStore((s) => s.exportDiagnostics);
  const openDataFolder = useSettingsStore((s) => s.openDataFolder);
  const setToast = useSettingsStore((s) => s.setToast);

  // update store (typed backend contract §B/G - no version compare, no verify, no exec)
  const upd = useUpdateStore((s) => ({
    currentVersion: s.currentVersion,
    channel: s.channel,
    checking: s.checking,
    available: s.available,
    availableVersion: s.availableVersion,
    downloadProgress: s.downloadProgress,
    installing: s.installing,
    error: s.error,
    restartRequired: s.restartRequired,
    offline: s.offline,
  }));
  const updActions = useUpdateStore((s) => ({
    checkForUpdates: s.checkForUpdates,
    download: s.download,
    install: s.install,
    cancel: s.cancel,
    setChannel: s.setChannel,
    dismissAvailable: s.dismissAvailable,
  }));

  const panelRef = useRef<HTMLDivElement>(null);
  const [shortcutFilter, setShortcutFilter] = useState("");
  const [isOnline, setIsOnline] = useState(() => typeof navigator !== "undefined" ? navigator.onLine : true);
  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  const osTabs = useWorkspaceStore((s) => s.osTabs);
  const activeOsTabId = useWorkspaceStore((s) => s.activeOsTabId);
  const appTabsByOsTab = useAppTabStore((s) => s.appTabsByOsTab);

  const totalApps = useMemo(() => Object.values(appTabsByOsTab).reduce((acc, arr) => acc + arr.length, 0), [appTabsByOsTab]);
  const activeOsApps = activeOsTabId ? (appTabsByOsTab[activeOsTabId]?.length ?? 0) : 0;

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const el = panelRef.current;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !el) return;
      const nodes = Array.from(el.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')).filter(n => !n.hasAttribute("disabled") && n.offsetParent !== null || n.tabIndex >= 0);
      // fallback to all focusables if filtered empty
      const focusables = nodes.length ? nodes : Array.from(el.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')).filter(n => !n.hasAttribute("disabled"));
      if (focusables.length === 0) { e.preventDefault(); return; }
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    el?.addEventListener("keydown", onKey);
    return () => {
      el?.removeEventListener("keydown", onKey);
      try { prev?.focus(); } catch { /* ignore */ }
    };
  }, [isOpen]);

  const onBackdrop = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) closeSettings();
    },
    [closeSettings],
  );

  // keyboard nav for categories
  const onNavKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const idx = CATEGORY_ORDER.indexOf(activeCategory);
        const next = e.key === "ArrowDown" ? (idx + 1) % CATEGORY_ORDER.length : (idx - 1 + CATEGORY_ORDER.length) % CATEGORY_ORDER.length;
        setCategory(CATEGORY_ORDER[next]!);
      }
    },
    [activeCategory, setCategory],
  );

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(t);
  }, [toast, setToast]);

  if (!isOpen) return null;

  const filteredShortcuts = Object.entries(settings.shortcuts.map).filter(
    ([k, v]) => !shortcutFilter || k.toLowerCase().includes(shortcutFilter.toLowerCase()) || v.toLowerCase().includes(shortcutFilter.toLowerCase()),
  );

  return (
    <div className={styles.backdrop} role="presentation" onMouseDown={onBackdrop}>
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label="AzaleaOS Settings"
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>AzaleaOS Settings - Full • Azalea only</h2>
            <p className={styles.subtitle}>Local-first • No Windows Settings clone • Native backend is authority for limits</p>
          </div>
          <button type="button" className={styles.closeBtn} onClick={closeSettings} aria-label="Close Settings" title="Close Settings (Esc)">×</button>
        </div>

        <div className={styles.layout}>
          <nav className={styles.nav} aria-label="Settings categories" onKeyDown={onNavKeyDown}>
            {CATEGORY_ORDER.map((id) => (
              <button
                key={id}
                type="button"
                className={`${styles.navItem} ${activeCategory === id ? styles.navItemActive : ""}`}
                aria-selected={activeCategory === id}
                role="tab"
                onClick={() => setCategory(id)}
              >
                <span className={styles.navIcon} aria-hidden>{CAT_ICON[id]}</span>
                <span className={styles.navLabel}>{CATEGORY_LABEL[id]}</span>
              </button>
            ))}
          </nav>

          <div className={styles.content}>
            {toast && <div className={styles.toast} role="status" aria-live="polite">{toast}</div>}

            {activeCategory === "general" && (
              <section aria-label="General">
                <h3 className={styles.sectionTitle}>General</h3>
                <p className={styles.sectionDesc}>Startup and workspace behavior - calm defaults, no surprises.</p>
                <div className={styles.card}>
                  <SettingRow label="Launch with Windows" description="Start AzaleaOS when Windows starts" htmlFor="gen-launch">
                    <Switch id="gen-launch" checked={settings.general.launchWithWindows} onChange={(v) => updateSection("general", { launchWithWindows: v })} />
                  </SettingRow>
                  <SettingRow label="Start minimized" description="Open to tray, not foreground" htmlFor="gen-min">
                    <Switch id="gen-min" checked={settings.general.startMinimized} onChange={(v) => updateSection("general", { startMinimized: v })} />
                  </SettingRow>
                  <SettingRow label="Restore last workspace" description="Reopen the last active OS Tab" htmlFor="gen-restore-ws">
                    <Switch id="gen-restore-ws" checked={settings.general.restoreLastWorkspace} onChange={(v) => updateSection("general", { restoreLastWorkspace: v })} />
                  </SettingRow>
                  <SettingRow label="Restore app layout" description="Reopen app tabs per workspace" htmlFor="gen-restore-layout">
                    <Switch id="gen-restore-layout" checked={settings.general.restoreAppLayout} onChange={(v) => updateSection("general", { restoreAppLayout: v })} />
                  </SettingRow>
                  <SettingRow label="Confirm before closing workspace" description="Show dialog when closing a workspace with apps" htmlFor="gen-confirm">
                    <Switch id="gen-confirm" checked={settings.general.confirmClose} onChange={(v) => updateSection("general", { confirmClose: v })} />
                  </SettingRow>
                  <div className={styles.rowActions}><button type="button" className={styles.ghostBtn} onClick={() => resetSection("general")}>Reset General</button></div>
                </div>
              </section>
            )}

            {activeCategory === "appearance" && (
              <section aria-label="Appearance">
                <h3 className={styles.sectionTitle}>Appearance</h3>
                <p className={styles.sectionDesc}>Azalea surfaces - theme, accent, motion.</p>
                <div className={styles.card}>
                  <SettingRow label="Theme" htmlFor="app-theme">
                    <Select id="app-theme" value={settings.appearance.theme} onChange={(v) => updateSection("appearance", { theme: v as never })} options={[{ value: "dark", label: "Dark" }, { value: "light", label: "Light" }, { value: "system", label: "System" }]} />
                  </SettingRow>
                  <SettingRow label="Accent color" description="Used for active states and focus">
                    <span className={styles.accentRow}>
                      {ACCENT_PRESETS.map((c) => (
                        <button key={c} type="button" aria-label={`Accent ${c}`} className={`${styles.swatch} ${settings.appearance.accentColor === c ? styles.swatchActive : ""}`} style={{ background: c }} onClick={() => updateSection("appearance", { accentColor: c })} />
                      ))}
                      <input type="color" value={settings.appearance.accentColor} onChange={(e) => updateSection("appearance", { accentColor: e.target.value })} className={styles.colorInput} aria-label="Custom accent" />
                    </span>
                  </SettingRow>
                  <SettingRow label="Sidebar default" htmlFor="app-sidebar-mode">
                    <Select id="app-sidebar-mode" value={settings.appearance.sidebarModeDefault} onChange={(v) => updateSection("appearance", { sidebarModeDefault: v as never })} options={[{ value: "expanded", label: "Expanded" }, { value: "compact", label: "Compact" }]} />
                  </SettingRow>
                  <SettingRow label="Animation level" htmlFor="app-anim">
                    <Select id="app-anim" value={settings.appearance.animationLevel} onChange={(v) => updateSection("appearance", { animationLevel: v as never })} options={[{ value: "full", label: "Full" }, { value: "reduced", label: "Reduced" }, { value: "none", label: "None" }]} />
                  </SettingRow>
                  <SettingRow label="Transparency" description="Panel translucency">
                    <Slider id="app-trans" value={settings.appearance.transparency} min={0} max={100} onChange={(v) => updateSection("appearance", { transparency: v })} />
                  </SettingRow>
                  <div className={styles.rowActions}><button type="button" className={styles.ghostBtn} onClick={() => resetSection("appearance")}>Reset Appearance</button></div>
                </div>
              </section>
            )}

            {activeCategory === "workspace" && (
              <section aria-label="Workspace">
                <h3 className={styles.sectionTitle}>Workspace</h3>
                <p className={styles.sectionDesc}>Limits are enforced by the native backend - cannot be increased from Settings.</p>
                <div className={styles.infoGrid}>
                  <div className={styles.infoCard}>
                    <span className={styles.infoLabel}>Max OS Tabs</span>
                    <span className={styles.infoValue}>{settings.workspace.maxOsTabsInfo} <span className={styles.lockIcon} aria-hidden>🔒</span></span>
                    <span className={styles.infoHint}>Limit enforced by native backend</span>
                  </div>
                  <div className={styles.infoCard}>
                    <span className={styles.infoLabel}>Max Apps / OS Tab</span>
                    <span className={styles.infoValue}>{settings.workspace.maxAppsPerOsInfo} <span aria-hidden>🔒</span></span>
                    <span className={styles.infoHint}>Cannot be increased from Settings</span>
                  </div>
                </div>
                <div className={styles.card} style={{ marginTop: 12 }}>
                  <div className={styles.statRow}><span>Current workspaces</span><strong>{osTabs.length} / 10</strong></div>
                  <div className={styles.statRow}><span>Apps in active workspace</span><strong>{activeOsApps} / 10</strong></div>
                  <div className={styles.statRow}><span>Total managed app tabs</span><strong>{totalApps}</strong></div>
                  <p className={styles.mutedNote}>Native backend/build identity is the authority. Frontend cannot exceed these limits.</p>
                </div>
              </section>
            )}

            {activeCategory === "applications" && (
              <section aria-label="Applications">
                <h3 className={styles.sectionTitle}>Applications</h3>
                <div className={styles.card}>
                  <SettingRow label="Auto-discover Windows apps" htmlFor="apps-auto">
                    <Switch id="apps-auto" checked={settings.applications.autoDiscover} onChange={(v) => updateSection("applications", { autoDiscover: v })} />
                  </SettingRow>
                  <div className={styles.rowActions}>
                    <button type="button" className={styles.primaryBtn} onClick={() => setToast("App library refreshed")}>Refresh app library</button>
                    <button type="button" className={styles.ghostBtn} onClick={() => resetSection("applications")}>Reset</button>
                  </div>
                  <div className={styles.tableWrap}>
                    <table className={styles.miniTable}>
                      <thead><tr><th>App</th><th>Policy</th></tr></thead>
                      <tbody>
                        {Object.entries(settings.applications.perAppPolicy).map(([app, pol]) => (
                          <tr key={app}>
                            <td style={{ textTransform: "capitalize" }}>{app}</td>
                            <td>
                              <select value={pol} onChange={(e) => updateSection("applications", { perAppPolicy: { ...settings.applications.perAppPolicy, [app]: e.target.value as never } })} className={styles.selectSm}>
                                <option value="smart">Smart</option><option value="never">Never optimize</option><option value="preferBackground">Prefer background</option><option value="gameProtection">Game protection</option>
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            )}

            {activeCategory === "resourceManagement" && (
              <section aria-label="Resource Management">
                <h3 className={styles.sectionTitle}>Resource Management</h3>
                <p className={styles.sectionDesc}>Adaptive optimization • Memory pressure • Background resource reduction.</p>
                <div className={styles.card}>
                  <SettingRow label="Adaptive Resource Management" htmlFor="rm-adaptive">
                    <Switch id="rm-adaptive" checked={settings.resourceManagement.adaptive} onChange={(v) => updateSection("resourceManagement", { adaptive: v })} />
                  </SettingRow>
                  <div className={styles.radioGroup} role="radiogroup" aria-label="Adaptive mode">
                    {(["Smart", "Conservative", "Aggressive"] as const).map((m) => (
                      <label key={m} className={`${styles.radio} ${settings.resourceManagement.mode === m ? styles.radioActive : ""}`}>
                        <input type="radio" name="rm-mode" value={m} checked={settings.resourceManagement.mode === m} onChange={() => updateSection("resourceManagement", { mode: m })} />
                        {m}
                      </label>
                    ))}
                  </div>
                  <div className={styles.tableWrap}>
                    <table className={styles.miniTable}>
                      <thead><tr><th>App</th><th>Policy</th></tr></thead>
                      <tbody>
                        {Object.entries(settings.resourceManagement.perApp).map(([app, pol]) => (
                          <tr key={app}>
                            <td style={{ textTransform: "capitalize" }}>{app}</td>
                            <td>
                              <select value={pol} onChange={(e) => updateSection("resourceManagement", { perApp: { ...settings.resourceManagement.perApp, [app]: e.target.value as never } })} className={styles.selectSm}>
                                <option value="smart">Smart</option><option value="never">Never optimize</option><option value="preferBackground">Prefer background</option><option value="gameProtection">Game protection</option>
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className={styles.rowActions}><button type="button" className={styles.ghostBtn} onClick={() => resetSection("resourceManagement")}>Reset</button></div>
                </div>
              </section>
            )}

            {activeCategory === "sidebar" && (
              <section aria-label="Sidebar and Navigation">
                <h3 className={styles.sectionTitle}>Sidebar & Navigation</h3>
                <div className={styles.card}>
                  <SettingRow label="Default mode" htmlFor="sb-mode">
                    <Select id="sb-mode" value={settings.sidebar.defaultMode} onChange={(v) => updateSection("sidebar", { defaultMode: v as never })} options={[{ value: "expanded", label: "Expanded" }, { value: "compact", label: "Compact" }]} />
                  </SettingRow>
                  <SettingRow label="Position" description="Left only - spatial consistency">
                    <span className={styles.lockedVal}>Left <LockBadge /></span>
                  </SettingRow>
                  <SettingRow label="Shortcut" description="Toggle sidebar">
                    <span className={styles.kbd}>Ctrl + Alt + A</span>
                  </SettingRow>
                  <SettingRow label="Auto-hide" htmlFor="sb-autohide">
                    <Switch id="sb-autohide" checked={settings.sidebar.autoHide} onChange={(v) => updateSection("sidebar", { autoHide: v })} />
                  </SettingRow>
                  <SettingRow label="Show app count" htmlFor="sb-count">
                    <Switch id="sb-count" checked={settings.sidebar.showAppCount} onChange={(v) => updateSection("sidebar", { showAppCount: v })} />
                  </SettingRow>
                  <SettingRow label="Show resource state" htmlFor="sb-res">
                    <Switch id="sb-res" checked={settings.sidebar.showResourceState} onChange={(v) => updateSection("sidebar", { showResourceState: v })} />
                  </SettingRow>
                  <div className={styles.rowActions}><button type="button" className={styles.ghostBtn} onClick={() => resetSection("sidebar")}>Reset</button></div>
                </div>
              </section>
            )}

            {activeCategory === "shortcuts" && (
              <section aria-label="Keyboard Shortcuts">
                <h3 className={styles.sectionTitle}>Keyboard Shortcuts</h3>
                <p className={styles.sectionDesc}>Read-only • Shortcuts cannot conflict with Windows critical bindings.</p>
                <input type="text" placeholder="Filter shortcuts..." value={shortcutFilter} onChange={(e) => setShortcutFilter(e.target.value)} className={styles.filterInput} aria-label="Filter shortcuts" />
                <div className={styles.card}>
                  <table className={styles.miniTable}>
                    <thead><tr><th>Action</th><th>Shortcut</th></tr></thead>
                    <tbody>
                      {filteredShortcuts.map(([action, combo]) => (
                        <tr key={action}><td>{action}</td><td><span className={styles.kbd}>{combo}</span></td></tr>
                      ))}
                      {filteredShortcuts.length === 0 && <tr><td colSpan={2} style={{ color: "var(--color-text-faint)", textAlign: "center" }}>No matches</td></tr>}
                    </tbody>
                  </table>
                  <p className={styles.mutedNote}>Reassignment with conflict detection is planned - currently view-only.</p>
                </div>
              </section>
            )}

            {activeCategory === "notifications" && (
              <section aria-label="Notifications">
                <h3 className={styles.sectionTitle}>Notifications</h3>
                <p className={styles.sectionDesc}>Only Azalea notices - no Windows notification clone.</p>
                <div className={styles.card}>
                  <SettingRow label="Optimization notice" htmlFor="n-opt"><Switch id="n-opt" checked={settings.notifications.optimizationNotice} onChange={(v) => updateSection("notifications", { optimizationNotice: v })} /></SettingRow>
                  <SettingRow label="Critical memory pressure" htmlFor="n-mem"><Switch id="n-mem" checked={settings.notifications.criticalMemory} onChange={(v) => updateSection("notifications", { criticalMemory: v })} /></SettingRow>
                  <SettingRow label="App detection" htmlFor="n-app"><Switch id="n-app" checked={settings.notifications.appDetection} onChange={(v) => updateSection("notifications", { appDetection: v })} /></SettingRow>
                  <SettingRow label="Unsupported game detection" htmlFor="n-game"><Switch id="n-game" checked={settings.notifications.unsupportedGame} onChange={(v) => updateSection("notifications", { unsupportedGame: v })} /></SettingRow>
                  <SettingRow label="Updates" htmlFor="n-upd"><Switch id="n-upd" checked={settings.notifications.update} onChange={(v) => updateSection("notifications", { update: v })} /></SettingRow>
                  <SettingRow label="Recovery" htmlFor="n-rec"><Switch id="n-rec" checked={settings.notifications.recovery} onChange={(v) => updateSection("notifications", { recovery: v })} /></SettingRow>
                  <div className={styles.rowActions}><button type="button" className={styles.ghostBtn} onClick={() => resetSection("notifications")}>Reset</button></div>
                </div>
              </section>
            )}

            {activeCategory === "files" && (
              <section aria-label="Files and Integration">
                <h3 className={styles.sectionTitle}>Files & Integration</h3>
                <div className={styles.card}>
                  <SettingRow label="Default save location" description="Windows filesystem - Azalea is not a new filesystem">
                    <span className={styles.inlineRow}>
                      <input type="text" value={settings.files.defaultSaveLocation} onChange={(e) => updateSection("files", { defaultSaveLocation: e.target.value })} className={styles.textInput} aria-label="Default save location" />
                      <button type="button" className={styles.ghostBtn} onClick={() => setToast("Browse - Windows picker")}>Browse</button>
                    </span>
                  </SettingRow>
                  <SettingRow label="Use Windows File Picker" htmlFor="f-picker"><Switch id="f-picker" checked={settings.files.useWindowsPicker} onChange={(v) => updateSection("files", { useWindowsPicker: v })} /></SettingRow>
                  <SettingRow label="Default open behavior" htmlFor="f-open">
                    <Select id="f-open" value={settings.files.defaultOpenBehavior} onChange={(v) => updateSection("files", { defaultOpenBehavior: v as never })} options={[{ value: "inAzalea", label: "In Azalea" }, { value: "external", label: "External" }]} />
                  </SettingRow>
                  <SettingRow label="Show recent files" htmlFor="f-recent"><Switch id="f-recent" checked={settings.files.showRecent} onChange={(v) => updateSection("files", { showRecent: v })} /></SettingRow>
                  <div className={styles.rowActions}><button type="button" className={styles.ghostBtn} onClick={() => resetSection("files")}>Reset</button></div>
                </div>
              </section>
            )}

            {activeCategory === "performance" && (
              <section aria-label="Performance">
                <h3 className={styles.sectionTitle}>Performance - Azalea itself</h3>
                <div className={styles.card}>
                  <SettingRow label="Animations" htmlFor="perf-anim"><Switch id="perf-anim" checked={settings.performance.animations} onChange={(v) => updateSection("performance", { animations: v })} /></SettingRow>
                  <SettingRow label="UI update frequency" htmlFor="perf-freq">
                    <Select id="perf-freq" value={settings.performance.uiUpdateFrequency} onChange={(v) => updateSection("performance", { uiUpdateFrequency: v as never })} options={[{ value: "normal", label: "Normal" }, { value: "reduced", label: "Reduced" }]} />
                  </SettingRow>
                  <SettingRow label="Hardware acceleration" htmlFor="perf-hw"><Switch id="perf-hw" checked={settings.performance.hardwareAcceleration} onChange={(v) => updateSection("performance", { hardwareAcceleration: v })} /></SettingRow>
                  <SettingRow label="Background activity" htmlFor="perf-bg"><Switch id="perf-bg" checked={settings.performance.backgroundActivity} onChange={(v) => updateSection("performance", { backgroundActivity: v })} /></SettingRow>
                  <SettingRow label="Startup optimization" htmlFor="perf-start"><Switch id="perf-start" checked={settings.performance.startupOptimization} onChange={(v) => updateSection("performance", { startupOptimization: v })} /></SettingRow>
                  <div className={styles.rowActions}><button type="button" className={styles.ghostBtn} onClick={() => resetSection("performance")}>Reset</button></div>
                </div>
              </section>
            )}

            {activeCategory === "privacy" && (
              <section aria-label="Privacy">
                <h3 className={styles.sectionTitle}>Privacy</h3>
                <p className={styles.sectionDesc}>Local-first • No cloud required.</p>
                <div className={styles.card}>
                  <SettingRow label="Telemetry"><span className={styles.lockedVal}>OFF <LockBadge /></span></SettingRow>
                  <SettingRow label="Cloud Sync"><span className={styles.lockedVal}>OFF <LockBadge /></span></SettingRow>
                  <SettingRow label="Network requirement"><span className={styles.lockedVal}>NONE <LockBadge /></span></SettingRow>
                  <SettingRow label="Crash report" htmlFor="priv-crash">
                    <Select id="priv-crash" value={settings.privacy.crashReport} onChange={(v) => updateSection("privacy", { crashReport: v as never })} options={[{ value: "ask", label: "Ask user" }, { value: "localOnly", label: "Local only" }]} />
                  </SettingRow>
                  <p className={styles.mutedNote}>Telemetry and Cloud Sync are forced OFF in this build. Core features require no network.</p>
                </div>
              </section>
            )}

            {activeCategory === "dataStorage" && (
              <section aria-label="Data and Storage">
                <h3 className={styles.sectionTitle}>Data & Storage</h3>
                <div className={styles.infoGrid}>
                  <div className={styles.infoCard}><span className={styles.infoLabel}>Config</span><span className={styles.infoValue}>{settings.dataStorage.configSizeKb} KB</span></div>
                  <div className={styles.infoCard}><span className={styles.infoLabel}>Cache</span><span className={styles.infoValue}>{settings.dataStorage.cacheKb} KB</span></div>
                  <div className={styles.infoCard}><span className={styles.infoLabel}>Logs</span><span className={styles.infoValue}>{settings.dataStorage.logsKb} KB</span></div>
                  <div className={styles.infoCard}><span className={styles.infoLabel}>Workspace metadata</span><span className={styles.infoValue}>{settings.dataStorage.workspaceMetaKb} KB</span></div>
                </div>
                <div className={styles.card} style={{ marginTop: 12 }}>
                  <div className={styles.btnRow}>
                    <button type="button" className={styles.ghostBtn} onClick={openDataFolder}>Open Data Folder</button>
                    <button type="button" className={styles.ghostBtn} onClick={clearCache}>Clear Cache</button>
                    <button type="button" className={styles.primaryBtn} onClick={exportDiagnostics}>Export Diagnostics</button>
                  </div>
                  <p className={styles.mutedNote}>Paths: %LOCALAPPDATA%\AzaleaOS\Full • Cache • Logs</p>
                </div>
              </section>
            )}

            {activeCategory === "updates" && (
              <section aria-label="Updates">
                <h3 className={styles.sectionTitle}>Updates</h3>
                <p className={styles.sectionDesc}>Local-first core • Update path may require network. Frontend delegates verify/install to Rust updater.</p>

                {/* Offline - valid UI state, core remains usable (§A/D) */}
                {(upd.offline || !isOnline) && !upd.checking && !upd.installing && upd.downloadProgress === 0 && !upd.error && !upd.available && !upd.restartRequired ? (
                  <div className={styles.card} role="status" aria-live="polite">
                    <div style={{ padding: "10px 0", display: "grid", gap: 6 }}>
                      <strong style={{ fontSize: 13 }}>Update check unavailable.</strong>
                      <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Core features remain available offline.</span>
                      <span style={{ fontSize: 11, color: "var(--color-text-faint)" }}>AzaleaOS Full {upd.currentVersion} • Channel {upd.channel}</span>
                    </div>
                    <SettingRow label="Channel" htmlFor="upd-chan-off">
                      <Select id="upd-chan-off" value={upd.channel} onChange={(v) => void updActions.setChannel(v as never)} options={[{ value: "stable", label: "Stable" }, { value: "beta", label: "Beta" }]} />
                    </SettingRow>
                    <SettingRow label="Automatic check" htmlFor="upd-auto-off"><Switch id="upd-auto-off" checked={settings.updates.autoCheck} onChange={(v) => updateSection("updates", { autoCheck: v })} /></SettingRow>
                    <div className={styles.rowActions}>
                      <button type="button" className={styles.primaryBtn} onClick={() => void updActions.checkForUpdates()}>Retry check</button>
                      <button type="button" className={styles.ghostBtn} onClick={() => resetSection("updates")}>Reset</button>
                    </div>
                  </div>
                ) : upd.checking ? (
                  <div className={styles.card} aria-busy="true" aria-live="polite">
                    <div style={{ padding: "14px 0", display: "grid", gap: 10 }}>
                      <div style={{ height: 14, borderRadius: 6, background: "var(--color-bg-subtle)", animation: "pulse 1.2s ease-in-out infinite" }} />
                      <div style={{ height: 10, width: "62%", borderRadius: 6, background: "var(--color-bg-subtle)", animation: "pulse 1.2s ease-in-out infinite 0.15s" }} />
                      <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Checking for updates… AzaleaOS Full {upd.currentVersion}</span>
                    </div>
                    <div className={styles.rowActions}>
                      <button type="button" className={styles.ghostBtn} onClick={() => void updActions.cancel()}>Cancel</button>
                    </div>
                  </div>
                ) : upd.error ? (
                  <div className={styles.card} role="alert" aria-live="assertive">
                    <div style={{ padding: "10px 0", display: "grid", gap: 6 }}>
                      <strong style={{ fontSize: 13 }}>Update couldn't be completed.</strong>
                      <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Your current version is still installed.</span>
                      <span style={{ fontSize: 11, color: "var(--color-text-faint)", wordBreak: "break-word" }}>{upd.error}</span>
                      <span style={{ fontSize: 11, color: "var(--color-text-faint)" }}>AzaleaOS Full {upd.currentVersion} • Channel {upd.channel}</span>
                    </div>
                    <SettingRow label="Channel" htmlFor="upd-chan-err">
                      <Select id="upd-chan-err" value={upd.channel} onChange={(v) => void updActions.setChannel(v as never)} options={[{ value: "stable", label: "Stable" }, { value: "beta", label: "Beta" }]} />
                    </SettingRow>
                    <div className={styles.rowActions}>
                      <button type="button" className={styles.primaryBtn} onClick={() => void updActions.checkForUpdates()}>Retry</button>
                      <button type="button" className={styles.ghostBtn} onClick={() => { useUpdateStore.setState({ error: undefined }); }}>Dismiss</button>
                    </div>
                  </div>
                ) : upd.restartRequired ? (
                  <div className={styles.card} role="status" aria-live="polite">
                    <div style={{ padding: "10px 0", display: "grid", gap: 6 }}>
                      <strong style={{ fontSize: 13 }}>Update installed - restart required.</strong>
                      <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>AzaleaOS Full {upd.availableVersion ?? upd.currentVersion} will be active after restart.</span>
                      <span style={{ fontSize: 11, color: "var(--color-text-faint)" }}>Your current version is still installed until restart.</span>
                    </div>
                    <div className={styles.rowActions}>
                      <button type="button" className={styles.primaryBtn} onClick={() => setToast("Restart requested - backend will restart when ready")}>Restart now</button>
                      <button type="button" className={styles.ghostBtn} onClick={() => useUpdateStore.setState({ restartRequired: false })}>Later</button>
                    </div>
                  </div>
                ) : upd.installing ? (
                  <div className={styles.card} aria-live="polite" aria-busy="true">
                    <div style={{ padding: "10px 0", display: "grid", gap: 8, placeItems: "start" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}>
                        <span style={{ width: 16, height: 16, border: "2px solid var(--color-border-strong)", borderTopColor: "var(--color-accent)", borderRadius: "50%", display: "inline-block", animation: "spin 0.8s linear infinite" }} aria-hidden />
                        Installing update…
                      </span>
                      <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>AzaleaOS will restart when ready.</span>
                      <span style={{ fontSize: 11, color: "var(--color-text-faint)" }}>AzaleaOS Full {upd.availableVersion ?? upd.currentVersion} • via backend updater</span>
                    </div>
                    <div className={styles.rowActions}>
                      <button type="button" className={styles.ghostBtn} onClick={() => void updActions.cancel()}>Cancel</button>
                    </div>
                  </div>
                ) : upd.downloadProgress > 0 && upd.downloadProgress < 100 ? (
                  <div className={styles.card} aria-live="polite" aria-busy="true">
                    <div style={{ padding: "10px 0", display: "grid", gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>Downloading update… {upd.downloadProgress}%</span>
                      <div style={{ height: 8, borderRadius: 999, background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", overflow: "hidden" }}>
                        <div style={{ width: `${upd.downloadProgress}%`, height: "100%", background: "var(--color-accent)", transition: "width 200ms ease" }} />
                      </div>
                      <span style={{ fontSize: 11, color: "var(--color-text-faint)" }}>AzaleaOS Full {upd.availableVersion ?? "0.2.0"} • verified by backend updater</span>
                    </div>
                    <div className={styles.rowActions}>
                      <button type="button" className={styles.ghostBtn} onClick={() => void updActions.cancel()}>Cancel</button>
                    </div>
                  </div>
                ) : upd.downloadProgress === 100 && !upd.restartRequired && !upd.installing ? (
                  <div className={styles.card} aria-live="polite">
                    <div style={{ padding: "10px 0", display: "grid", gap: 6 }}>
                      <strong style={{ fontSize: 13 }}>Download complete - ready to install.</strong>
                      <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>AzaleaOS Full {upd.availableVersion} downloaded. Install via backend updater.</span>
                    </div>
                    <div className={styles.rowActions}>
                      <button type="button" className={styles.primaryBtn} onClick={() => void updActions.install()}>Install now</button>
                      <button type="button" className={styles.ghostBtn} onClick={() => void updActions.cancel()}>Cancel</button>
                    </div>
                  </div>
                ) : upd.available && upd.availableVersion ? (
                  <div className={styles.card} role="status" aria-live="polite">
                    <div style={{ padding: "10px 0", display: "grid", gap: 6 }}>
                      <strong style={{ fontSize: 13 }}>AzaleaOS Full {upd.availableVersion} is available.</strong>
                      <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Current: {upd.currentVersion} • Channel: {upd.channel}</span>
                    </div>
                    <SettingRow label="Channel" htmlFor="upd-chan-av">
                      <Select id="upd-chan-av" value={upd.channel} onChange={(v) => void updActions.setChannel(v as never)} options={[{ value: "stable", label: "Stable" }, { value: "beta", label: "Beta" }]} />
                    </SettingRow>
                    <SettingRow label="Automatic check" htmlFor="upd-auto-av"><Switch id="upd-auto-av" checked={settings.updates.autoCheck} onChange={(v) => updateSection("updates", { autoCheck: v })} /></SettingRow>
                    <div className={styles.rowActions}>
                      <button type="button" className={styles.ghostBtn} onClick={() => setToast("Release notes - AzaleaOS Full 0.2.0: adaptive polish, updater hardening")}>View Release Notes</button>
                      <button
                        type="button"
                        className={styles.primaryBtn}
                        onClick={async () => {
                          await updActions.download();
                          const s = useUpdateStore.getState();
                          if (s.downloadProgress === 100 && !s.error && !s.offline) await s.install();
                        }}
                      >
                        Update Now
                      </button>
                      <button type="button" className={styles.ghostBtn} onClick={() => updActions.dismissAvailable()}>Later</button>
                    </div>
                  </div>
                ) : (
                  <div className={styles.card} role="status" aria-live="polite">
                    <div style={{ padding: "10px 0", display: "grid", gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>You're up to date.</span>
                      <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>AzaleaOS Full {upd.currentVersion}</span>
                      {upd.availableVersion ? <span style={{ fontSize: 11, color: "var(--color-text-faint)" }}>Latest: {upd.availableVersion}</span> : null}
                    </div>
                    <SettingRow label="Channel" htmlFor="upd-chan">
                      <Select id="upd-chan" value={upd.channel} onChange={(v) => void updActions.setChannel(v as never)} options={[{ value: "stable", label: "Stable" }, { value: "beta", label: "Beta" }]} />
                    </SettingRow>
                    <SettingRow label="Automatic check" htmlFor="upd-auto"><Switch id="upd-auto" checked={settings.updates.autoCheck} onChange={(v) => updateSection("updates", { autoCheck: v })} /></SettingRow>
                    <div className={styles.rowActions}>
                      <button type="button" className={styles.primaryBtn} onClick={() => void updActions.checkForUpdates()}>Check for update</button>
                      <button type="button" className={styles.ghostBtn} onClick={() => resetSection("updates")}>Reset</button>
                    </div>
                    {typeof navigator !== "undefined" && !isOnline ? (
                      <p className={styles.mutedNote}>Offline - Core features remain available offline. Update check will resume when online.</p>
                    ) : null}
                  </div>
                )}
              </section>
            )}

            {activeCategory === "advanced" && (
              <section aria-label="Advanced">
                <h3 className={styles.sectionTitle}>Advanced</h3>
                <div className={styles.card}>
                  <SettingRow label="Hardware acceleration (advanced)" htmlFor="adv-hw"><Switch id="adv-hw" checked={settings.advanced.hardwareAccelerationAdvanced} onChange={(v) => updateSection("advanced", { hardwareAccelerationAdvanced: v })} /></SettingRow>
                  <SettingRow label="Diagnostics level" htmlFor="adv-diag">
                    <Select id="adv-diag" value={settings.advanced.diagnosticsLevel} onChange={(v) => updateSection("advanced", { diagnosticsLevel: v as never })} options={[{ value: "minimal", label: "Minimal" }, { value: "verbose", label: "Verbose" }]} />
                  </SettingRow>
                  <div className={styles.rowActions}>
                    <button type="button" className={styles.dangerBtn} onClick={resetAll}>Reset all settings</button>
                  </div>
                  <p className={styles.mutedNote}>Reset restores all 14 categories to Azalea Full defaults.</p>
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
