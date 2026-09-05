import { memo } from "react";
import type { AppTab } from "../../types/appTab";
import styles from "./AppTabBar.module.css";

function Monogram({ label }: { label: string }) {
  const ch = label.trim().charAt(0).toUpperCase() || "•";
  return (
    <span className={styles.mono} aria-hidden>
      {ch}
    </span>
  );
}

const LIFECYCLE_TITLES: Record<AppTab["state"], string> = {
  active: "State: ACTIVE - Foreground application",
  background: "State: BACKGROUND - Background resource reduction (backend)",
  optimizing: "State: OPTIMIZING - Adaptive optimization (backend)",
  protected: "State: PROTECTED - Protected task - will not be optimized (backend)",
  game: "State: GAME - Game application - excluded from normal management (backend)",
  unavailable: "State: UNAVAILABLE - Not available for management (backend)",
  error: "State: ERROR - Backend reported an issue (backend)",
};

function StateDot({ state }: { state: AppTab["state"] }) {
  if (state === "active") return <span className={`${styles.dot} ${styles.dotActive}`} aria-hidden title={LIFECYCLE_TITLES.active} />;
  if (state === "background") return <span className={`${styles.dot} ${styles.dotBackground}`} aria-hidden title={LIFECYCLE_TITLES.background} />;
  if (state === "optimizing") return <span className={`${styles.dot} ${styles.dotOptimizing}`} aria-hidden title={LIFECYCLE_TITLES.optimizing} />;
  if (state === "protected") return <span className={`${styles.dot} ${styles.dotProtected}`} aria-hidden title={LIFECYCLE_TITLES.protected} />;
  if (state === "error") return <span className={`${styles.dot} ${styles.dotError}`} aria-hidden title={LIFECYCLE_TITLES.error} />;
  if (state === "game") return <span className={`${styles.dot} ${styles.dotGame}`} aria-hidden title={LIFECYCLE_TITLES.game} />;
  if (state === "unavailable") return <span className={`${styles.dot} ${styles.dotUnavailable}`} aria-hidden title={LIFECYCLE_TITLES.unavailable} />;
  return null;
}

function StateIcon({ state }: { state: AppTab["state"] }) {
  if (state === "protected") {
    return (
      <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.3} aria-hidden className={styles.stateIcon}>
        <path d="M8 2.2 12.5 5V8.2C12.5 10.2 10.6 12.1 8 13.5 5.4 12.1 3.5 10.2 3.5 8.2V5L8 2.2Z" />
      </svg>
    );
  }
  if (state === "error") {
    return (
      <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} aria-hidden className={styles.stateIcon}>
        <path d="M8 4.2V8.5" strokeLinecap="round" />
        <circle cx="8" cy="11.2" r="1" fill="currentColor" stroke="none" />
        <path d="M2.5 13H13.5L8 2.8 2.5 13Z" strokeLinejoin="round" />
      </svg>
    );
  }
  if (state === "optimizing") {
    return (
      <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.3} aria-hidden className={styles.stateIcon}>
        <path d="M8 3V5M8 11V13M3 8H5M11 8H13M4.8 4.8 6.1 6.1M9.9 9.9 11.2 11.2M4.8 11.2 6.1 9.9M9.9 6.1 11.2 4.8" strokeLinecap="round" />
        <circle cx="8" cy="8" r="2.2" />
      </svg>
    );
  }
  if (state === "game") {
    // subtle gamepad icon - not neon, uses currentColor faint
    return (
      <svg width="11" height="10" viewBox="0 0 16 12" fill="none" stroke="currentColor" strokeWidth={1.2} aria-hidden className={styles.stateIcon}>
        <rect x="2.5" y="3.5" width="11" height="6.5" rx="2" />
        <circle cx="6" cy="6.8" r="0.9" fill="currentColor" stroke="none" />
        <circle cx="10" cy="6.8" r="0.9" fill="currentColor" stroke="none" />
        <path d="M5 5V5.2M10 5H10.2" strokeLinecap="round" />
      </svg>
    );
  }
  if (state === "unavailable") {
    return (
      <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.3} aria-hidden className={styles.stateIcon}>
        <circle cx="8" cy="8" r="4.5" />
        <path d="M5.2 5.2 10.8 10.8" strokeLinecap="round" />
      </svg>
    );
  }
  return null;
}

function AppTabInner({
  tab,
  isActive,
  onSelect,
  onClose,
}: {
  tab: AppTab;
  isActive: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  return (
    <div
      role="tab"
      aria-selected={isActive ? "true" : "false"}
      tabIndex={isActive ? 0 : -1}
      className={`${styles.tab} ${isActive ? styles.tabActive : ""} ${styles["tabState_" + tab.state] ?? ""}`}
      title={`${tab.label} - ${LIFECYCLE_TITLES[tab.state]}`}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <span className={styles.tabIcon} aria-hidden>
        <Monogram label={tab.label} />
      </span>
      <span className={styles.tabLabel}>{tab.label}</span>
      <span className={styles.stateWrap} aria-hidden>
        <StateDot state={tab.state} />
        <StateIcon state={tab.state} />
      </span>
      {isActive && <span className={styles.activeLine} aria-hidden />}
      <button
        type="button"
        aria-label={`Close ${tab.label}`}
        className={styles.closeBtn}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        title={`Close ${tab.label}`}
        tabIndex={0}
      >
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
          <path d="M4.5 4.5 11.5 11.5M11.5 4.5 4.5 11.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
const AppTab = memo(AppTabInner);
export default AppTab;
