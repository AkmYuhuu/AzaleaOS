import { useEffect, useState } from "react";
import { playBootChime, playShutdownChime } from "../../utils/bootChime";
import styles from "./BootSplash.module.css";

const MIN_VISIBLE_MS = 1300;
const FADE_OUT_MS = 450;

type BootSplashProps = {
  variant?: "boot" | "shutdown";
  shutdownMode?: "shutdown" | "restart";
};

export default function BootSplash({ variant = "boot", shutdownMode = "shutdown" }: BootSplashProps) {
  const isShutdown = variant === "shutdown";
  const [phase, setPhase] = useState<"visible" | "leaving" | "gone">("visible");

  useEffect(() => {
    if (isShutdown) {
      playShutdownChime();
      // shutdown overlay stays visible; parent controls close after 1200ms
      return;
    }
    playBootChime();
    const leaveTimer = window.setTimeout(() => setPhase("leaving"), MIN_VISIBLE_MS);
    return () => window.clearTimeout(leaveTimer);
  }, [isShutdown]);

  useEffect(() => {
    if (isShutdown) return;
    if (phase !== "leaving") return;
    const goneTimer = window.setTimeout(() => setPhase("gone"), FADE_OUT_MS);
    return () => window.clearTimeout(goneTimer);
  }, [phase, isShutdown]);

  if (!isShutdown && phase === "gone") return null;

  const overlayClass = [
    styles.overlay,
    phase === "leaving" && !isShutdown ? styles.overlayLeaving : "",
    isShutdown ? styles.overlayShutdown : "",
  ]
    .filter(Boolean)
    .join(" ");

  const ariaLabel = isShutdown
    ? shutdownMode === "restart"
      ? "AzaleaOS is restarting"
      : "AzaleaOS is shutting down"
    : "AzaleaOS is starting";

  return (
    <div
      className={overlayClass}
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
      style={{ "--fade-out-ms": `${FADE_OUT_MS}ms` } as React.CSSProperties}
    >
      <div className={styles.mark}>
        <img src="/icon-azaleaos.png" alt="" width={128} height={128} className={styles.markImg} />
        <div className={`${styles.markGlow} ${isShutdown ? styles.markGlowShutdown : ""}`} aria-hidden />
      </div>
      <div className={styles.loading} aria-hidden>
        <div className={`${styles.spinner} ${isShutdown ? styles.spinnerShutdown : ""}`} />
      </div>
      <div className={styles.loadingText}>{isShutdown ? "Shutdown AzaleaOS" : "Masuk AzaleaOS, Harap tunggu"}</div>
      {isShutdown && <div className={styles.shutdownSubtext}>{shutdownMode === "restart" ? "Restarting..." : "Powering off..."}</div>}
      <div className={styles.wordmark}>AzaleaOS</div>
      <div className={styles.dots} aria-hidden>
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.dot} />
      </div>
    </div>
  );
}
