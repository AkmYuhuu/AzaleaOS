import { useCallback, useMemo } from "react";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useAppTabStore } from "../../stores/appTabStore";
import { MAX_APPS_PER_OS_TAB } from "../../types/workspace";
import AppTab from "./AppTab";
import styles from "./AppTabBar.module.css";

export default function AppTabBar() {
  const activeOsTabId = useWorkspaceStore((s) => s.activeOsTabId);
  // honey: scoped selectors - only active OS Tab slice, not full map (§28 rerender)
  const appTabs = useAppTabStore((s) => (activeOsTabId ? s.appTabsByOsTab[activeOsTabId] ?? [] : []));
  const activeAppTabId = useAppTabStore((s) => (activeOsTabId ? s.activeAppTabIdByOsTab[activeOsTabId] ?? null : null));
  const addAppTab = useAppTabStore((s) => s.addAppTab);
  const closeAppTab = useAppTabStore((s) => s.closeAppTab);
  const switchAppTab = useAppTabStore((s) => s.switchAppTab);

  const handleSwitch = useCallback((id: string) => { if (activeOsTabId) switchAppTab(activeOsTabId, id); }, [activeOsTabId, switchAppTab]);
  const handleClose = useCallback((id: string) => { if (activeOsTabId) closeAppTab(activeOsTabId, id); }, [activeOsTabId, closeAppTab]);
  const atLimit = appTabs.length >= MAX_APPS_PER_OS_TAB;

  // roving focus: arrow navigation within tablist
  const onKeyDownBar = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") return;
    const tabs = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]'));
    if (tabs.length === 0) return;
    const activeIdx = tabs.findIndex((t) => t.getAttribute("aria-selected") === "true");
    let next = activeIdx;
    if (e.key === "ArrowRight") next = Math.min(tabs.length - 1, activeIdx + 1);
    if (e.key === "ArrowLeft") next = Math.max(0, activeIdx - 1);
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = tabs.length - 1;
    if (next !== activeIdx && tabs[next]) { e.preventDefault(); (tabs[next] as HTMLElement).focus(); (tabs[next] as HTMLElement).click(); }
  }, []);

  const nextDescriptor = useMemo(() => {
    if (!activeOsTabId) return { id: "app", name: "App", category: "system" as const, supported: true, source: "azalea" as const };
    const used = new Set(appTabs.map((t) => t.appId));
    const allDescriptors = [
      { id: "vscode", name: "VS Code", category: "developer" as const, supported: true, source: "windows" as const },
      { id: "chrome", name: "Chrome", category: "browser" as const, supported: true, source: "windows" as const },
      { id: "terminal", name: "Terminal", category: "utility" as const, supported: true, source: "windows" as const },
    ];
    const unused = allDescriptors.find((d) => !used.has(d.id));
    if (unused) return unused;
    return allDescriptors[appTabs.length % allDescriptors.length]!;
  }, [activeOsTabId, appTabs]);

  if (!activeOsTabId) return null;

  return (
    <div className={styles.bar} role="tablist" aria-label="Application tabs" onKeyDown={onKeyDownBar}>
      <div className={styles.inner}>
        {appTabs.map((tab) => (
          <AppTab
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeAppTabId}
            onSelect={() => handleSwitch(tab.id)}
            onClose={() => handleClose(tab.id)}
          />
        ))}

        <button
          type="button"
          className={styles.newTab}
          disabled={atLimit}
          aria-disabled={atLimit ? "true" : "false"}
          aria-label={atLimit ? "App limit reached (10) - Full edition" : `New app - ${nextDescriptor.name}`}
          title={atLimit ? "App limit reached (10) - Full edition" : `Add ${nextDescriptor.name}`}
          onClick={() => {
            if (atLimit || !activeOsTabId) return;
            addAppTab(activeOsTabId, nextDescriptor);
          }}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
            <path d="M8 3.5V12.5M3.5 8H12.5" strokeLinecap="round" />
          </svg>
        </button>

        <span className={styles.limitInline} aria-live="polite">
          {appTabs.length}/{MAX_APPS_PER_OS_TAB} apps{atLimit ? " - limit reached" : ""}
        </span>
      </div>
    </div>
  );
}
