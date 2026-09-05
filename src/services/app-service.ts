import type { AppDescriptor, AppTab } from "../types/appTab";
import type { AppIntegrationState, AppRuntime } from "../types/appIntegration";
import { invokeTauri } from "./tauri";

let descriptorCache: Map<string, AppDescriptor> | null = null;

export function deriveIntegration(descriptor?: AppDescriptor): AppIntegrationState {
  if (!descriptor) return { kind: "external", canEmbed: false };
  if (descriptor.supported === false) return { kind: "unsupported", canEmbed: false, reason: descriptor.reason ?? "game" };
  if (descriptor.id === "pdf") return { kind: "embedded", canEmbed: true };
  return { kind: "managed", canEmbed: false };
}

export function checkIntegration(appTab: AppTab, descriptor?: AppDescriptor): AppIntegrationState {
  return deriveIntegration(descriptor);
}

export function checkIntegrationByDescriptor(descriptor?: AppDescriptor): AppIntegrationState {
  return deriveIntegration(descriptor);
}

function normalizeDescriptor(raw: unknown): AppDescriptor | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r["id"] !== "string" || typeof r["name"] !== "string") return null;
  return {
    id: r["id"] as string,
    name: r["name"] as string,
    executablePath: (r["executablePath"] ?? r["executable_path"]) as string | undefined,
    icon: (r["icon"] ?? r["iconRef"] ?? r["icon_ref"]) as string | undefined,
    category: (r["category"] as AppDescriptor["category"]) ?? "unknown",
    supported: typeof r["supported"] === "boolean" ? (r["supported"] as boolean) : true,
    source: (r["source"] as AppDescriptor["source"]) ?? "windows",
    reason: (r["reason"] ?? r["unsupportedReason"] ?? r["unsupported_reason"]) as string | undefined,
  };
}

async function invokeWithFallback<T>(commands: string[], args?: Record<string, unknown>): Promise<T | null> {
  for (const cmd of commands) {
    try {
      const res = await invokeTauri<T>(cmd, args);
      if (res !== null && res !== undefined) return res;
    } catch {
      // try next alias
    }
  }
  return null;
}

export async function fetchAppDescriptor(appId: string): Promise<AppDescriptor> {
  const raw = await invokeWithFallback<unknown>(["app_get_state", "app.get_state"], { appId, app_id: appId } as unknown as Record<string, unknown>);
  if (raw && typeof raw === "object") {
    const norm = normalizeDescriptor(raw);
    if (norm) {
      if (!descriptorCache) descriptorCache = new Map();
      descriptorCache.set(norm.id, norm);
      return norm;
    }
    const asDesc = raw as AppDescriptor;
    if (typeof asDesc.id === "string") {
      if (!descriptorCache) descriptorCache = new Map();
      descriptorCache.set(asDesc.id, asDesc);
      return asDesc;
    }
  }
  if (descriptorCache?.has(appId)) return descriptorCache.get(appId)!;
  throw new Error(`Descriptor not found: ${appId}`);
}

export async function getAppRuntime(appId: string, _osTabId: string): Promise<AppRuntime> {
  try {
    const r = await invokeTauri<AppRuntime>("app.get_state", { appId, osTabId: _osTabId } as unknown as Record<string, unknown>);
    if (r && (r as unknown as Record<string, unknown>)["windowId"]) return r;
  } catch {
    // fallback handled below
  }
  throw new Error(`Runtime not available for ${appId} (requires Tauri backend)`);
}

export async function listAppDescriptors(): Promise<AppDescriptor[]> {
  const r = await invokeWithFallback<unknown[]>(["app_list", "app.list"]);
  if (Array.isArray(r) && r.length) {
    const normalized = r.map(normalizeDescriptor).filter((x): x is AppDescriptor => x !== null);
    const result = normalized.length ? normalized : (r as AppDescriptor[]);
    descriptorCache = new Map(result.map((d) => [d.id, d]));
    return result;
  }
  if (Array.isArray(r)) {
    const normalized = r.map(normalizeDescriptor).filter((x): x is AppDescriptor => x !== null);
    if (normalized.length) {
      descriptorCache = new Map(normalized.map((d) => [d.id, d]));
      return normalized;
    }
    return [];
  }
  return [];
}

export function getCachedDescriptors(): AppDescriptor[] {
  if (!descriptorCache) return [];
  return Array.from(descriptorCache.values());
}

export function getCachedDescriptor(appId: string): AppDescriptor | undefined {
  return descriptorCache?.get(appId);
}
