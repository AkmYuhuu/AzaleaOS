// Backend is authority for real PID/window handle. Frontend only mirrors AppDescriptor/AppTab for UX.
export type AppCategory = "browser" | "developer" | "productivity" | "utility" | "game" | "system" | "unknown";

export interface AppDescriptor {
  id: string;
  name: string;
  icon?: string;
  category: AppCategory;
  supported: boolean;
  source?: "windows" | "azalea";
  executablePath?: string;
  reason?: string;
}

export type AppTabState = "active" | "background" | "optimizing" | "protected" | "game" | "unavailable" | "error";

export interface AppTab {
  id: string;
  appId: string;
  osTabId: string;
  label: string;
  icon?: string;
  state: AppTabState;
  lastFocusedAt: number;
  // Backend provides real windowId/processId
  windowId?: string;
  processId?: number;
}
