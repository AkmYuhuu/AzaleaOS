import { useCallback, useEffect, useMemo, useRef } from "react";
import { useResourceStore } from "../../stores/resourceStore";
import { useMountTransition } from "../../hooks/useMountTransition";
import styles from "./ResourceCenter.module.css";

function formatUptime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatRamMB(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}

function stateDotClass(state: string): string {
  const map: Record<string, string> = {
    ACTIVE: styles.stateDotActive,
    BACKGROUND: styles.stateDotBackground,
    OPTIMIZING: styles.stateDotOptimizing,
    PROTECTED: styles.stateDotProtected,
    ERROR: styles.stateDotError,
    GAME: styles.stateDotGame,
    UNAVAILABLE: styles.stateDotUnavailable,
  };
  return map[state] ?? styles.stateDotBackground;
}

function statusClass(status: string): string {
  const m: Record<string, string> = {
    Normal: styles.statusNormal,
    Protected: styles.statusProtected,
    Optimizing: styles.statusOptimizing,
    Error: styles.statusError,
  };
  return m[status] ?? styles.statusNormal;
}

// honey: outer guards isCenterOpen only - prevents 750ms rerenders when closed (§28)
export default function ResourceCenter(): JSX.Element | null {
  const isOpen = useResourceStore((s) => s.isCenterOpen);
  const { shouldRender, phase } = useMountTransition(isOpen, 160);
  if (!shouldRender) return null;
  return <ResourceCenterInner phase={phase} />;
}

function ResourceCenterInner({ phase }: { phase: "enter" | "exit" }): JSX.Element | null {
  const snapshot = useResourceStore((s) => s.snapshot);
  const apps = useResourceStore((s) => s.apps);
  const adaptive = useResourceStore((s) => s.adaptive);
  const protectedTasks = useResourceStore((s) => s.protectedTasks);
  const history = useResourceStore((s) => s.history);
  const closeCenter = useResourceStore((s) => s.closeCenter);
  const isOpen = true as const;

  const panelRef = useRef<HTMLDivElement>(null);

  const onBackdrop = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) closeCenter();
    },
    [closeCenter],
  );

  // focus trap + restore
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const el = panelRef.current;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !el) return;
      const nodes = Array.from(el.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')).filter(n => !n.hasAttribute("disabled"));
      if (nodes.length === 0) { e.preventDefault(); return; }
      // include panel itself as focusable via tabIndex -1? trap within panel's focusables
      if (e.shiftKey && document.activeElement === nodes[0]) { e.preventDefault(); nodes[nodes.length - 1]!.focus(); }
      else if (!e.shiftKey && document.activeElement === nodes[nodes.length - 1]) { e.preventDefault(); nodes[0]!.focus(); }
      // if focus is on panel itself and tab pressed, move to first
      if (document.activeElement === el && nodes[0]) { e.preventDefault(); nodes[0].focus(); }
    };
    el?.addEventListener("keydown", onKey);
    return () => {
      el?.removeEventListener("keydown", onKey);
      if (prev && typeof prev.focus === "function") {
        try { prev.focus(); } catch { /* ignore */ }
      }
    };
  }, [isOpen]);

  const historyMax = useMemo(() => Math.max(...history.map((h) => h.cpu), 100), [history]);

  if (!isOpen) return null;

  const loading = !snapshot || !adaptive;

  return (
    <div
      className={`${styles.backdrop} ${phase === "enter" ? styles.backdropEnter : styles.backdropExit}`}
      role="presentation"
      onMouseDown={onBackdrop}
      aria-hidden={false}
    >
      <div
        ref={panelRef}
        className={`${styles.panel} ${phase === "enter" ? styles.panelEnter : styles.panelExit}`}
        role="dialog"
        aria-modal="true"
        aria-label="Azalea Resource Center"
        tabIndex={-1}
      >
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>Azalea Resource Center</h2>
            <p className={styles.subtitle}>Adaptive optimization • Memory pressure • Background resource reduction</p>
          </div>
          <button type="button" className={styles.closeBtn} onClick={closeCenter} aria-label="Close Resource Center" title="Close (Esc)">
            ×
          </button>
        </div>

        <div className={styles.body}>
          {loading ? (
            <div className={styles.loading} role="status" aria-label="Loading resources">
              <div style={{ display: "grid", gap: 10 }}>
                <div className={styles.skeleton} style={{ width: "100%" }} />
                <div className={styles.skeleton} style={{ width: "76%" }} />
                <div className={styles.skeleton} style={{ width: "92%" }} />
              </div>
              <p style={{ marginTop: 12 }}>Loading resource data…</p>
            </div>
          ) : (
            <>
              {/* System Summary */}
              <section aria-label="System summary">
                <h3 className={styles.sectionTitle}>System Summary</h3>
                <div className={styles.summaryGrid}>
                  <div className={styles.summaryCard}>
                    <span className={styles.summaryLabel}>CPU</span>
                    <span className={styles.summaryValue}>{snapshot!.cpu}%</span>
                    <span className={styles.summaryHint}>Processor usage</span>
                  </div>
                  <div className={styles.summaryCard}>
                    <span className={styles.summaryLabel}>RAM</span>
                    <span className={styles.summaryValue}>
                      {snapshot!.ram.used.toFixed(1)} / {snapshot!.ram.total.toFixed(0)} GB
                    </span>
                    <span className={styles.summaryHint}>{snapshot!.ram.available.toFixed(1)} GB available</span>
                  </div>
                  <div className={styles.summaryCard}>
                    <span className={styles.summaryLabel}>GPU</span>
                    {snapshot!.gpu !== undefined ? (
                      <>
                        <span className={styles.summaryValue}>{snapshot!.gpu}%</span>
                        <span className={styles.summaryHint}>Graphics usage</span>
                      </>
                    ) : (
                      <span className={styles.gpuFallback}>Unable to read GPU metrics. CPU/RAM monitoring is still available.</span>
                    )}
                  </div>
                  <div className={styles.summaryCard}>
                    <span className={styles.summaryLabel}>Disk</span>
                    <span className={styles.summaryValue}>{snapshot!.disk}%</span>
                    <span className={styles.summaryHint}>Disk activity</span>
                  </div>
                  <div className={styles.summaryCard}>
                    <span className={styles.summaryLabel}>Network</span>
                    <span className={styles.summaryValue}>
                      ↓ {snapshot!.networkDown ?? 0} Mbps · ↑ {snapshot!.networkUp ?? 0} Mbps
                    </span>
                    <span className={styles.summaryHint}>Network activity</span>
                  </div>
                  <div className={styles.summaryCard}>
                    <span className={styles.summaryLabel}>Uptime</span>
                    <span className={styles.summaryValue}>{formatUptime(snapshot!.uptimeSec)}</span>
                    <span className={styles.summaryHint}>System uptime</span>
                  </div>
                </div>
              </section>

              {/* Azalea Applications */}
              <section aria-label="Azalea applications">
                <h3 className={styles.sectionTitle}>Azalea Applications</h3>
                <div className={styles.appTableWrap}>
                  <table className={styles.appTable}>
                    <thead>
                      <tr>
                        <th>App</th>
                        <th>State</th>
                        <th>RAM</th>
                        <th>CPU</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {apps.map((a) => (
                        <tr key={a.appTabId}>
                          <td style={{ fontWeight: 500 }}>{a.label}</td>
                          <td>
                            <span className={`${styles.stateDot} ${stateDotClass(a.state)}`} aria-hidden />
                            {a.state}
                          </td>
                          <td className={styles.ramCell}>{formatRamMB(a.ramMB)}</td>
                          <td className={styles.cpuCell}>{a.cpuPct.toFixed(1)}%</td>
                          <td>
                            <span className={`${styles.statusChip} ${statusClass(a.status)}`}>{a.status}</span>
                          </td>
                        </tr>
                      ))}
                      {apps.length === 0 && (
                        <tr>
                          <td colSpan={5} style={{ textAlign: "center", color: "var(--color-text-faint)" }}>
                            No managed apps
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Adaptive Resource */}
              <section aria-label="Adaptive resource">
                <h3 className={styles.sectionTitle}>Adaptive Resource</h3>
                <div className={styles.adaptiveCard}>
                  <div className={styles.adaptiveItem}>
                    <span className={styles.adaptiveLabel}>Mode</span>
                    <span className={styles.adaptiveValue}>{adaptive!.mode}</span>
                  </div>
                  <div className={styles.adaptiveItem}>
                    <span className={styles.adaptiveLabel}>System Pressure</span>
                    <span className={styles.adaptiveValue}>{adaptive!.pressure}</span>
                  </div>
                  <div className={styles.adaptiveItem}>
                    <span className={styles.adaptiveLabel}>Background Apps</span>
                    <span className={styles.adaptiveValue}>{adaptive!.backgroundApps}</span>
                  </div>
                  <div className={styles.adaptiveItem}>
                    <span className={styles.adaptiveLabel}>Optimizing</span>
                    <span className={styles.adaptiveValue}>{adaptive!.optimizing}</span>
                  </div>
                  <div className={styles.adaptiveItem}>
                    <span className={styles.adaptiveLabel}>Protected Tasks</span>
                    <span className={styles.adaptiveValue}>{adaptive!.protectedTasks}</span>
                  </div>
                </div>
              </section>

              {/* Protected Tasks */}
              <section aria-label="Protected tasks">
                <h3 className={styles.sectionTitle}>Protected Tasks</h3>
                <div className={styles.protectedList}>
                  {protectedTasks.map((t) => (
                    <div key={t.id} className={styles.protectedItem}>
                      <span className={styles.protectedLabel}>{t.label}</span>
                      <span className={styles.protectedDetail}>{t.detail}</span>
                    </div>
                  ))}
                  {protectedTasks.length === 0 && (
                    <div className={styles.protectedItem}>
                      <span className={styles.protectedDetail}>No protected tasks</span>
                    </div>
                  )}
                </div>
              </section>

              {/* Recent Resource History */}
              <section aria-label="Recent resource history">
                <h3 className={styles.sectionTitle}>Recent Resource History - 5 min</h3>
                <div className={styles.historyWrap}>
                  <div className={styles.historyHeader}>
                    <span className={styles.historyTitle}>CPU usage</span>
                    <span className={styles.historyMeta}>{history.length} points · ~750ms</span>
                  </div>
                  {history.length > 1 ? (
                    <svg className={styles.sparkline} viewBox="0 0 100 48" preserveAspectRatio="none" role="img" aria-label="CPU history sparkline">
                      <polyline
                        fill="none"
                        stroke="var(--color-accent)"
                        strokeWidth={1.6}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        opacity={0.9}
                        points={history
                          .map((p, i) => {
                            const x = (i / Math.max(1, history.length - 1)) * 100;
                            const y = 48 - (p.cpu / historyMax) * 40 - 4;
                            return `${x},${y}`;
                          })
                          .join(" ")}
                      />
                    </svg>
                  ) : (
                    <div className={styles.barHistory} aria-hidden>
                      {history.map((p, i) => (
                        <span
                          key={i}
                          className={styles.barHistoryBar}
                          style={{ height: `${Math.max(4, (p.cpu / 100) * 48)}px` }}
                          title={`${p.cpu}%`}
                        />
                      ))}
                    </div>
                  )}
                  {/* fallback bar history for no-js visual */}
                  <div className={styles.barHistory} aria-hidden style={{ marginTop: 8, display: history.length > 1 ? "none" : "flex" }}>
                    {history.map((p, i) => (
                      <span
                        key={`b-${i}`}
                        className={styles.barHistoryBar}
                        style={{ height: `${Math.max(4, (p.cpu / historyMax) * 48)}px`, opacity: 0.55 }}
                      />
                    ))}
                  </div>
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
