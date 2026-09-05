import { useState, useRef, useEffect } from "react";
import type { AppDescriptor } from "../../types/appTab";
import styles from "./UnsupportedAppSurface.module.css";

type Props = {
  descriptor?: AppDescriptor;
  label: string;
  reason?: string;
};

export default function UnsupportedAppSurface({ descriptor, label, reason }: Props) {
  const [toast, setToast] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);
  useEffect(() => () => { if (timerRef.current !== null) window.clearTimeout(timerRef.current); }, []);
  const name = descriptor?.name ?? label;
  const r = reason ?? descriptor?.reason ?? "game";

  function onLaunch() {
    setToast("Launched externally - app.launch called");
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setToast(null), 2200) as unknown as number;
  }

  return (
    <div className={styles.shell} role="region" aria-label={`${name} unsupported`}>
      <div className={styles.panel}>
        <div className={styles.badge} aria-hidden>
          <span className={styles.badgeDot} />
          Unsupported
        </div>
        <h2 className={styles.title}>This app is not managed by AzaleaOS.</h2>
        <p className={styles.body}>Reason: Game applications are excluded from normal Azalea management.</p>
        <p className={styles.reason}>
          Detail: <code className={styles.mono}>reason="{r}"</code> · {name} · category: {descriptor?.category ?? "game"}
        </p>
        <button type="button" className={styles.launchBtn} onClick={onLaunch}>
          Launch externally
        </button>
        <div className={styles.toast} aria-live="polite">
          {toast ?? "Azalea will not claim window handle or PID for unsupported apps."}
        </div>
      </div>
    </div>
  );
}
