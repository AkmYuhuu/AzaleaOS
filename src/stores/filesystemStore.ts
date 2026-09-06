import { create } from "zustand";
import type { FsEntry, FsLocationId } from "../types/filesystem";
import * as svc from "../services/filesystem-service";

interface Location {
  id: FsLocationId;
  label: string;
  path: string;
  icon: "home" | "desktop" | "documents" | "downloads" | "pictures" | "videos" | "drive" | "recent";
}

// fallback — overridden at init via Tauri homeDir() (real OS home, not mock). Keeps web-dev fallback for `vite dev` without Tauri.
let LOCATIONS: Location[] = [
  { id: "home", label: "Home", path: "C:\\Users\\User", icon: "home" },
  { id: "desktop", label: "Desktop", path: "C:\\Users\\User\\Desktop", icon: "desktop" },
  { id: "documents", label: "Documents", path: "C:\\Users\\User\\Documents", icon: "documents" },
  { id: "downloads", label: "Downloads", path: "C:\\Users\\User\\Downloads", icon: "downloads" },
  { id: "pictures", label: "Pictures", path: "C:\\Users\\User\\Pictures", icon: "pictures" },
  { id: "videos", label: "Videos", path: "C:\\Users\\User\\Videos", icon: "videos" },
  { id: "drives", label: "Drives", path: "drives:", icon: "drive" },
  { id: "recent", label: "Recent", path: "recent:", icon: "recent" },
];

function getHomePath(): string {
  return LOCATIONS.find((l) => l.id === "home")!.path;
}

function applyHomeDir(home: string): void {
  // normalize: trim trailing slash, ensure Windows backslash style
  let h = home.replace(/\//g, "\\").replace(/\\+$/, "");
  if (!h) return;
  // update LOCATIONS in place for resolveLocationId / parentPath consumers
  LOCATIONS = LOCATIONS.map((loc) => {
    if (loc.id === "home") return { ...loc, path: h };
    if (loc.id === "desktop") return { ...loc, path: `${h}\\Desktop` };
    if (loc.id === "documents") return { ...loc, path: `${h}\\Documents` };
    if (loc.id === "downloads") return { ...loc, path: `${h}\\Downloads` };
    if (loc.id === "pictures") return { ...loc, path: `${h}\\Pictures` };
    if (loc.id === "videos") return { ...loc, path: `${h}\\Videos` };
    return loc;
  });
}

type FilesystemStore = {
  isOpen: boolean;
  locationId: FsLocationId;
  currentPath: string;
  entries: FsEntry[];
  selectedPaths: string[];
  pathHistory: string[];
  historyIndex: number;
  recent: FsEntry[];
  isLoading: boolean;
  error: string | null;
  // actions
  open: () => void;
  close: () => void;
  navigateTo: (locationId: FsLocationId) => Promise<void>;
  navigateToPath: (path: string) => Promise<void>;
  goBack: () => Promise<void>;
  goForward: () => Promise<void>;
  goUp: () => Promise<void>;
  refresh: () => Promise<void>;
  select: (path: string, multi?: boolean) => void;
  clearSelection: () => void;
  selectAll: () => void;
  createFolder: (name: string) => Promise<void>;
  rename: (path: string, newName: string) => Promise<void>;
  deletePaths: (paths: string[]) => Promise<void>;
  openEntry: (entry: FsEntry) => Promise<string | null>;
  _load: (path: string, pushHistory?: boolean) => Promise<void>;
};

function parentPath(p: string): string | null {
  if (p === "drives:" || p === "recent:" || p === "C:\\" || p === "D:\\") return null;
  const n = p.replace(/\\+$/, "");
  const idx = n.lastIndexOf("\\");
  if (idx <= 1) {
    const home = getHomePath();
    if (n.toLowerCase().startsWith("c:\\users")) {
      if (n.toLowerCase() === home.toLowerCase()) return "drives:";
    }
    if (idx === 2 && n[1] === ":") return "drives:";
    return idx === -1 ? null : n.slice(0, idx) || null;
  }
  return n.slice(0, idx);
}

function resolveLocationId(path: string): FsLocationId {
  const normalized = path.toLowerCase();
  if (normalized === "recent:" || normalized === "recent") return "recent";
  if (normalized === "drives:" || normalized === "drives" || normalized === "c:\\" || normalized === "d:\\") return "drives";
  for (const loc of LOCATIONS) {
    if (loc.id === "drives" || loc.id === "recent") continue;
    const lp = loc.path.toLowerCase();
    if (normalized === lp) return loc.id;
    if (normalized.startsWith(lp + "\\")) return loc.id;
  }
  return "home";
}

export const useFilesystemStore = create<FilesystemStore>((set, get) => ({
  isOpen: false,
  locationId: "home",
  currentPath: getHomePath(),
  entries: [],
  selectedPaths: [],
  pathHistory: [getHomePath()],
  historyIndex: 0,
  recent: [],
  isLoading: false,
  error: null,

  open: () => {
    set({ isOpen: true });
    const s = get();
    if (s.entries.length === 0 && !s.isLoading) void get()._load(s.currentPath, false);
  },
  close: () => set({ isOpen: false, error: null, selectedPaths: [] }),

  _load: async (path, pushHistory = true) => {
    set({ isLoading: true, error: null });
    try {
      const entries = await svc.filesystemList(path);
      const loc = resolveLocationId(path);
      set((prev) => {
        let history = prev.pathHistory;
        let idx = prev.historyIndex;
        if (pushHistory) {
          history = history.slice(0, idx + 1);
          if (history[history.length - 1] !== path) history.push(path);
          idx = history.length - 1;
          if (history.length > 50) {
            history = history.slice(history.length - 50);
            idx = history.length - 1;
          }
        }
        return {
          entries,
          currentPath: path,
          locationId: loc,
          pathHistory: history,
          historyIndex: idx,
          isLoading: false,
          selectedPaths: [],
          error: null,
        };
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : `Unable to read "${path}".`;
      set({ isLoading: false, error: msg });
    }
  },

  navigateTo: async (locationId) => {
    const loc = LOCATIONS.find((l) => l.id === locationId);
    if (!loc) return;
    await get()._load(loc.path, true);
  },

  navigateToPath: async (path) => {
    await get()._load(path, true);
  },

  goBack: async () => {
    const { pathHistory, historyIndex } = get();
    if (historyIndex <= 0) return;
    const nextIdx = historyIndex - 1;
    const path = pathHistory[nextIdx]!;
    set({ historyIndex: nextIdx, isLoading: true, error: null });
    try {
      const entries = await svc.filesystemList(path);
      set({ entries, currentPath: path, locationId: resolveLocationId(path), historyIndex: nextIdx, isLoading: false, selectedPaths: [] });
    } catch (e) {
      set({ isLoading: false, error: e instanceof Error ? e.message : "Unable to read path." });
    }
  },

  goForward: async () => {
    const { pathHistory, historyIndex } = get();
    if (historyIndex >= pathHistory.length - 1) return;
    const nextIdx = historyIndex + 1;
    const path = pathHistory[nextIdx]!;
    set({ historyIndex: nextIdx, isLoading: true, error: null });
    try {
      const entries = await svc.filesystemList(path);
      set({ entries, currentPath: path, locationId: resolveLocationId(path), historyIndex: nextIdx, isLoading: false, selectedPaths: [] });
    } catch (e) {
      set({ isLoading: false, error: e instanceof Error ? e.message : "Unable to read path." });
    }
  },

  goUp: async () => {
    const { currentPath } = get();
    const p = parentPath(currentPath);
    if (!p) return;
    await get()._load(p, true);
  },

  refresh: async () => {
    const { currentPath } = get();
    set({ isLoading: true, error: null });
    try {
      const entries = await svc.filesystemList(currentPath);
      set({ entries, isLoading: false, selectedPaths: [] });
    } catch (e) {
      set({ isLoading: false, error: e instanceof Error ? e.message : "Unable to read folder." });
    }
  },

  select: (path, multi) => {
    set((s) => {
      if (multi) {
        const exists = s.selectedPaths.includes(path);
        return { selectedPaths: exists ? s.selectedPaths.filter((p) => p !== path) : [...s.selectedPaths, path] };
      }
      return { selectedPaths: [path] };
    });
  },
  clearSelection: () => set({ selectedPaths: [] }),
  selectAll: () => set((s) => ({ selectedPaths: s.entries.map((e) => e.path) })),

  createFolder: async (name) => {
    const { currentPath } = get();
    if (currentPath === "drives:" || currentPath === "recent:") {
      throw new Error("Cannot create folder here.");
    }
    set({ isLoading: true, error: null });
    try {
      await svc.filesystemCreateFolder(currentPath, name);
      const entries = await svc.filesystemList(currentPath);
      set({ entries, isLoading: false });
    } catch (e) {
      set({ isLoading: false, error: e instanceof Error ? e.message : "Unable to create folder." });
      throw e;
    }
  },

  rename: async (path, newName) => {
    set({ isLoading: true, error: null });
    try {
      await svc.filesystemRename(path, newName);
      const entries = await svc.filesystemList(get().currentPath);
      set({ entries, isLoading: false, selectedPaths: [] });
    } catch (e) {
      set({ isLoading: false, error: e instanceof Error ? e.message : "Unable to rename." });
      throw e;
    }
  },

  deletePaths: async (paths) => {
    set({ isLoading: true, error: null });
    try {
      for (const p of paths) await svc.filesystemDelete(p);
      const entries = await svc.filesystemList(get().currentPath);
      set({ entries, isLoading: false, selectedPaths: [] });
    } catch (e) {
      set({ isLoading: false, error: e instanceof Error ? e.message : "Unable to delete." });
      throw e;
    }
  },

  openEntry: async (entry) => {
    if (entry.kind === "folder" || entry.kind === "drive") {
      await get()._load(entry.path, true);
      return null;
    }
    await svc.filesystemOpen(entry.path);
    return entry.path;
  },
}));

// initial load side-effect helper for AppShell — resolves real OS home via Tauri path.homeDir()
export async function initFilesystemStore(): Promise<void> {
  // try real home via Tauri API (works inside Tauri webview; no-op in pure web dev)
  try {
    const mod = await import("@tauri-apps/api/path");
    if (typeof mod.homeDir === "function") {
      const home = await mod.homeDir();
      if (home && typeof home === "string" && home.trim().length > 0) {
        applyHomeDir(home);
        const s = useFilesystemStore.getState();
        // sync store currentPath/history to real home if still on fallback
        if (s.currentPath.toLowerCase() === "c:\\users\\user" || s.currentPath === "C:\\Users\\User") {
          useFilesystemStore.setState({
            currentPath: getHomePath(),
            locationId: resolveLocationId(getHomePath()),
            pathHistory: [getHomePath()],
            historyIndex: 0,
          });
        }
        console.info("[filesystem] home resolved via Tauri homeDir():", getHomePath());
      }
    }
  } catch (e) {
    // Tauri not available (vite dev) — keep fallback C:\Users\User and log once
    console.info("[filesystem] Tauri homeDir unavailable, using fallback:", getHomePath(), e instanceof Error ? e.message : String(e ?? ""));
  }

  const s = useFilesystemStore.getState();
  void s._load(s.currentPath, false);
}

// allow tests/consumers to read resolved locations (not part of store state)
export function getFilesystemLocations() {
  return [...LOCATIONS];
}
