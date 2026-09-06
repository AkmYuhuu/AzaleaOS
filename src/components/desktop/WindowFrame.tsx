import { useRef } from "react";
import { useWindowDrag } from "../../hooks/useWindowDrag";
import styles from "./WindowFrame.module.css";

type Props = {
  title: string;
  stateDotState?: string;
  stateText?: string;
  kindBadge?: string;
  kindBadgeKind?: string;
  onClose?: () => void;
  onMinimize?: () => void;
  allowFullscreen?: boolean;
  onRequestFullscreen?: () => void;
  isFullscreen?: boolean;
  initialMaximized?: boolean;
  children: React.ReactNode;
  headerMeta?: React.ReactNode;
};

export default function WindowFrame({
  title,
  stateDotState,
  stateText,
  kindBadge,
  kindBadgeKind,
  onClose,
  onMinimize,
  allowFullscreen,
  onRequestFullscreen,
  initialMaximized,
  children,
  headerMeta,
}: Props) {
  const windowRef = useRef<HTMLDivElement>(null);
  const { maximized, toggleMaximized, isDragging, showPreview, onMouseDown, windowStyle, setMaximized } = useWindowDrag(windowRef, {
    initialMaximized,
  });

  const handleMaximizeClick = () => toggleMaximized();

  const handleFullscreen = async () => {
    if (onRequestFullscreen) {
      onRequestFullscreen();
      return;
    }
    // fallback: try Tauri / web fullscreen if allowFullscreen
    if (!allowFullscreen) {
      toggleMaximized();
      return;
    }
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

  return (
    <>
      {showPreview && <div className={styles.snapPreview} aria-hidden />}
      <div
        ref={windowRef}
        className={`${styles.window} ${maximized ? styles.windowMaximized : styles.windowRestored} ${isDragging ? styles.windowDragging : ""}`}
        role="region"
        aria-label={`${title} window`}
        style={windowStyle}
      >
        <div className={styles.header} onMouseDown={onMouseDown} role="toolbar" aria-label="Window controls">
          <div className={styles.titleRow}>
            <span className={styles.appName} title={title}>
              {title}
            </span>
            {stateDotState && <span className={styles.stateDot} data-state={stateDotState} aria-hidden />}
            {stateText && (
              <span className={styles.stateText} data-state={stateDotState}>
                {stateText}
              </span>
            )}
            {kindBadge && (
              <span className={styles.kindBadge} data-kind={kindBadgeKind}>
                {kindBadge}
              </span>
            )}
          </div>
          {headerMeta}
          <div className={styles.controls}>
            {onMinimize && (
              <button type="button" className={styles.ctrlBtn} onClick={onMinimize} aria-label="Minimize" title="Minimize">
                —
              </button>
            )}
            <button
              type="button"
              className={styles.ctrlBtn}
              onClick={handleMaximizeClick}
              aria-label={maximized ? "Restore" : "Maximize"}
              title={maximized ? "Restore" : "Maximize"}
            >
              {maximized ? "❐" : "□"}
            </button>
            {allowFullscreen && (
              <button type="button" className={styles.ctrlBtn} onClick={handleFullscreen} aria-label="Fullscreen (F11)" title="Fullscreen (F11)">
                ⛶
              </button>
            )}
            {onClose && (
              <button type="button" className={`${styles.ctrlBtn} ${styles.ctrlBtnDanger}`} onClick={onClose} aria-label="Close" title="Close">
                ×
              </button>
            )}
          </div>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </>
  );
}

// Re-export hook for direct use in panels that need custom chrome but same drag logic
export { useWindowDrag };
