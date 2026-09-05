// honey: backend is authority for real resource sampling; frontend throttles visual updates ~750ms.
export interface SystemSnapshot {
  cpu: number; // 0-100
  ram: { used: number; total: number; available: number }; // GB
  gpu?: number; // 0-100, undefined when unavailable
  disk: number; // 0-100
  networkUp?: number; // Mbps
  networkDown?: number; // Mbps
  uptimeSec: number;
}

export type AppResourceStatus = "Normal" | "Protected" | "Optimizing" | "Error";
export type AppResourceState = "ACTIVE" | "BACKGROUND" | "OPTIMIZING" | "PROTECTED" | "GAME" | "UNAVAILABLE" | "ERROR";

export interface AppResource {
  appTabId: string;
  appId: string;
  label: string;
  state: AppResourceState;
  ramMB: number;
  cpuPct: number;
  status: AppResourceStatus;
}

export interface AdaptiveSnapshot {
  mode: "Smart" | "Conservative" | "Aggressive";
  pressure: "Normal" | "Elevated" | "High";
  backgroundApps: number;
  optimizing: number;
  protectedTasks: number;
}

export interface ProtectedTask {
  id: string;
  label: string;
  detail: string;
}

export interface ResourceHistoryPoint {
  t: number; // epoch ms
  cpu: number;
  ramUsed: number; // GB
}

export interface ResourceStreamPayload {
  snapshot: SystemSnapshot;
  apps: AppResource[];
  adaptive: AdaptiveSnapshot;
  protectedTasks: ProtectedTask[];
  history: ResourceHistoryPoint[];
}
