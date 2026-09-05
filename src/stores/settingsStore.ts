import { create } from "zustand";
import type { CategoryId, SettingsState } from "../types/settings";
import { initialSettings } from "../types/settings";

type SettingsStore = {
  settings: SettingsState;
  activeCategory: CategoryId;
  isOpen: boolean;
  toast: string | null;
  openSettings: (category?: CategoryId) => void;
  closeSettings: () => void;
  setCategory: (id: CategoryId) => void;
  updateSection: <K extends keyof SettingsState>(section: K, patch: Partial<SettingsState[K]>) => void;
  resetSection: (section: keyof SettingsState) => void;
  resetAll: () => void;
  clearCache: () => void;
  exportDiagnostics: () => void;
  openDataFolder: () => void;
  setToast: (msg: string | null) => void;
};

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: structuredClone(initialSettings) as SettingsState,
  activeCategory: "general" as CategoryId,
  isOpen: false,
  toast: null,

  openSettings: (category) =>
    set({ isOpen: true, activeCategory: category ?? get().activeCategory, toast: null }),
  closeSettings: () => set({ isOpen: false, toast: null }),
  setCategory: (id) => set({ activeCategory: id }),

  updateSection: (section, patch) =>
    set((s) => ({
      settings: { ...s.settings, [section]: { ...(s.settings[section] as object), ...(patch as object) } } as SettingsState,
    })),

  resetSection: (section) =>
    set((s) => ({
      settings: { ...s.settings, [section]: structuredClone(initialSettings[section] as object) as never } as SettingsState,
      toast: `${String(section)} reset to defaults`,
    })),

  resetAll: () => set({ settings: structuredClone(initialSettings) as SettingsState, toast: "All settings reset to defaults" }),

  clearCache: () =>
    set((s) => ({
      settings: { ...s.settings, dataStorage: { ...s.settings.dataStorage, cacheKb: 0 } },
      toast: "Cache cleared - 0 KB",
    })),

  exportDiagnostics: () => set({ toast: "Diagnostics exported - AzaleaDiagnostics_0.1.0.zip" }),

  openDataFolder: () => set({ toast: "Data folder: %LOCALAPPDATA%\\AzaleaOS\\Full" }),

  setToast: (msg) => set({ toast: msg }),
}));
