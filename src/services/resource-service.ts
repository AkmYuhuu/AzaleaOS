import { invokeTauri } from "./tauri";
import type { AdaptiveSnapshot, AppResource, ProtectedTask, ResourceHistoryPoint, ResourceStreamPayload, SystemSnapshot } from "../types/resources";

type BackendSnapshot = {
  cpuPercent: number;
  ramTotal: number;
  ramUsed: number;
  ramAvailable: number;
  gpuPercent?: number | null;
  diskActivity: number;
  networkRx?: number;
  networkTx?: number;
  timestamp?: number;
};

function bytesToGb(b: number): number { return b / (1024 * 1024 * 1024); }

function mapSnapshot(raw: BackendSnapshot): SystemSnapshot {
  return {
    cpu: Math.round(raw.cpuPercent ?? 0),
    ram: {
      used: Math.round(bytesToGb(raw.ramUsed ?? 0) * 10) / 10,
      total: Math.round(bytesToGb(raw.ramTotal ?? 0) * 10) / 10 || 16,
      available: Math.round(bytesToGb(raw.ramAvailable ?? 0) * 10) / 10,
    },
    gpu: raw.gpuPercent != null && Number.isFinite(raw.gpuPercent) ? Math.round(raw.gpuPercent) : undefined,
    disk: Math.round(raw.diskActivity ?? 0),
    networkUp: raw.networkTx != null ? Math.round((raw.networkTx / (1024 * 1024)) * 10) / 10 : 0,
    networkDown: raw.networkRx != null ? Math.round((raw.networkRx / (1024 * 1024)) * 10) / 10 : 0,
    uptimeSec: raw.timestamp ? Math.floor(Date.now() / 1000) - Math.floor(raw.timestamp / 1000) : 0,
  };
}

export async function fetchSnapshot(): Promise<SystemSnapshot | null> {
  try {
    const raw = await invokeTauri<BackendSnapshot>("resource_snapshot");
    if (raw) return mapSnapshot(raw);
  } catch { /* tauri unavailable -> null */ }
  return null;
}

export async function fetchPressure(): Promise<AdaptiveSnapshot["pressure"] | null> {
  try {
    const raw = await invokeTauri<string>("resource_pressure");
    if (typeof raw === "string") {
      const lower = raw.toLowerCase();
      if (lower === "critical" || lower === "high") return "High";
      if (lower === "moderate" || lower === "elevated") return "Elevated";
      return "Normal";
    }
  } catch { /* ignore */ }
  return null;
}

export async function fetchResourcePayload(existingHistory: ResourceHistoryPoint[] = []): Promise<ResourceStreamPayload | null> {
  const snap = await fetchSnapshot();
  if (!snap) return null;
  const pressure = await fetchPressure();
  const now = Date.now();
  const history: ResourceHistoryPoint[] = [...existingHistory, { t: now, cpu: snap.cpu, ramUsed: snap.ram.used }].slice(-60);
  const adaptive: AdaptiveSnapshot = {
    mode: "Smart",
    pressure: pressure ?? "Normal",
    backgroundApps: 0,
    optimizing: 0,
    protectedTasks: 0,
  };
  const apps: AppResource[] = [];
  const protectedTasks: ProtectedTask[] = [];
  return { snapshot: snap, apps, adaptive, protectedTasks, history };
}

export function startResourcePolling(onPayload: (p: ResourceStreamPayload) => void, intervalMs = 800): () => void {
  let stopped = false;
  let timer: number | null = null;
  let history: ResourceHistoryPoint[] = [];
  async function tick() {
    if (stopped) return;
    const payload = await fetchResourcePayload(history);
    if (payload) {
      history = payload.history;
      onPayload(payload);
    }
    if (!stopped) timer = window.setTimeout(tick, intervalMs) as unknown as number;
  }
  // initial tick
  void tick();
  return () => {
    stopped = true;
    if (timer !== null) window.clearTimeout(timer);
  };
}
