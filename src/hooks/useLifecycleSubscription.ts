import { useEffect, useRef } from "react";
import { listenTauriLifecycleEvents } from "../services/lifecycle-service";
import { useAppTabStore } from "../stores/appTabStore";
import type { LifecycleEvent } from "../types/lifecycle";

export function useLifecycleSubscription(enabled = true): void {
  const subscribedRef = useRef(false);

  useEffect(() => {
    if (!enabled || subscribedRef.current) return;
    subscribedRef.current = true;

    let unsub: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      try {
        unsub = await listenTauriLifecycleEvents((e: LifecycleEvent) => {
          useAppTabStore.getState().applyLifecycleEvent(e);
        });
      } catch {
        // Backend not available
      }
    })();

    return () => {
      cancelled = true;
      subscribedRef.current = false;
      if (unsub) unsub();
    };
  }, [enabled]);
}
