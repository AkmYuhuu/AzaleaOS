import { useCallback, memo } from "react";
import { useResourceStore } from "../../stores/resourceStore";
import styles from "./ResourceBar.module.css";

function formatRam(used: number, total: number): string {
  return `${used.toFixed(1)}/${total.toFixed(0)} GB`;
}

function ResourceBarInner(): JSX.Element | null {
  const snapshot = useResourceStore((s) => s.snapshot);
  const isBarOpen = useResourceStore((s) => s.isBarOpen);
  const setBarOpen = useResourceStore((s) => s.setBarOpen);
  const openCenter = useResourceStore((s) => s.openCenter);

  const handleMetricClick = useCallback(() => {
    openCenter();
  }, [openCenter]);

  if (!isBarOpen) return null;
  if (!snapshot) {
    return (
      <div className={styles.bar} role="status" aria-label="Resource bar loading">
        <span className={styles.brand} aria-hidden>🌸 AzaleaOS</span>
        <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-faint)" }}>Loading resources…</span>
      </div>
    );
  }

  const { cpu, ram, gpu, disk } = snapshot;

  return (
    <div className={styles.bar} role="toolbar" aria-label="Resource bar">
      <span className={styles.brand}>🌸 AzaleaOS</span>

      <div className={styles.metrics}>
        <button
          type="button"
          className={styles.metricBtn}
          onClick={handleMetricClick}
          aria-label={`CPU ${cpu} percent, open Resource Center`}
          title="Open Resource Center - CPU"
        >
          <span className={styles.metricLabel}>CPU</span>
          <span className={styles.metricValue}>{cpu}%</span>
        </button>
        <span className={styles.metricSep} aria-hidden />
        <button
          type="button"
          className={styles.metricBtn}
          onClick={handleMetricClick}
          aria-label={`RAM ${ram.used} of ${ram.total} gigabytes, open Resource Center`}
          title="Open Resource Center - RAM"
        >
          <span className={styles.metricLabel}>RAM</span>
          <span className={styles.metricValue}>{formatRam(ram.used, ram.total)}</span>
        </button>
        <span className={styles.metricSep} aria-hidden />
        <button
          type="button"
          className={styles.metricBtn}
          onClick={handleMetricClick}
          aria-label={gpu !== undefined ? `GPU ${gpu} percent, open Resource Center` : "GPU unavailable, open Resource Center"}
          title="Open Resource Center - GPU"
        >
          <span className={styles.metricLabel}>GPU</span>
          <span className={styles.metricValue}>{gpu !== undefined ? `${gpu}%` : "-"}</span>
        </button>
        <span className={styles.metricSep} aria-hidden />
        <button
          type="button"
          className={styles.metricBtn}
          onClick={handleMetricClick}
          aria-label={`Disk ${disk} percent, open Resource Center`}
          title="Open Resource Center - Disk"
        >
          <span className={styles.metricLabel}>Disk</span>
          <span className={styles.metricValue}>{disk}%</span>
        </button>
      </div>

      <button
        type="button"
        className={styles.dismiss}
        onClick={() => setBarOpen(false)}
        aria-label="Dismiss resource bar (Esc)"
        title="Dismiss (Esc)"
      >
        ×
      </button>
    </div>
  );
}

const ResourceBar = memo(ResourceBarInner);
export default ResourceBar;
