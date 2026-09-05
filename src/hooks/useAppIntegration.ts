import { useMemo } from "react";
import type { AppTab, AppDescriptor } from "../types/appTab";
import type { AppIntegrationState, AppRuntimeStub } from "../types/appIntegration";
import { deriveIntegration } from "../services/app-service";

function hashId(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function useAppIntegration(activeAppTab: AppTab | null | undefined): {
  integration: AppIntegrationState | null;
  descriptor: AppDescriptor | undefined;
  runtime: AppRuntimeStub | null;
} {
  return useMemo(() => {
    if (!activeAppTab) return { integration: null, descriptor: undefined, runtime: null };
    const descriptor: AppDescriptor | undefined = undefined;
    const integration = deriveIntegration(descriptor);
    const h = hashId(`${activeAppTab.osTabId}:${activeAppTab.appId}:${activeAppTab.id}`);
    const windowId = `0x${(h % 0xffffff).toString(16).padStart(6, "0")}`;
    const processId = 4000 + (h % 5000);
    const runtime: AppRuntimeStub = {
      windowId,
      wid: windowId,
      processId,
      pid: processId,
      executablePath: activeAppTab.windowId ?? undefined,
    };
    if (activeAppTab.windowId) {
      runtime.windowId = activeAppTab.windowId;
      runtime.wid = activeAppTab.windowId;
    }
    if (activeAppTab.processId) {
      runtime.processId = activeAppTab.processId;
      runtime.pid = activeAppTab.processId;
    }
    return { integration, descriptor, runtime };
  }, [activeAppTab]);
}
