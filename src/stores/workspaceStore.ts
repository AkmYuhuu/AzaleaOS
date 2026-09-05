import { create } from "zustand";
import { MAX_OS_TABS } from "../types/workspace";
import type { OsTab } from "../types/workspace";

function uid(): string {
  try {
    const c = globalThis.crypto as unknown as { randomUUID?: () => string };
    if (c?.randomUUID) return c.randomUUID();
  } catch {
    // fallback
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

type WorkspaceState = {
  osTabs: OsTab[];
  activeOsTabId: string | null;
  createOsTab: (name?: string) => OsTab | null;
  renameOsTab: (id: string, name: string) => void;
  switchOsTab: (id: string) => void;
  closeOsTab: (id: string) => void;
  nextTab: () => void;
  prevTab: () => void;
};

function nextName(tabs: OsTab[], base = "New Workspace"): string {
  const names = new Set(tabs.map((t) => t.name));
  if (!names.has(base)) return base;
  let n = 2;
  while (names.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  // Production starts clean. Workspaces are created by the user or restored by the native backend.
  osTabs: [],
  activeOsTabId: null,

  createOsTab: (name) => {
    const { osTabs } = get();
    if (osTabs.length >= MAX_OS_TABS) return null;
    const base = name?.trim() ? name.trim() : "New Workspace";
    const finalName = nextName(osTabs, base);
    const tab: OsTab = { id: uid(), name: finalName, createdAt: Date.now(), order: osTabs.length };
    set({ osTabs: [...osTabs, tab], activeOsTabId: tab.id });
    return tab;
  },

  renameOsTab: (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    set((s) => ({ osTabs: s.osTabs.map((t) => (t.id === id ? { ...t, name: trimmed } : t)) }));
  },

  switchOsTab: (id) => {
    if (get().osTabs.some((t) => t.id === id)) set({ activeOsTabId: id });
  },

  closeOsTab: (id) => {
    const { osTabs, activeOsTabId } = get();
    const idx = osTabs.findIndex((t) => t.id === id);
    if (idx === -1) return;
    const remaining = osTabs.filter((t) => t.id !== id).map((t, i) => ({ ...t, order: i }));
    if (remaining.length === 0) {
      set({ osTabs: [], activeOsTabId: null });
      return;
    }
    let nextActive = activeOsTabId;
    if (activeOsTabId === id) {
      const nextIdx = Math.min(idx, remaining.length - 1);
      nextActive = remaining[nextIdx]!.id;
    }
    set({ osTabs: remaining, activeOsTabId: nextActive });
  },

  nextTab: () => {
    const { osTabs, activeOsTabId } = get();
    if (osTabs.length <= 1) return;
    const idx = osTabs.findIndex((t) => t.id === activeOsTabId);
    set({ activeOsTabId: osTabs[(idx + 1) % osTabs.length]!.id });
  },

  prevTab: () => {
    const { osTabs, activeOsTabId } = get();
    if (osTabs.length <= 1) return;
    const idx = osTabs.findIndex((t) => t.id === activeOsTabId);
    set({ activeOsTabId: osTabs[(idx - 1 + osTabs.length) % osTabs.length]!.id });
  },
}));

export function useActiveOsTab(): OsTab | null {
  const osTabs = useWorkspaceStore((s) => s.osTabs);
  const activeOsTabId = useWorkspaceStore((s) => s.activeOsTabId);
  return osTabs.find((t) => t.id === activeOsTabId) ?? null;
}
