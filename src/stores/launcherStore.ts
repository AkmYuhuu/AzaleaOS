import { create } from "zustand";

type LauncherState = {
  open: boolean;
  query: string;
  selectedIndex: number;
  openLauncher: () => void;
  closeLauncher: () => void;
  setQuery: (q: string) => void;
  moveSelection: (delta: number) => void;
  resetSelection: () => void;
  setSelectedIndex: (i: number) => void;
};

export const useLauncherStore = create<LauncherState>((set) => ({
  open: false,
  query: "",
  selectedIndex: 0,
  openLauncher: () => set({ open: true, query: "", selectedIndex: 0 }),
  closeLauncher: () => set({ open: false, query: "", selectedIndex: 0 }),
  setQuery: (q) => set({ query: q, selectedIndex: 0 }),
  moveSelection: (delta) =>
    set((s) => {
      const next = s.selectedIndex + delta;
      return { selectedIndex: Math.max(0, next) };
    }),
  resetSelection: () => set({ selectedIndex: 0 }),
  setSelectedIndex: (i) => set({ selectedIndex: Math.max(0, i) }),
}));
