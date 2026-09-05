import { create } from "zustand";
import { MAX_APPS_PER_OS_TAB } from "../types/workspace";
import type { AppDescriptor } from "../types/appTab";
import type { AppTab, AppTabState } from "../types/appTab";
import { mapLifecycleToAppTabState } from "../types/lifecycle";

function uid(): string {
  try {
    const c = globalThis.crypto as unknown as { randomUUID?: () => string };
    if (c?.randomUUID) return c.randomUUID();
  } catch {
    // fallback
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const now = Date.now();

type AppTabStoreState = {
  appTabsByOsTab: Record<string, AppTab[]>;
  activeAppTabIdByOsTab: Record<string, string | null>;
  // honey: last backend lifecycle event per appTab for timeline viz
  lastLifecycleByAppTabId: Record<string, { state: AppTabState; at: number; reason?: string; detail?: string }>;
  addAppTab: (osTabId: string, descriptor: AppDescriptor) => AppTab | null;
  closeAppTab: (osTabId: string, appTabId: string) => void;
  switchAppTab: (osTabId: string, appTabId: string) => void;
  updateAppTabState: (osTabId: string, appTabId: string, state: AppTabState) => void;
  applyLifecycleEvent: (e: import("../types/lifecycle").LifecycleEvent) => void;
  nextAppTab: (osTabId: string) => void;
  prevAppTab: (osTabId: string) => void;
};

// honey: no seeded/mock app tabs (previously VS Code/Chrome/Terminal/PDF/Figma
// demo data). Every OS Tab starts empty; app tabs are only created for real
// via addAppTab() when the user actually launches something.
void now;

export const useAppTabStore = create<AppTabStoreState>((set, get) => ({
  appTabsByOsTab: {},
  activeAppTabIdByOsTab: {},
  lastLifecycleByAppTabId: {},

  addAppTab: (osTabId, descriptor) => {
    const tabs = get().appTabsByOsTab[osTabId] ?? [];
    if (tabs.length >= MAX_APPS_PER_OS_TAB) return null;
    const activeId = get().activeAppTabIdByOsTab[osTabId] ?? null;

    const newTab: AppTab = {
      id: uid(),
      appId: descriptor.id,
      osTabId,
      label: descriptor.name,
      icon: descriptor.icon,
      state: "active",
      lastFocusedAt: Date.now(),
    };

    // demote previous active to background if it was active
    const nextTabs = tabs.map((t) => (t.id === activeId && t.state === "active" ? { ...t, state: "background" as const } : t));
    nextTabs.push(newTab);

    set({
      appTabsByOsTab: { ...get().appTabsByOsTab, [osTabId]: nextTabs },
      activeAppTabIdByOsTab: { ...get().activeAppTabIdByOsTab, [osTabId]: newTab.id },
    });
    return newTab;
  },

  closeAppTab: (osTabId, appTabId) => {
    const tabs = get().appTabsByOsTab[osTabId] ?? [];
    const idx = tabs.findIndex((t) => t.id === appTabId);
    if (idx === -1) return;
    const remaining = tabs.filter((t) => t.id !== appTabId);
    const activeId = get().activeAppTabIdByOsTab[osTabId] ?? null;
    let nextActive: string | null = activeId;
    if (activeId === appTabId) {
      if (remaining.length === 0) {
        nextActive = null;
      } else {
        // nearest prev else next (same index after removal) else first
        const prevIdx = idx - 1;
        const nextIdx = idx < remaining.length ? idx : remaining.length - 1;
        const chosen = prevIdx >= 0 ? remaining[prevIdx]! : remaining[nextIdx]!;
        nextActive = chosen.id;
        // promote chosen to active if not already protected/error/game etc? For calm UX, set to active if it was background.
        // Keep protected/error states as-is but still make it active selection; however also update its state to active for lifecycle demo.
        // To keep per-OS separation visible, we update state to active only if it was background/unavailable.
        // Otherwise keep original state but still select it.
      }
      // If we closed active, ensure the new active's state becomes active (unless it is protected/error which we keep subtle dot).
      // Simpler: if new active's state is background/unavailable, flip to active.
      const activeTab = remaining.find((t) => t.id === nextActive);
      if (activeTab && (activeTab.state === "background" || activeTab.state === "unavailable")) {
        const updatedRemaining = remaining.map((t) => (t.id === nextActive ? { ...t, state: "active" as const, lastFocusedAt: Date.now() } : t));
        set({
          appTabsByOsTab: { ...get().appTabsByOsTab, [osTabId]: updatedRemaining },
          activeAppTabIdByOsTab: { ...get().activeAppTabIdByOsTab, [osTabId]: nextActive },
        });
        return;
      }
    }
    set({
      appTabsByOsTab: { ...get().appTabsByOsTab, [osTabId]: remaining },
      activeAppTabIdByOsTab: { ...get().activeAppTabIdByOsTab, [osTabId]: nextActive },
    });
  },

  switchAppTab: (osTabId, appTabId) => {
    const tabs = get().appTabsByOsTab[osTabId] ?? [];
    if (!tabs.some((t) => t.id === appTabId)) return;
    const activeId = get().activeAppTabIdByOsTab[osTabId] ?? null;
    if (activeId === appTabId) return;
    const nextTabs = tabs.map((t) => {
      if (t.id === activeId && t.state === "active") return { ...t, state: "background" as const };
      if (t.id === appTabId) return { ...t, state: "active" as const, lastFocusedAt: Date.now() };
      return t;
    });
    // If target was protected/error/optimizing/game, preserve its original state but still mark active selection?
    // Spec says state includes active as one value - so switching should make target active, overriding protected/error for focus.
    // However for demo we want protected/error dot visible even when selected. The AppTabBar will show active underline + state dot.
    // So if original was protected/error/optimizing, we keep that state and just update lastFocusedAt, not flip to active.
    // Detect if original target state was non-active lifecycle cue, keep it.
    const origTarget = tabs.find((t) => t.id === appTabId);
    if (origTarget && (origTarget.state === "protected" || origTarget.state === "error" || origTarget.state === "optimizing" || origTarget.state === "game")) {
      const preserved = tabs.map((t) => {
        if (t.id === activeId && t.state === "active") return { ...t, state: "background" as const };
        if (t.id === appTabId) return { ...t, lastFocusedAt: Date.now() };
        return t;
      });
      set({
        appTabsByOsTab: { ...get().appTabsByOsTab, [osTabId]: preserved },
        activeAppTabIdByOsTab: { ...get().activeAppTabIdByOsTab, [osTabId]: appTabId },
      });
      return;
    }
    set({
      appTabsByOsTab: { ...get().appTabsByOsTab, [osTabId]: nextTabs },
      activeAppTabIdByOsTab: { ...get().activeAppTabIdByOsTab, [osTabId]: appTabId },
    });
  },

  updateAppTabState: (osTabId, appTabId, state) => {
    const tabs = get().appTabsByOsTab[osTabId] ?? [];
    set({
      appTabsByOsTab: {
        ...get().appTabsByOsTab,
        [osTabId]: tabs.map((t) => (t.id === appTabId ? { ...t, state } : t)),
      },
      lastLifecycleByAppTabId: {
        ...get().lastLifecycleByAppTabId,
        [appTabId]: { state, at: Date.now() },
      },
    });
  },

  applyLifecycleEvent: (e) => {
    const tabs = get().appTabsByOsTab[e.osTabId] ?? null;
    if (!tabs || !tabs.some((t) => t.id === e.appTabId)) return;
    const nextState = mapLifecycleToAppTabState(e.state);
    const activeId = get().activeAppTabIdByOsTab[e.osTabId] ?? null;
    let updatedTabs = tabs.map((t) =>
      t.id === e.appTabId ? { ...t, state: nextState, lastFocusedAt: nextState === "active" ? e.at : t.lastFocusedAt } : t,
    );
    // If backend says ACTIVE, demote previous active to background
    if (nextState === "active" && activeId && activeId !== e.appTabId) {
      const prev = tabs.find((t) => t.id === activeId);
      if (prev && prev.state === "active") {
        updatedTabs = updatedTabs.map((t) =>
          t.id === activeId ? { ...t, state: "background" as const } : t,
        );
      }
    }
    const nextActiveMap =
      nextState === "active"
        ? { ...get().activeAppTabIdByOsTab, [e.osTabId]: e.appTabId }
        : get().activeAppTabIdByOsTab;
    set({
      appTabsByOsTab: { ...get().appTabsByOsTab, [e.osTabId]: updatedTabs },
      activeAppTabIdByOsTab: nextActiveMap,
      lastLifecycleByAppTabId: {
        ...get().lastLifecycleByAppTabId,
        [e.appTabId]: { state: nextState, at: e.at, reason: e.reason, detail: e.detail },
      },
    });
  },

  nextAppTab: (osTabId) => {
    const tabs = get().appTabsByOsTab[osTabId] ?? [];
    if (tabs.length <= 1) return;
    const activeId = get().activeAppTabIdByOsTab[osTabId] ?? tabs[0]!.id;
    const idx = tabs.findIndex((t) => t.id === activeId);
    const nextIdx = (idx + 1) % tabs.length;
    const nextId = tabs[nextIdx]!.id;
    get().switchAppTab(osTabId, nextId);
  },

  prevAppTab: (osTabId) => {
    const tabs = get().appTabsByOsTab[osTabId] ?? [];
    if (tabs.length <= 1) return;
    const activeId = get().activeAppTabIdByOsTab[osTabId] ?? tabs[0]!.id;
    const idx = tabs.findIndex((t) => t.id === activeId);
    const prevIdx = (idx - 1 + tabs.length) % tabs.length;
    const prevId = tabs[prevIdx]!.id;
    get().switchAppTab(osTabId, prevId);
  },
}));
