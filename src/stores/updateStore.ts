import { create } from "zustand";
import type { UpdateState, UpdateEvent } from "../types/update";
import * as svc from "../services/update-service";
import { useSettingsStore } from "./settingsStore";

// honey: backend is authority, initialization lightweight once, cache result, no polling loop

type UpdateActions = {
  init: () => Promise<void>;
  checkForUpdates: () => Promise<void>;
  download: () => Promise<void>;
  install: () => Promise<void>;
  cancel: () => Promise<void>;
  setChannel: (c: UpdateState["channel"]) => Promise<void>;
  dismissAvailable: () => void;
  setOffline: (v: boolean) => void;
  _handleEvent: (ev: UpdateEvent) => void;
  _initialized: boolean;
  _unsubscribe?: () => void;
};

type UpdateStore = UpdateState & UpdateActions;

const initial: UpdateState = {
  currentVersion: "0.1.0",
  channel: "stable",
  checking: false,
  available: false,
  availableVersion: undefined,
  downloadProgress: 0,
  installing: false,
  error: undefined,
  restartRequired: false,
  lastCheckedAt: undefined,
  offline: typeof navigator !== "undefined" ? !navigator.onLine : false,
};

export const useUpdateStore = create<UpdateStore>((set, get) => ({
  ...initial,
  _initialized: false,
  _unsubscribe: undefined,

  _handleEvent: (ev: UpdateEvent) => {
    switch (ev.type) {
      case "update.check_started":
        set({ checking: true, error: undefined, offline: false });
        break;
      case "update.check_completed":
        set({
          checking: false,
          available: ev.payload.available,
          availableVersion: ev.payload.availableVersion,
          currentVersion: ev.payload.currentVersion ?? get().currentVersion,
          channel: (ev.payload.channel as UpdateState["channel"]) ?? get().channel,
          lastCheckedAt: Date.now(),
          error: undefined,
          offline: false,
        });
        break;
      case "update.available":
        set({ available: true, availableVersion: ev.payload.availableVersion, checking: false });
        break;
      case "update.download_started":
        set({ downloadProgress: 0, error: undefined });
        break;
      case "update.download_progress":
        set({ downloadProgress: ev.payload.progress });
        break;
      case "update.download_completed":
        set({ downloadProgress: 100 });
        break;
      case "update.verification_failed":
        set({ error: ev.payload.reason, downloadProgress: 0 });
        break;
      case "update.install_started":
        set({ installing: true, error: undefined });
        break;
      case "update.install_completed":
        set({ installing: false, restartRequired: true, error: undefined });
        break;
      case "update.failed":
        // offline case string is "offline" - map to offline state, not failure banner
        if (ev.payload.error === "offline" || /offline/i.test(ev.payload.error)) {
          set({ checking: false, installing: false, offline: true });
        } else if (/cancelled/i.test(ev.payload.error)) {
          set({ checking: false, installing: false, downloadProgress: 0, error: undefined });
        } else {
          set({ checking: false, installing: false, error: ev.payload.error, offline: false });
        }
        break;
      default:
        break;
    }
  },

  init: async () => {
    if (get()._initialized) return;
    set({ _initialized: true });

    // subscribe once
    const unsub = svc.subscribeUpdateEvents((ev) => get()._handleEvent(ev));
    set({ _unsubscribe: unsub });

    // lightweight startup: get_state + get_current once, cache
    try {
      const state = await svc.getUpdateState();
      set({
        currentVersion: state.currentVersion ?? get().currentVersion,
        channel: (state.channel as UpdateState["channel"]) ?? get().channel,
        available: state.available ?? false,
        availableVersion: state.availableVersion,
        downloadProgress: state.downloadProgress ?? 0,
        installing: state.installing ?? false,
        checking: false,
        restartRequired: state.restartRequired ?? false,
        error: state.error,
        lastCheckedAt: Date.now(),
        offline: false,
      });
      // keep settingsStore channel in sync (reflect backend)
      try {
        const cur = useSettingsStore.getState().settings.updates.channel;
        if (cur !== state.channel) {
          useSettingsStore.getState().updateSection("updates", { channel: state.channel as never, currentVersion: state.currentVersion });
        } else if (state.currentVersion) {
          useSettingsStore.getState().updateSection("updates", { currentVersion: state.currentVersion });
        }
      } catch { /* ignore */ }
    } catch {
      // fallback to getCurrent alone
      try {
        const v = await svc.getCurrentVersion();
        if (v) {
          set({ currentVersion: v });
          try { useSettingsStore.getState().updateSection("updates", { currentVersion: v }); } catch { /* */ }
        }
      } catch { /* offline etc ignore */ }
    }

    // track online/offline without polling - event listeners
    if (typeof window !== "undefined") {
      const onOffline = () => set({ offline: true });
      const onOnline = () => set({ offline: false });
      window.addEventListener("offline", onOffline);
      window.addEventListener("online", onOnline);
      // store cleanup not needed - app lifetime
    }

    // autoCheck? Do NOT repeatedly check server while open (§F). So no interval here.
  },

  checkForUpdates: async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      set({ offline: true, checking: false });
      return;
    }
    set({ checking: true, error: undefined, offline: false });
    try {
      await svc.checkForUpdate();
      // result handled via events; but fallback if events missed:
      // svc already emitted, but we also could sync lastChecked
      set({ lastCheckedAt: Date.now() });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "offline" || /offline/i.test(msg)) set({ checking: false, offline: true });
      else set({ checking: false, error: msg });
    }
  },

  download: async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      set({ offline: true });
      return;
    }
    set({ error: undefined, offline: false, downloadProgress: 0 });
    try {
      await svc.downloadUpdate();
      // after download, download_progress events already set via subscription
      // Spec sequence: download → install. Trigger install automatically after download completed if not verification_failed.
      // Let UI drive install explicitly, but chain if restart not required yet:
      // We'll not auto-install here; SettingsPanel Update Now will chain. Keep separate for §B correctness.
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "offline" || /offline/i.test(msg)) set({ offline: true });
      else set({ error: msg });
    }
  },

  install: async () => {
    set({ installing: true, error: undefined });
    try {
      await svc.installUpdate();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ installing: false, error: msg });
    }
  },

  cancel: async () => {
    try { await svc.cancelUpdate(); } catch { /* ignore */ }
    set({ checking: false, installing: false, downloadProgress: 0 });
  },

  setChannel: async (c) => {
    set({ channel: c });
    try { await svc.setChannel(c); } catch { /* ignore */ }
    try { useSettingsStore.getState().updateSection("updates", { channel: c as never }); } catch { /* */ }
  },

  dismissAvailable: () => set({ available: false, availableVersion: undefined, downloadProgress: 0, error: undefined }),

  setOffline: (v) => set({ offline: v }),
}));
