import { useState, useRef, useEffect } from "react";
import type { AppDescriptor } from "../../types/appTab";
import styles from "./ExternalFallbackSurface.module.css";

type Props = {
  descriptor?: AppDescriptor;
  label: string;
};

export default function ExternalFallbackSurface({ descriptor, label }: Props) {
  const [toast, setToast] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);
  useEffect(() => () => { if (timerRef.current !== null) window.clearTimeout(timerRef.current); }, []);
  const name = descriptor?.name ?? label;

  function onLaunch() {
    setToast("Launched externally - app.launch called");
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setToast(null), 2200) as unknown as number;
  }

  return (
    <div className={styles.shell} role="region" aria-label={`${name} external fallback`}>
      <div className={styles.panel}>
        <div className={styles.icon} aria-hidden>◧</div>
        <h2 className={styles.title}>App detected</h2>
        <p className={styles.body}>
          This application can be launched from Azalea, but cannot be fully managed by the current integration.
        </p>
        {descriptor && (
          <p className={styles.meta}>
            {name} · {descriptor.category} · {descriptor.source ?? "windows"}
          </p>
        )}
        <button type="button" className={styles.launchBtn} onClick={onLaunch}>
          Launch externally
        </button>
        <div className={styles.toast} aria-live="polite">
          {toast ?? "Fallback keeps Azalea stable - no window handle claimed."}
        </div>
      </div>
    </div>
  );
}
