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
import { useUpdateStore } from "../stores/updateStore";
import AppLauncher from "../components/launcher/AppLauncher";
import ResourceBar from "../components/resources/ResourceBar";
import ResourceCenter from "../components/resources/ResourceCenter";
import SettingsPanel from "../components/settings/SettingsPanel";
import FilesView from "../components/files/FilesView";
import SkipLink from "../components/a11y/SkipLink";
import ErrorBoundary from "../components/a11y/ErrorBoundary";
import azaleaIcon from "../../asset/icon-azaleaos.png";
import "../components/a11y/SkipLink.css";
import "./AppShell.css";

function playStartupChime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, ctx.currentTime);
    master.gain.exponentialRampToValueAtTime(0.13, ctx.currentTime + 0.05);
    master.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.25);
    master.connect(ctx.destination);
    [523.25, 659.25, 783.99].forEach((frequency, index) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.value = 0.42 - index * 0.08;
      oscillator.connect(gain);
      gain.connect(master);
      oscillator.start(ctx.currentTime + index * 0.11);
      oscillator.stop(ctx.currentTime + 1.35);
    });
    window.setTimeout(() => void ctx.close(), 1600);
  } catch {
    // Audio is enhancement-only. Startup must never fail because audio is unavailable.
  }
}

export default function AppShell(): JSX.Element {
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>("expanded");
  const [booting, setBooting] = useState(true);
  const prevModeRef = useRef<SidebarMode>("expanded");
  const theme = useSettingsStore((s) => s.settings.appearance.theme);
  const animationLevel = useSettingsStore((s) => s.settings.appearance.animationLevel);

  const hideSidebar = useCallback(() => {
    setSidebarMode((curr) => {
      if (curr === "hidden") return curr;
      prevModeRef.current = curr;
      return "hidden";
    });
  }, []);

  const restoreSidebar = useCallback(() => setSidebarMode(prevModeRef.current), []);
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
      if (curr === "hidden") return prevModeRef.current;
      prevModeRef.current = curr;
      return "hidden";
    });
  }, []);

  useLifecycleSubscription(true);

  useEffect(() => { initFilesystemStore(); }, []);
  useEffect(() => { useUpdateStore.getState().init(); }, []);

  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const resolved = theme === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : theme;
      root.dataset.theme = resolved;
      root.dataset.motion = animationLevel;
      root.style.colorScheme = resolved;
    };
    apply();
    if (theme !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme, animationLevel]);

  useEffect(() => {
    playStartupChime();
    const timer = window.setTimeout(() => setBooting(false), 2100);
    return () => window.clearTimeout(timer);
  }, []);

  const dispatchHotkey = useCallback((keyId: string) => {
    const launcher = useLauncherStore.getState();
    const ws = useWorkspaceStore.getState();
    switch (keyId) {
      case "shiftEsc": case "ShiftEsc": case "Shift+Esc": useResourceStore.getState().toggleBar(); break;
      case "ctrlSpace": case "CtrlSpace": case "Ctrl+Space": launcher.open ? launcher.closeLauncher() : launcher.openLauncher(); break;
      case "ctrlAltA": case "CtrlAltA": case "Ctrl+Alt+A": handleHotkeyToggle(); break;
      case "ctrlAltN": case "CtrlAltN": case "Ctrl+Alt+N": if (!launcher.open) ws.createOsTab(); break;
      case "ctrlAltW": case "CtrlAltW": case "Ctrl+Alt+W": if (!launcher.open && ws.activeOsTabId) ws.closeOsTab(ws.activeOsTabId); break;
      case "ctrlAltLeft": case "CtrlAltLeft": case "Ctrl+Alt+Left": if (!launcher.open) ws.prevTab(); break;
      case "ctrlAltRight": case "CtrlAltRight": case "Ctrl+Alt+Right": if (!launcher.open) ws.nextTab(); break;
      case "ctrlTab": case "CtrlTab": case "Ctrl+Tab": if (!launcher.open && ws.activeOsTabId) useAppTabStore.getState().nextAppTab(ws.activeOsTabId); break;
      case "ctrlShiftTab": case "CtrlShiftTab": case "Ctrl+Shift+Tab": if (!launcher.open && ws.activeOsTabId) useAppTabStore.getState().prevAppTab(ws.activeOsTabId); break;
    }
  }, [handleHotkeyToggle]);

  useEffect(() => {
    let unlistenGlobal: (() => void) | undefined;
    let unlistenWindow: (() => void) | undefined;
    (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlistenGlobal = await listen<{ id?: string; idStr?: string; accelerator?: string }>("azalea:hotkey", ({ payload }) => {
          dispatchHotkey(payload.idStr || payload.id || payload.accelerator || "");
        });
        try {
          const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
          unlistenWindow = await getCurrentWebviewWindow().listen<{ id?: string; idStr?: string; accelerator?: string }>("azalea:hotkey-window", ({ payload }) => {
            dispatchHotkey(payload.idStr || payload.id || payload.accelerator || "");
          });
        } catch {
          // Global event listener remains the compatibility path.
        }
      } catch (e) {
        console.warn("Tauri hotkey listener failed:", e);
      }
    })();
    return () => { unlistenGlobal?.(); unlistenWindow?.(); };
  }, [dispatchHotkey]);

  useEffect(() => {
    const isTypingTarget = (el: EventTarget | null) => el instanceof HTMLElement && (["input", "textarea", "select"].includes(el.tagName.toLowerCase()) || el.isContentEditable);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key === "Escape") { e.preventDefault(); dispatchHotkey("shiftEsc"); return; }
      if (e.key === "Escape") {
        const launcher = useLauncherStore.getState();
        if (launcher.open) { e.preventDefault(); launcher.closeLauncher(); return; }
        const settings = useSettingsStore.getState();
        if (settings.isOpen) { e.preventDefault(); settings.closeSettings(); return; }
        const fs = useFilesystemStore.getState();
        if (fs.isOpen) { e.preventDefault(); fs.close(); return; }
        const rs = useResourceStore.getState();
        if (rs.isCenterOpen) { e.preventDefault(); rs.closeCenter(); return; }
        if (rs.isBarOpen) { e.preventDefault(); rs.setBarOpen(false); return; }
      }
      if (e.ctrlKey && !e.altKey && !e.metaKey && e.code === "Space") { e.preventDefault(); dispatchHotkey("ctrlSpace"); return; }
      if (useLauncherStore.getState().open) return;
      if (e.ctrlKey && e.altKey && e.code === "KeyA") { e.preventDefault(); dispatchHotkey("ctrlAltA"); return; }
      if (isTypingTarget(e.target)) return;
      if (e.ctrlKey && e.altKey && e.code === "KeyN") { e.preventDefault(); dispatchHotkey("ctrlAltN"); return; }
      if (e.ctrlKey && e.altKey && e.code === "KeyW") { e.preventDefault(); dispatchHotkey("ctrlAltW"); return; }
      if (e.ctrlKey && e.altKey && e.code === "ArrowLeft") { e.preventDefault(); dispatchHotkey("ctrlAltLeft"); return; }
      if (e.ctrlKey && e.altKey && e.code === "ArrowRight") { e.preventDefault(); dispatchHotkey("ctrlAltRight"); return; }
      if (e.ctrlKey && !e.altKey && e.code === "Tab") { e.preventDefault(); dispatchHotkey(e.shiftKey ? "ctrlShiftTab" : "ctrlTab"); }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [dispatchHotkey]);

  return (
    <>
      <SkipLink />
      <ErrorBoundary>
        <DesktopShell sidebarMode={sidebarMode} onToggleExpandCompact={toggleExpandCompact} onHideSidebar={hideSidebar} onRestoreSidebar={restoreSidebar} />
      </ErrorBoundary>
      <ResourceBar />
      <ResourceCenter />
      <FilesView />
      <SettingsPanel />
      <AppLauncher />
      <GlobalToast />
      {booting && <SplashScreen />}
    </>
  );
}

function SplashScreen(): JSX.Element {
  return (
    <div className="az-splash" role="status" aria-label="Starting AzaleaOS">
      <div className="az-splash__aurora" />
      <img className="az-splash__logo" src={azaleaIcon} alt="" />
      <div className="az-splash__name">Azalea<span>OS</span></div>
      <div className="az-splash__loader"><i /></div>
      <div className="az-splash__text">Preparing your workspace</div>
    </div>
  );
}

function GlobalToast(): JSX.Element | null {
  const toast = useSettingsStore((s) => s.toast);
  const isOpen = useSettingsStore((s) => s.isOpen);
  if (!toast || isOpen) return null;
  return <div role="status" aria-live="polite" className="az-global-toast">{toast}</div>;
}
