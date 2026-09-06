import type { AppDescriptor } from "../../types/appTab";

export type LauncherKind = "app" | "tool" | "file";

export interface LauncherItem {
  id: string;
  label: string;
  kind: LauncherKind;
  descriptor?: AppDescriptor;
  icon?: string;
  category?: AppDescriptor["category"];
}

// system tool — bukan mock, real OS actions (Resources/Settings/Files are OS-level entries, not file mocks)
const toolItems: LauncherItem[] = [
  { id: "tool-resources", label: "Resources", kind: "tool", icon: "📊", category: "system" },
  { id: "tool-settings", label: "Settings", kind: "tool", icon: "⚙", category: "system" },
  { id: "tool-files", label: "Files", kind: "tool", icon: "📁", category: "system" },
];

// file items no longer mocked — sourced from filesystemStore via Tauri (Windows user local)

// real apps via Tauri — placeholder removed. Previously hardcoded 6 (vscode/chrome/terminal/files/notion/slack) were mock catalog.
// Now appDescriptors is empty fallback; real apps injected via Tauri invoke "app_list" (see fetchRealApps / AppLauncher dynamic load).
const appDescriptors: AppDescriptor[] = [];

const appItems: LauncherItem[] = appDescriptors.map((d) => ({
  id: `app-${d.id}`,
  label: d.name,
  kind: "app" as const,
  descriptor: d,
  icon: d.icon,
  category: d.category,
}));

export const LAUNCHER_ITEMS: LauncherItem[] = [...appItems, ...toolItems];

// Tauri real detection — call when Tauri webview is available. Returns empty array if IPC unavailable (web dev fallback).
export async function fetchRealApps(): Promise<AppDescriptor[]> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const apps = await invoke<AppDescriptor[]>("app_list");
    if (Array.isArray(apps)) return apps;
    return [];
  } catch {
    // also try legacy invoke wrapper
    try {
      const { invokeTauri } = await import("../../services/tauri");
      const apps = await invokeTauri<AppDescriptor[]>("app_list");
      if (Array.isArray(apps)) return apps;
    } catch {
      // no Tauri — fallback empty
    }
    return [];
  }
}

export function mapAppDescriptorsToLauncherItems(descriptors: AppDescriptor[]): LauncherItem[] {
  return descriptors.map((d) => ({
    id: `app-${d.id}`,
    label: d.name,
    kind: "app" as const,
    descriptor: d,
    icon: d.icon,
    category: d.category,
  }));
}

// Helper for consumers that want merged real + tool items without extra fetch in launcherData module (kept pure, no side-effect on import)
export async function getRealLauncherItems(): Promise<LauncherItem[]> {
  const real = await fetchRealApps();
  if (real.length === 0) return LAUNCHER_ITEMS; // fallback to tool-only
  return [...mapAppDescriptorsToLauncherItems(real), ...toolItems];
}
