import { create } from "zustand";
import { MAX_OS_TABS } from "../types/workspace";
import type { OsTab } from "../types/workspace";

function uid(): string {
  // crypto.randomUUID is available in modern browsers / Tauri webview
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = globalThis.crypto;
    if (c?.randomUUID) return c.randomUUID() as string;
  } catch {
    // fall through
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const initialTabs: OsTab[] = [
  { id: "dev", name: "Development", createdAt: Date.now() - 3000, order: 0 },
  { id: "research", name: "Research", createdAt: Date.now() - 2000, order: 1 },
  { id: "design", name: "Design", createdAt: Date.now() - 1000, order: 2 },
];

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
  osTabs: initialTabs,
  activeOsTabId: initialTabs[0]?.id ?? null,

  createOsTab: (name) => {
    const { osTabs } = get();
    if (osTabs.length >= MAX_OS_TABS) return null;
    const base = name?.trim() ? name.trim() : "New Workspace";
    const finalName = nextName(osTabs, base);
    const tab: OsTab = {
      id: uid(),
      name: finalName,
      createdAt: Date.now(),
      order: osTabs.length,
    };
    // honey: instant switch - no async delay
    set({ osTabs: [...osTabs, tab], activeOsTabId: tab.id });
    return tab;
  },

  renameOsTab: (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    set((s) => ({
      osTabs: s.osTabs.map((t) => (t.id === id ? { ...t, name: trimmed } : t)),
    }));
  },

  switchOsTab: (id) => {
    const exists = get().osTabs.some((t) => t.id === id);
    if (!exists) return;
    set({ activeOsTabId: id });
  },

  closeOsTab: (id) => {
    const { osTabs, activeOsTabId } = get();
    const idx = osTabs.findIndex((t) => t.id === id);
    if (idx === -1) return;
    const remaining = osTabs.filter((t) => t.id !== id);
    if (remaining.length === 0) {
      const fallback: OsTab = { id: uid(), name: "New Workspace", createdAt: Date.now(), order: 0 };
      set({ osTabs: [fallback], activeOsTabId: fallback.id });
      return;
    }
    let nextActive = activeOsTabId;
    if (activeOsTabId === id) {
      // nearest: previous if exists else next (which is now at same index)
      const nextIdx = idx < remaining.length ? idx : remaining.length - 1;
      const prevIdx = idx - 1;
      const chosen = prevIdx >= 0 ? remaining[prevIdx]! : remaining[nextIdx]!;
      nextActive = chosen.id;
    }
    // reassign order for display consistency
    const reordered = remaining.map((t, i) => ({ ...t, order: i }));
    set({ osTabs: reordered, activeOsTabId: nextActive });
  },

  nextTab: () => {
    const { osTabs, activeOsTabId } = get();
    if (osTabs.length <= 1) return;
    const idx = osTabs.findIndex((t) => t.id === activeOsTabId);
    const next = osTabs[(idx + 1) % osTabs.length]!;
    set({ activeOsTabId: next.id });
  },

  prevTab: () => {
    const { osTabs, activeOsTabId } = get();
    if (osTabs.length <= 1) return;
    const idx = osTabs.findIndex((t) => t.id === activeOsTabId);
    const prev = osTabs[(idx - 1 + osTabs.length) % osTabs.length]!;
    set({ activeOsTabId: prev.id });
  },
}));

// honey: deprecated full-subscription helper - prefer scoped selectors in components (§28)
// Kept for compatibility but now uses scoped reads internally.
export function useActiveOsTab(): OsTab | null {
  const osTabs = useWorkspaceStore((s) => s.osTabs);
  const activeOsTabId = useWorkspaceStore((s) => s.activeOsTabId);
  return osTabs.find((t) => t.id === activeOsTabId) ?? osTabs[0] ?? null;
}
