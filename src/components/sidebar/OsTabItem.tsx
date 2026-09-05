import { memo, useEffect, useRef, useState } from "react";
import styles from "./Sidebar.module.css";

function OsTabItemInner({
  num,
  name,
  active,
  isCompact,
  onSwitch,
  onRename,
  onRequestClose,
}: {
  num: string;
  name: string;
  active?: boolean;
  isCompact: boolean;
  onSwitch: () => void;
  onRename: (next: string) => void;
  onRequestClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setDraft(name), [name]);
  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    const trimmed = draft.trim();
    setEditing(false);
    if (!trimmed || trimmed === name) {
      setDraft(name);
      return;
    }
    onRename(trimmed);
  };

  if (isCompact) {
    return (
      <div className={styles.osRow}>
        <button
          type="button"
          role="tab"
          aria-selected={active ? "true" : "false"}
          tabIndex={active ? 0 : -1}
          className={`${styles.osTab} ${active ? styles.osTabActive : ""} ${styles.osTabCompact}`}
          aria-label={`${num} ${name}${active ? " - active workspace" : ""}`}
          title={`${num} ${name} - click to switch, arrow keys to navigate`}
          onClick={onSwitch}
          onKeyDown={(e) => {
            if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
            const list = (e.currentTarget.closest('[role="tablist"]') as HTMLElement | null);
            if (!list) return;
            const tabs = Array.from(list.querySelectorAll<HTMLElement>('[role="tab"]'));
            const idx = tabs.indexOf(e.currentTarget as HTMLElement);
            let next = idx;
            if (e.key === "ArrowDown") next = Math.min(tabs.length - 1, idx + 1);
            if (e.key === "ArrowUp") next = Math.max(0, idx - 1);
            if (e.key === "Home") next = 0;
            if (e.key === "End") next = tabs.length - 1;
            if (next !== idx) { e.preventDefault(); tabs[next]?.focus(); (tabs[next] as HTMLElement)?.click(); }
          }}
        >
          <span className={styles.osNum} aria-hidden>{num}</span>
        </button>
      </div>
    );
  }

  return (
    <div className={styles.osRow}>
      <button
        type="button"
        role="tab"
        aria-selected={active ? "true" : "false"}
        tabIndex={active ? 0 : -1}
        className={`${styles.osTab} ${active ? styles.osTabActive : ""}`}
        aria-label={`${num} ${name}${active ? " - active workspace" : ""}`}
        onClick={onSwitch}
        onDoubleClick={() => setEditing(true)}
        title={editing ? `Renaming ${name} - Enter to confirm` : `${name} - double-click to rename`}
        onKeyDown={(e) => {
          if (editing) return;
          if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
          const list = (e.currentTarget.closest('[role="tablist"]') as HTMLElement | null);
          if (!list) return;
          const tabs = Array.from(list.querySelectorAll<HTMLElement>('[role="tab"]'));
          const idx = tabs.indexOf(e.currentTarget as HTMLElement);
          let next = idx;
          if (e.key === "ArrowDown") next = Math.min(tabs.length - 1, idx + 1);
          if (e.key === "ArrowUp") next = Math.max(0, idx - 1);
          if (e.key === "Home") next = 0;
          if (e.key === "End") next = tabs.length - 1;
          if (next !== idx) { e.preventDefault(); tabs[next]?.focus(); (tabs[next] as HTMLElement)?.click(); }
        }}
      >
        <span className={styles.osNum} aria-hidden>{num}</span>
        {editing ? (
          <input
            ref={inputRef}
            className={styles.editInput}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") {
                setDraft(name);
                setEditing(false);
              }
            }}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Rename ${name}`}
          />
        ) : (
          <span className={styles.osName}>{name}</span>
        )}
        {active && !editing && <span className={styles.activeDot} aria-hidden />}
      </button>

      {!editing && (
        <span className={styles.osActions} aria-hidden={false}>
          <button
            type="button"
            className={styles.iconBtn}
            aria-label={`Rename ${name}`}
            title="Rename (double-click tab)"
            onClick={() => setEditing(true)}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.35} aria-hidden>
              <path d="M11.5 2.5 13.5 4.5 5 13H2.5V10.5L11.5 2.5Z" strokeLinejoin="round" />
              <path d="M10.5 3.5 12.5 5.5" />
            </svg>
          </button>
          <button
            type="button"
            className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
            aria-label={`Close ${name}`}
            title={`Close ${name}`}
            onClick={(e) => {
              e.stopPropagation();
              onRequestClose();
            }}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
              <path d="M4 4 12 12M12 4 4 12" strokeLinecap="round" />
            </svg>
          </button>
        </span>
      )}
    </div>
  );
}
const OsTabItem = memo(OsTabItemInner);
export default OsTabItem;
