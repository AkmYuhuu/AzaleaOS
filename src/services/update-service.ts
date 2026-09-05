import type { UpdateCheckResult, UpdateEvent, UpdateEventName, UpdateGetStateResult } from "../types/update";
import { invokeTauri } from "./tauri";

async function tryInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  try {
    const v = await invokeTauri<T>(cmd, args);
    return v;
  } catch {
    return null;
  }
}

export async function getCurrentVersion(): Promise<string> {
  const v = await tryInvoke<string>("update.get_current");
  if (v !== null && typeof v === "string" && v.length) {
    return v;
  }
  return "0.1.0";
}

export async function getUpdateState(): Promise<UpdateGetStateResult> {
  const s = await tryInvoke<UpdateGetStateResult>("update.get_state");
  if (s !== null && typeof s === "object") {
    return s;
  }
  return {
    currentVersion: "0.1.0",
    channel: "stable",
    available: false,
    availableVersion: undefined,
    downloadProgress: 0,
    installing: false,
    checking: false,
    restartRequired: false,
  };
}

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error("offline");
  }
  const r = await tryInvoke<UpdateCheckResult>("update.check");
  if (r !== null && typeof r === "object") {
    return r;
  }
  return {
    available: false,
    currentVersion: "0.1.0",
    availableVersion: undefined,
    channel: "stable",
  };
}

export async function downloadUpdate(): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("offline");
  await tryInvoke<void>("update.download");
}

export async function installUpdate(): Promise<void> {
  await tryInvoke<void>("update.install");
}

export async function cancelUpdate(): Promise<void> {
  await tryInvoke<void>("update.cancel");
}

export async function setChannel(channel: "stable" | "beta"): Promise<void> {
  await tryInvoke<void>("update.set_channel", { channel } as Record<string, unknown>);
}

export function subscribeUpdateEvents(handler: (ev: UpdateEvent) => void): () => void {
  let unlistenFns: Array<() => void> = [];
  let cancelled = false;

  (async () => {
    try {
      const mod = await import("@tauri-apps/api/event");
      const listen = (mod as unknown as { listen: (ev: string, cb: (payload: { payload: unknown }) => void) => Promise<() => void> }).listen;
      if (!listen) return;
      const events: UpdateEventName[] = [
        "update.check_started",
        "update.check_completed",
        "update.available",
        "update.download_started",
        "update.download_progress",
        "update.download_completed",
        "update.verification_failed",
        "update.install_started",
        "update.install_completed",
        "update.failed",
      ];
      for (const name of events) {
        if (cancelled) break;
        try {
          const un = await listen(name, (e) => {
            const payload = (e as { payload?: unknown }).payload;
            switch (name) {
              case "update.check_started": handler({ type: name }); break;
              case "update.check_completed": handler({ type: name, payload: payload as never }); break;
              case "update.available": handler({ type: name, payload: payload as never }); break;
              case "update.download_started": handler({ type: name }); break;
              case "update.download_progress": handler({ type: name, payload: payload as never }); break;
              case "update.download_completed": handler({ type: name }); break;
              case "update.verification_failed": handler({ type: name, payload: payload as never }); break;
              case "update.install_started": handler({ type: name }); break;
              case "update.install_completed": handler({ type: name }); break;
              case "update.failed": handler({ type: name, payload: payload as never }); break;
              default: break;
            }
          });
          unlistenFns.push(un);
        } catch {
          // ignore single event failure
        }
      }
    } catch {
      // Tauri not available
    }
  })();

  return () => {
    cancelled = true;
    unlistenFns.forEach((fn) => { try { fn(); } catch { /* ignore */ } });
  };
}
