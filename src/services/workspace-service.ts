import { invokeTauri } from "./tauri";
import type { OsTab } from "../types/workspace";
import type { AppTab } from "../types/appTab";

type BackendWorkspace = { id: string; name: string; order: number; appTabIds: string[] };
type BackendAppTab = { id: string; workspaceId: string; appId: string; lifecycleState?: string; lastFocusTimestamp?: number };

function mapWorkspace(raw: BackendWorkspace): OsTab {
  return { id: raw.id, name: raw.name, createdAt: Date.now(), order: raw.order };
}

function mapAppTab(raw: BackendAppTab): AppTab {
  return {
    id: raw.id,
    appId: raw.appId,
    osTabId: raw.workspaceId,
    label: raw.appId,
    state: (raw.lifecycleState?.toLowerCase() as AppTab["state"]) ?? "active",
    lastFocusedAt: raw.lastFocusTimestamp ?? Date.now(),
  };
}

async function tryInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  try {
    return await invokeTauri<T>(cmd, args);
  } catch {
    return null;
  }
}

export async function workspaceList(): Promise<OsTab[]> {
  const raw = await tryInvoke<BackendWorkspace[]>("workspace_list");
  if (Array.isArray(raw)) return raw.map(mapWorkspace);
  return [];
}

export async function workspaceActiveId(): Promise<string | null> {
  const raw = await tryInvoke<string>("workspace_active");
  if (typeof raw === "string" && raw.length) return raw;
  return null;
}

export async function workspaceCreate(name: string): Promise<OsTab> {
  const raw = await invokeTauri<BackendWorkspace>("workspace_create", { name } as unknown as Record<string, unknown>);
  return mapWorkspace(raw);
}

export async function workspaceRename(id: string, name: string): Promise<OsTab> {
  const raw = await invokeTauri<BackendWorkspace>("workspace_rename", { id, name } as unknown as Record<string, unknown>);
  return mapWorkspace(raw);
}

export async function workspaceClose(id: string): Promise<void> {
  await invokeTauri<void>("workspace_close", { id } as unknown as Record<string, unknown>);
}

export async function workspaceSwitch(id: string): Promise<void> {
  await invokeTauri<void>("workspace_switch", { id } as unknown as Record<string, unknown>);
}

export async function workspaceGetApps(workspaceId: string): Promise<AppTab[]> {
  const raw = await tryInvoke<BackendAppTab[]>("workspace_get_apps", { workspaceId } as unknown as Record<string, unknown>);
  if (Array.isArray(raw)) return raw.map(mapAppTab);
  // fallback alias workspaceId snake
  const raw2 = await tryInvoke<BackendAppTab[]>("workspace_get_apps", { workspace_id: workspaceId } as unknown as Record<string, unknown>);
  if (Array.isArray(raw2)) return raw2.map(mapAppTab);
  return [];
}

export async function workspaceAddApp(workspaceId: string, appId: string): Promise<AppTab> {
  const raw = await invokeTauri<BackendAppTab>("workspace_add_app", { workspaceId, appId } as unknown as Record<string, unknown>);
  return mapAppTab(raw);
}

export async function workspaceRemoveApp(workspaceId: string, appTabId: string): Promise<void> {
  await invokeTauri<void>("workspace_remove_app", { workspaceId, appTabId } as unknown as Record<string, unknown>);
}

export async function workspaceListAllAppTabs(): Promise<AppTab[]> {
  const raw = await tryInvoke<BackendAppTab[]>("workspace_list_all_app_tabs");
  if (Array.isArray(raw)) return raw.map(mapAppTab);
  return [];
}
