import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLauncherStore } from "../../stores/launcherStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useAppTabStore } from "../../stores/appTabStore";
import { filterAndSort } from "../../utils/fuzzy";
import { LAUNCHER_ITEMS, type LauncherItem } from "../../features/applications/launcherData";
import { MAX_APPS_PER_OS_TAB } from "../../types/workspace";
import styles from "./AppLauncher.module.css";

function kindIcon(item: LauncherItem): string {
  if (item.icon) return item.icon;
  if (item.kind === "app") return "◧";
  if (item.kind === "tool") return "⚙";
  return "📄";
}

export default function AppLauncher() {
  const open = useLauncherStore((s) => s.open);
  const query = useLauncherStore((s) => s.query);
  const selectedIndex = useLauncherStore((s) => s.selectedIndex);
  const setQuery = useLauncherStore((s) => s.setQuery);
  const closeLauncher = useLauncherStore((s) => s.closeLauncher);
  const moveSelection = useLauncherStore((s) => s.moveSelection);
  const setSelectedIndex = useLauncherStore((s) => s.setSelectedIndex);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const placeholderTimerRef = useRef<number | null>(null);
  const [limitMsg, setLimitMsg] = useState<string | null>(null);
  const [placeholderMsg, setPlaceholderMsg] = useState<string | null>(null);

  useEffect(() => () => { if (placeholderTimerRef.current !== null) window.clearTimeout(placeholderTimerRef.current); }, []);

  const filtered = useMemo(() => filterAndSort(LAUNCHER_ITEMS, query), [query]);

  // clamp selectedIndex when filtered changes
  useEffect(() => {
    if (!open) return;
    if (filtered.length === 0) setSelectedIndex(0);
    else if (selectedIndex >= filtered.length) setSelectedIndex(filtered.length - 1);
    else if (selectedIndex < 0) setSelectedIndex(0);
  }, [filtered.length, selectedIndex, setSelectedIndex, open]);

  // auto-focus on open + focus restore on close
  const prevFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) {
      prevFocusRef.current = document.activeElement as HTMLElement | null;
      setLimitMsg(null);
      setPlaceholderMsg(null);
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      // restore
      if (prevFocusRef.current) {
        try { prevFocusRef.current.focus(); } catch { /* ignore */ }
      }
    }
  }, [open]);

  // ensure active option visible
  useEffect(() => {
    if (!open || filtered.length === 0) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex, open, filtered.length]);

  const handleSelect = useCallback(
    (item: LauncherItem) => {
      if (item.kind === "app" && item.descriptor) {
        const activeOsTabId = useWorkspaceStore.getState().activeOsTabId;
        if (!activeOsTabId) {
          setLimitMsg("No active workspace.");
          return;
        }
        const res = useAppTabStore.getState().addAppTab(activeOsTabId, item.descriptor);
        if (!res) {
          setLimitMsg(`App limit reached (${MAX_APPS_PER_OS_TAB}) - cannot add`);
          setPlaceholderMsg(null);
          return;
        }
        setLimitMsg(null);
        closeLauncher();
      } else {
        // tool/file - placeholder contract for STEP 5
        setLimitMsg(null);
        setPlaceholderMsg(`"${item.label}" - Tool/File open contract will be implemented in Files/Settings step`);
        if (placeholderTimerRef.current !== null) window.clearTimeout(placeholderTimerRef.current);
        placeholderTimerRef.current = window.setTimeout(() => closeLauncher(), 900) as unknown as number;
      }
    },
    [closeLauncher],
  );

  const onKeyDownInput = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (filtered.length === 0) return;
        const next = Math.min(selectedIndex + 1, filtered.length - 1);
        setSelectedIndex(next);
        setLimitMsg(null);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const next = Math.max(selectedIndex - 1, 0);
        setSelectedIndex(next);
        setLimitMsg(null);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = filtered[selectedIndex];
        if (item) handleSelect(item);
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeLauncher();
      } else if (e.key === "Tab") {
        // keep focus inside launcher - prevent tabbing to behind
        e.preventDefault();
        if (e.shiftKey) moveSelection(-1);
        else moveSelection(1);
        // clamp after move
        const cur = useLauncherStore.getState().selectedIndex;
        if (cur >= filtered.length && filtered.length > 0) setSelectedIndex(filtered.length - 1);
      }
    },
    [filtered, selectedIndex, handleSelect, closeLauncher, moveSelection, setSelectedIndex],
  );

  if (!open) return null;

  return (
    <div
      className={styles.backdrop}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeLauncher();
      }}
      aria-hidden={false}
    >
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label="App Launcher"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <span className={styles.searchIcon} aria-hidden>🔍</span>
          <input
            ref={inputRef}
            className={styles.input}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimitMsg(null);
              setPlaceholderMsg(null);
            }}
            onKeyDown={onKeyDownInput}
            placeholder="Search apps, files, commands..."
            aria-label="Search apps, files, commands"
            aria-controls="launcher-listbox"
            aria-activedescendant={filtered.length ? `launcher-opt-${selectedIndex}` : undefined}
            role="combobox"
            aria-expanded={filtered.length > 0}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button
              type="button"
              className={styles.clearBtn}
              aria-label="Clear search"
              title="Clear search"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
            >
              ×
            </button>
          )}
        </div>

        {limitMsg && <div className={styles.limitBar} role="status" aria-live="polite">{limitMsg}</div>}
        {placeholderMsg && <div className={styles.placeholderBar} role="status" aria-live="polite">{placeholderMsg}</div>}

        <div className={styles.body}>
          {filtered.length === 0 ? (
            <div className={styles.empty} role="status" aria-live="polite">
              <div className={styles.emptyStrong}>No results for &lsquo;{query}&rsquo;</div>
              <div className={styles.hint}>Try &ldquo;code&rdquo;, &ldquo;chrome&rdquo;, &ldquo;term&rdquo; or clear search</div>
              <button type="button" className={styles.clearBtn} style={{ marginTop: 10 }} aria-label="Clear search and show all" title="Show all apps" onClick={() => { setQuery(""); inputRef.current?.focus(); }}>
                Show all apps
              </button>
            </div>
          ) : (
            <ul ref={listRef} id="launcher-listbox" className={styles.list} role="listbox" aria-label="Launcher results">
              {filtered.map((item, idx) => {
                const active = idx === selectedIndex;
                return (
                  <li
                    key={item.id}
                    id={`launcher-opt-${idx}`}
                    role="option"
                    aria-selected={active}
                    data-index={idx}
                    className={`${styles.row} ${active ? styles.rowActive : ""}`}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <span className={styles.kindIcon} aria-hidden>{kindIcon(item)}</span>
                    <span className={styles.main}>
                      <span className={styles.label}>{item.label}</span>
                      <span className={styles.meta}>
                        <span className={styles.kindBadge}>{item.kind}</span>
                        {item.category && <span className={styles.badge}>{item.category}</span>}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className={styles.footer} aria-hidden>
          <span className={styles.footerKbd}><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span className={styles.footerKbd}><kbd>↵</kbd> open</span>
          <span className={styles.footerKbd}><kbd>Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
