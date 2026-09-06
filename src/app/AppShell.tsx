import { useCallback, useEffect, useRef, useState } from "react";
import DesktopShell from "../components/desktop/DesktopShell";
import type { SidebarMode } from "../components/sidebar/Sidebar";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useAppTabStore } from "../stores/appTabStore";
import { useLauncherStore } from "../stores/launcherStore";
import { useResourceStore } from "../stores/resourceStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useFilesystemStore, initFilesystemStore } from "../stores/filesystemStore";
import { useLifecycleSubscription } from "../hooks/useLifecycleSubscription";
import { useAppliedTheme } from "../hooks/useAppliedTheme";
import { useUpdateStore } from "../stores/updateStore";
import AppLauncher from "../components/launcher/AppLauncher";
import ResourceBar from "../components/resources/ResourceBar";
import ResourceCenter from "../components/resources/ResourceCenter";
import SettingsPanel from "../components/settings/SettingsPanel";
import FilesView from "../components/files/FilesView";
import SkipLink from "../components/a11y/SkipLink";
import ErrorBoundary from "../components/a11y/ErrorBoundary";
import BootSplash from "../components/boot/BootSplash";
import "../components/a11y/SkipLink.css";

export default function AppShell(): JSX.Element {
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>("expanded");
  const prevModeRef = useRef<SidebarMode>("expanded");
  const [shutdownPhase, setShutdownPhase] = useState<null | "shutdown" | "restart">(null);

  const hideSidebar = useCallback(() => {
    setSidebarMode((curr) => {
      if (curr === "hidden") return curr;
      prevModeRef.current = curr;
      return "hidden";
    });
  }, []);

  const restoreSidebar = useCallback(() => {
    setSidebarMode(prevModeRef.current);
  }, []);

  const toggleExpandCompact = useCallback(() => {
    setSidebarMode((curr) => {
      if (curr === "hidden") return prevModeRef.current;
      const next: SidebarMode = curr === "expanded" ? "compact" : "expanded";
      prevModeRef.current = next;
      return next;
    });
  }, []);

  const handleHotkeyToggle = useCallback(() => {
    setSidebarMode((curr) => {
      if (curr === "hidden") {
        return prevModeRef.current;
      }
      prevModeRef.current = curr;
      return "hidden";
    });
  }, []);

  const triggerShutdown = useCallback((mode: "shutdown" | "restart" = "shutdown") => {
    if (shutdownPhase) return;
    setShutdownPhase(mode);
    // BootSplash will play SFX; keep overlay min 1200ms then close
    window.setTimeout(async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        if (mode === "restart") {
          // For restart mimic close then reload (Tauri doesn't have explicit restart)
          try { await win.close(); } catch { window.close(); }
          // fallback reload after short delay
          window.setTimeout(() => window.location.reload(), 300);
        } else {
          try { await win.close(); } catch { window.close(); }
        }
      } catch {
        window.close();
        // fallback: if window.close blocked, reload for restart
        if (mode === "restart") window.location.reload();
      }
    }, 1200);
  }, [shutdownPhase]);

  const handleShutdown = useCallback(() => triggerShutdown("shutdown"), [triggerShutdown]);
  const handleRestart = useCallback(() => triggerShutdown("restart"), [triggerShutdown]);

  // §Appearance - actually apply theme setting to <html data-theme>
  useAppliedTheme();

  // §18 lifecycle - single subscription backend-driven, not per tab
  useLifecycleSubscription(true);

  useEffect(() => { initFilesystemStore(); }, []);

  // §F lightweight update init - once on mount, cached, no polling (§B/E authority)
  useEffect(() => {
    useUpdateStore.getState().init();
  }, []);

  // Listen for Tauri hotkey events from backend global shortcut registration
  useEffect(() => {
    let unlisten: (() => void) | null = null;

    (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlisten = await listen<{ id: string; idStr: string; accelerator: string }>("azalea:hotkey", (event) => {
          // honey: debug trace - if this never logs in DevTools console while the
          // Rust log shows "hotkey.triggered", the running binary is a stale build
          // (rebuild with `npm run tauri build` / restart `tauri dev`).
          console.debug("[AzaleaOS] azalea:hotkey received", event.payload);
          const { id, idStr } = event.payload;
          const launcher = useLauncherStore.getState();
          const ws = useWorkspaceStore.getState();
          const keyId = idStr || id;

          switch (keyId) {
            case "shiftEsc":
            case "ShiftEsc":
              useResourceStore.getState().toggleBar();
              break;
            case "ctrlSpace":
            case "CtrlSpace":
              if (launcher.open) launcher.closeLauncher();
              else launcher.openLauncher();
              break;
            case "ctrlAltA":
            case "CtrlAltA":
              handleHotkeyToggle();
              break;
            case "ctrlAltN":
            case "CtrlAltN":
              if (!launcher.open) ws.createOsTab();
              break;
            case "ctrlAltW":
            case "CtrlAltW":
              if (!launcher.open) {
                const active = ws.activeOsTabId;
                if (active) ws.closeOsTab(active);
              }
              break;
            case "ctrlAltLeft":
            case "CtrlAltLeft":
              if (!launcher.open) ws.prevTab();
              break;
            case "ctrlAltRight":
            case "CtrlAltRight":
              if (!launcher.open) ws.nextTab();
              break;
            case "ctrlTab":
            case "CtrlTab":
              if (!launcher.open) {
                const activeOsTabId = ws.activeOsTabId;
                if (activeOsTabId) useAppTabStore.getState().nextAppTab(activeOsTabId);
              }
              break;
            case "ctrlShiftTab":
            case "CtrlShiftTab":
              if (!launcher.open) {
                const activeOsTabId = ws.activeOsTabId;
                if (activeOsTabId) useAppTabStore.getState().prevAppTab(activeOsTabId);
              }
              break;
          }
        });
      } catch (e) {
        console.warn("Tauri hotkey listener failed:", e);
      }
    })();

    return () => {
      if (unlisten) unlisten();
    };
  }, [handleHotkeyToggle]);

  // Expose shutdown via window event for Taskbar header X etc.
  useEffect(() => {
    const onShutdownEvent = (ev: Event) => {
      const detail = (ev as CustomEvent)?.detail;
      if (detail === "restart" || (detail && detail.type === "restart")) triggerShutdown("restart");
      else triggerShutdown("shutdown");
    };
    window.addEventListener("azalea:shutdown" as string, onShutdownEvent as EventListener);
    window.addEventListener("azalea:restart" as string, () => triggerShutdown("restart"));
    return () => {
      window.removeEventListener("azalea:shutdown" as string, onShutdownEvent as EventListener);
      window.removeEventListener("azalea:restart" as string, () => triggerShutdown("restart"));
    };
  }, [triggerShutdown]);

  useEffect(() => {
    const isTypingTarget = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return true;
      if (el.isContentEditable) return true;
      return false;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // F11 fullscreen toggle - must work even when typing, not blocked by isTypingTarget
      if (e.key === "F11") {
        e.preventDefault();
        (async () => {
          try {
            const { getCurrentWindow } = await import("@tauri-apps/api/window");
            const win = getCurrentWindow();
            const isFs = await win.isFullscreen();
            await win.setFullscreen(!isFs);
          } catch {
            // fallback web fullscreen
            try {
              if (document.fullscreenElement) await document.exitFullscreen();
              else await document.documentElement.requestFullscreen();
            } catch {}
          }
        })();
        return;
      }

      // Shift+Esc toggles Resource Bar - independent, always (spec §10)
      if (e.shiftKey && e.key === "Escape") {
        e.preventDefault();
        useResourceStore.getState().toggleBar();
        return;
      }

      // Esc priority: Launcher(100) > Settings(95) > Files(94) > Center(90) > Bar(40)
      if (e.key === "Escape") {
        const launcher = useLauncherStore.getState();
        if (launcher.open) {
          e.preventDefault();
          launcher.closeLauncher();
          return;
        }
        const settings = useSettingsStore.getState();
        if (settings.isOpen) {
          e.preventDefault();
          settings.closeSettings();
          return;
        }
        const fs = useFilesystemStore.getState();
        if (fs.isOpen) {
          e.preventDefault();
          fs.close();
          return;
        }
        const rs = useResourceStore.getState();
        if (rs.isCenterOpen) {
          e.preventDefault();
          rs.closeCenter();
          return;
        }
        if (rs.isBarOpen) {
          e.preventDefault();
          rs.setBarOpen(false);
          return;
        }
      }

      const launcher = useLauncherStore.getState();
      // Ctrl+Space - launcher toggle (global, §9/§15.7) — robust: e.code vs e.key vs keyCode
      const isSpace =
        e.code === "Space" ||
        e.key === " " ||
        e.key === "Space" ||
        e.key === "Spacebar" ||
        (e as unknown as { keyCode?: number }).keyCode === 32 ||
        (e as unknown as { which?: number }).which === 32;
      if (e.ctrlKey && !e.altKey && !e.metaKey && isSpace) {
        e.preventDefault();
        if (launcher.open) launcher.closeLauncher();
        else launcher.openLauncher();
        return;
      }

      // skip workspace hotkeys while launcher open
      if (launcher.open) return;

      const typing = isTypingTarget(e.target);
      const ws = useWorkspaceStore.getState();

      // Ctrl+Alt+A - sidebar toggle (always)
      if (e.ctrlKey && e.altKey && (e.key.toLowerCase() === "a" || e.code === "KeyA")) {
        e.preventDefault();
        handleHotkeyToggle();
        return;
      }

      // When typing in rename input, skip workspace hotkeys except Esc handling elsewhere
      if (typing) return;

      // Ctrl+Alt+N - New OS Tab
      if (e.ctrlKey && e.altKey && (e.key.toLowerCase() === "n" || e.code === "KeyN")) {
        e.preventDefault();
        ws.createOsTab();
        return;
      }

      // Ctrl+Alt+W - Close active OS Tab
      if (e.ctrlKey && e.altKey && (e.key.toLowerCase() === "w" || e.code === "KeyW")) {
        e.preventDefault();
        const active = ws.activeOsTabId;
        if (active) {
          ws.closeOsTab(active);
        }
        return;
      }

      // Ctrl+Alt+ArrowLeft / Right - prev/next OS tab
      if (e.ctrlKey && e.altKey && (e.key === "ArrowLeft" || e.code === "ArrowLeft")) {
        e.preventDefault();
        ws.prevTab();
        return;
      }
      if (e.ctrlKey && e.altKey && (e.key === "ArrowRight" || e.code === "ArrowRight")) {
        e.preventDefault();
        ws.nextTab();
        return;
      }

      // Ctrl+Tab / Ctrl+Shift+Tab - next/prev App Tab within active OS (skip when typing)
      if (e.ctrlKey && !e.altKey && !e.metaKey && e.key === "Tab") {
        const activeOsTabId = ws.activeOsTabId;
        if (!activeOsTabId) return;
        e.preventDefault();
        const appStore = useAppTabStore.getState();
        if (e.shiftKey) appStore.prevAppTab(activeOsTabId);
        else appStore.nextAppTab(activeOsTabId);
        return;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleHotkeyToggle]);

  return (
    <>
      <SkipLink />
      <ErrorBoundary>
        <DesktopShell
          sidebarMode={sidebarMode}
          onToggleExpandCompact={toggleExpandCompact}
          onHideSidebar={hideSidebar}
          onRestoreSidebar={restoreSidebar}
          onShutdown={handleShutdown}
          onRestart={handleRestart}
        />
      </ErrorBoundary>
      <ResourceBar />
      <ResourceCenter />
      <FilesView />
      <SettingsPanel />
      <AppLauncher />
      <GlobalToast />
      {shutdownPhase && <BootSplash variant="shutdown" shutdownMode={shutdownPhase} />}
    </>
  );
}

function GlobalToast(): JSX.Element | null {
  const toast = useSettingsStore((s) => s.toast);
  const isOpen = useSettingsStore((s) => s.isOpen);
  // Only show global when Settings panel is closed, to surface Files placeholder toast
  if (!toast || isOpen) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        bottom: 20,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 110,
        padding: "10px 14px",
        borderRadius: "12px",
        border: "1px solid var(--color-border)",
        background: "var(--color-surface-overlay)",
        boxShadow: "var(--shadow-lg)",
        fontSize: 12,
        color: "var(--color-text)",
        maxWidth: "min(420px, 90vw)",
        textAlign: "center",
      }}
    >
      {toast}
    </div>
  );
}
