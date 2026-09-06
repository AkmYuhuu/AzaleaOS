import { useState, useMemo, useRef, useEffect } from "react";
import type { AppTab, AppDescriptor } from "../../types/appTab";
import type { AppRuntimeStub } from "../../types/appIntegration";
import { useAppTabStore } from "../../stores/appTabStore";
import WindowFrame from "./WindowFrame";
import styles from "./ManagedAppSurface.module.css";

type Props = {
  appTab: AppTab;
  descriptor?: AppDescriptor;
  integrationKind: "managed" | "embedded";
  runtime: AppRuntimeStub | null;
  embedded?: boolean;
};

export default function ManagedAppSurface({ appTab, descriptor, integrationKind, runtime, embedded }: Props) {
  const close = useAppTabStore((s) => s.closeAppTab);
  const lifecycleMeta = useAppTabStore((s) => s.lastLifecycleByAppTabId[appTab.id]);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  useEffect(() => () => { if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current); }, []);

  const name = descriptor?.name ?? appTab.label;
  const isError = appTab.state === "error";
  const isGame = appTab.state === "game";
  const isProtected = appTab.state === "protected";
  const isOptimizing = appTab.state === "optimizing";
  const isUnavailable = appTab.state === "unavailable";
  const isEmbedded = embedded || integrationKind === "embedded";

  const windowId = runtime?.windowId ?? runtime?.wid ?? appTab.windowId ?? "-";
  const processId = runtime?.processId ?? runtime?.pid ?? appTab.processId ?? "-";
  const execPath = runtime?.executablePath ?? descriptor?.executablePath;

  const stateLabel = appTab.state;

  const lifecycleAt = lifecycleMeta?.at ? new Date(lifecycleMeta.at).toLocaleTimeString() : null;
  const lifecycleDetail = lifecycleMeta?.detail ?? (
    isProtected ? "Protected task - will not be optimized" :
    isGame ? "Game application - excluded from normal management" :
    isOptimizing ? "Adaptive optimization - background resource reduction" :
    isError ? "Backend reported an issue - will retry" :
    isUnavailable ? "Not available for management" :
    appTab.state === "background" ? "Background resource reduction" :
    "Foreground application"
  );
  const lifecycleReason = lifecycleMeta?.reason ?? (isError ? "backend-error" : isProtected ? "protected-task" : isGame ? "game" : isOptimizing ? "memory-pressure" : "foreground");

  const pills = useMemo(() => (["active","background","optimizing","protected","error"] as const), []);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2200) as unknown as number;
  }

  const onFocus = () => showToast("Focus - window.focus called");
  const onMinimize = () => showToast("Minimize - window.minimize called");
  const onClose = () => close(appTab.osTabId, appTab.id);

  const onRequestFullscreen = async () => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      const isFs = await win.isFullscreen();
      await win.setFullscreen(!isFs);
    } catch {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen();
      } catch {}
    }
  };

  const headerMeta = (
    <div className={styles.metaRow} aria-label="Runtime info" style={{ marginLeft: 0, marginTop: 2 }}>
      <span className={styles.metaItem} title={String(windowId)}>
        window <code className={styles.mono}>{windowId}</code>
      </span>
      <span className={styles.sep} aria-hidden>·</span>
      <span className={styles.metaItem}>
        pid <code className={styles.mono}>{processId}</code>
      </span>
      {execPath && (
        <>
          <span className={styles.sep} aria-hidden>·</span>
          <span className={styles.metaItem} title={execPath} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>
            {execPath}
          </span>
        </>
      )}
    </div>
  );

  return (
    <WindowFrame
      title={name}
      stateDotState={stateLabel}
      stateText={stateLabel}
      kindBadge={isEmbedded ? "embedded" : "managed"}
      kindBadgeKind={integrationKind}
      onClose={onClose}
      onMinimize={onMinimize}
      allowFullscreen
      onRequestFullscreen={onRequestFullscreen}
      headerMeta={undefined}
    >
      <div style={{ display: "grid" }}>
        {/* keep metaRow inside frame body top for visibility when restored - headerMeta already in header, duplicate? keep one in body */}
        <div style={{ padding: "8px 14px 6px", borderBottom: "1px solid var(--color-border)", background: "color-mix(in srgb, var(--color-surface) 96%, var(--color-bg-subtle))" }}>
          {headerMeta}
        </div>

        <div className={styles.lifecycleRow} aria-label="Lifecycle status">
          <span className={styles.lifecycleBadge} data-state={stateLabel}>
            Lifecycle: {stateLabel.toUpperCase()} <span className={styles.lifecycleSep} aria-hidden>•</span> {lifecycleReason} <span className={styles.lifecycleSep} aria-hidden>•</span> {lifecycleDetail}
          </span>
          {lifecycleAt && <span className={styles.lifecycleAt} title={String(lifecycleMeta?.at)}>{lifecycleAt}</span>}
        </div>

        <div className={styles.pillRow} role="list" aria-label="Lifecycle state machine">
          {pills.map((p) => (
            <span key={p} role="listitem" className={`${styles.pill} ${appTab.state === p ? styles.pillActive : ""}`} data-state={p}>
              {p}
            </span>
          ))}
          {(isGame || isUnavailable) && (
            <>
              <span className={`${styles.pill} ${isGame ? styles.pillActive : ""}`} data-state="game">game</span>
              <span className={`${styles.pill} ${isUnavailable ? styles.pillActive : ""}`} data-state="unavailable">unavailable</span>
            </>
          )}
        </div>

        {isProtected && (
          <div className={styles.protectedBanner} role="status">
            <span className={styles.protectedStrong}>PROTECTED</span>
            <span className={styles.protectedText}> - {lifecycleDetail}.</span>
          </div>
        )}
        {isGame && (
          <div className={styles.gameBanner} role="status">
            <span className={styles.gameStrong}>GAME</span>
            <span className={styles.gameText}> - {lifecycleDetail}.</span>
          </div>
        )}
        {isError && (
          <div className={styles.errorBanner} role="alert">
            <span className={styles.errorStrong}>ERROR</span>
            <span className={styles.errorText}> - {lifecycleDetail} for {name}. Reason: {lifecycleReason}. Try focusing the app or retry.</span>
            <button type="button" className={styles.retryBtn} onClick={() => showToast("Retry - re-query app.get_state")}>
              Retry
            </button>
          </div>
        )}

        <div className={styles.body}>
          {isEmbedded ? (
            <div className={styles.embeddedHost} aria-label="Embedded host placeholder">
              <div className={styles.embeddedLabel}>Embedded view would be hosted here via Tauri window embedding - backend capability</div>
              <div className={styles.embeddedHint}>Border dashed · not neon · calm desktop surface · future: native webview/host handle</div>
              <div className={styles.embeddedFrame} aria-hidden>
                <div className={styles.frameTop}>
                  <span className={styles.dot} />
                  <span className={styles.dot} />
                  <span className={styles.dot} />
                  <span className={styles.frameTitle}>{name} - embedded</span>
                </div>
                <div className={styles.frameContent}>Host surface placeholder</div>
              </div>
            </div>
          ) : (
            <div className={styles.managedPlaceholder}>
              <div className={styles.managedTitle}>Managed - window {windowId}, pid {processId}</div>
              <div className={styles.managedHint}>
                Window is managed by AzaleaOS via backend (Tauri IPC). Focus/Minimize/Close delegate to <code className={styles.mono}>window.*</code> commands.
              </div>
              <div className={styles.previewGrid} aria-hidden>
                <div className={styles.previewCell} />
                <div className={styles.previewCell} />
                <div className={styles.previewCell} />
              </div>
            </div>
          )}
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.btn} onClick={onFocus}>
            Focus
          </button>
          <button type="button" className={styles.btn} onClick={onMinimize}>
            Minimize
          </button>
          <button type="button" className={`${styles.btn} ${styles.btnDanger}`} onClick={onClose}>
            Close
          </button>
          <span className={styles.actionHint} aria-live="polite">
            {toast ? toast : `Kind: ${integrationKind} · ${descriptor?.category ?? "unknown"}`}
          </span>
        </div>
      </div>
    </WindowFrame>
  );
}
