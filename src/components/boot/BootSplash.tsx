import { useEffect, useState } from "react";
import { playBootChime } from "../../utils/bootChime";
import styles from "./BootSplash.module.css";

const MIN_VISIBLE_MS = 1300;
const FADE_OUT_MS = 450;

export default function BootSplash() {
  const [phase, setPhase] = useState<"visible" | "leaving" | "gone">("visible");

  useEffect(() => {
    playBootChime();
    const leaveTimer = window.setTimeout(() => setPhase("leaving"), MIN_VISIBLE_MS);
    return () => window.clearTimeout(leaveTimer);
  }, []);

  useEffect(() => {
    if (phase !== "leaving") return;
    const goneTimer = window.setTimeout(() => setPhase("gone"), FADE_OUT_MS);
    return () => window.clearTimeout(goneTimer);
  }, [phase]);

  if (phase === "gone") return null;

  return (
    <div
      className={`${styles.overlay} ${phase === "leaving" ? styles.overlayLeaving : ""}`}
      role="status"
      aria-label="AzaleaOS is starting"
      style={{ "--fade-out-ms": `${FADE_OUT_MS}ms` } as React.CSSProperties}
    >
      <div className={styles.mark}>
        <img src="/icon-azaleaos.png" alt="" width={72} height={72} className={styles.markImg} />
        <div className={styles.markGlow} aria-hidden />
      </div>
      <div className={styles.wordmark}>AzaleaOS</div>
      <div className={styles.dots} aria-hidden>
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.dot} />
      </div>
    </div>
  );
}
