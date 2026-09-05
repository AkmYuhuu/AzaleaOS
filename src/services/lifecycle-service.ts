import type { LifecycleEvent } from "../types/lifecycle";

type Subscriber = (e: LifecycleEvent) => void;

export async function listenTauriLifecycleEvents(cb: Subscriber): Promise<() => void> {
  try {
    const { listen } = await import("@tauri-apps/api/event");
    const unlisten = await listen<LifecycleEvent>("azalea://lifecycle", (evt) => {
      const payload = evt.payload as LifecycleEvent;
      if (payload && payload.appTabId && payload.state) cb(payload);
    });
    return unlisten;
  } catch {
    return () => {};
  }
}
