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

const toolItems: LauncherItem[] = [
  { id: "tool-resources", label: "Resources", kind: "tool", icon: "📊", category: "system" },
  { id: "tool-settings", label: "Settings", kind: "tool", icon: "⚙", category: "system" },
  { id: "tool-files", label: "Files", kind: "tool", icon: "📁", category: "system" },
];

// file items no longer mocked — sourced from filesystemStore via Tauri (Windows user local)

const appDescriptors: AppDescriptor[] = [
  { id: "vscode", name: "VS Code", category: "developer", supported: true, source: "windows" },
  { id: "chrome", name: "Chrome", category: "browser", supported: true, source: "windows" },
  { id: "terminal", name: "Terminal", category: "utility", supported: true, source: "windows" },
  { id: "files", name: "Files", category: "system", supported: true, source: "azalea" },
  { id: "notion", name: "Notion", category: "productivity", supported: true, source: "windows" },
  { id: "slack", name: "Slack", category: "productivity", supported: true, source: "windows" },
];

const appItems: LauncherItem[] = appDescriptors.map((d) => ({
  id: `app-${d.id}`,
  label: d.name,
  kind: "app" as const,
  descriptor: d,
  icon: d.icon,
  category: d.category,
}));

export const LAUNCHER_ITEMS: LauncherItem[] = [...appItems, ...toolItems];
