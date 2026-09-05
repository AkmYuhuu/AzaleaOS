import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFilesystemStore } from "../../stores/filesystemStore";
import { useSettingsStore } from "../../stores/settingsStore";
import FileRow from "./FileRow";
import styles from "./FilesView.module.css";

type LocationId = "home" | "desktop" | "documents" | "downloads" | "pictures" | "videos" | "drives" | "recent";

const LOCATIONS: { id: LocationId; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "desktop", label: "Desktop" },
  { id: "documents", label: "Documents" },
  { id: "downloads", label: "Downloads" },
  { id: "pictures", label: "Pictures" },
  { id: "videos", label: "Videos" },
  { id: "drives", label: "Drives" },
  { id: "recent", label: "Recent" },
];

function NavIcon({ id }: { id: string }) {
  const common = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none" } as const;
  if (id === "home") return <svg {...common} stroke="currentColor" strokeWidth={1.35} aria-hidden><path d="M2.5 7.5L8 2.8L13.5 7.5V12.5A1 1 0 0 1 12.5 13.5H3.5A1 1 0 0 1 2.5 12.5V7.5Z"/><path d="M6 13.5V9H10V13.5"/></svg>;
  if (id === "desktop") return <svg {...common} stroke="currentColor" strokeWidth={1.3} aria-hidden><rect x="2.5" y="3.5" width="11" height="7" rx="1"/><path d="M6 13.5H10M8 10.5V13.5"/></svg>;
  if (id === "documents") return <svg {...common} stroke="currentColor" strokeWidth={1.3} aria-hidden><path d="M4 2.5H9L12.5 5V12.5A1 1 0 0 1 11.5 13.5H4A1 1 0 0 1 3 12.5V3.5A1 1 0 0 1 4 2.5Z"/><path d="M9 2.7V5H12.3"/></svg>;
  if (id === "downloads") return <svg {...common} stroke="currentColor" strokeWidth={1.3} aria-hidden><path d="M8 3.5V10"/><path d="M5.2 7.2L8 10L10.8 7.2"/><path d="M3 12.5H13"/></svg>;
  if (id === "pictures") return <svg {...common} stroke="currentColor" strokeWidth={1.3} aria-hidden><rect x="2.5" y="3.5" width="11" height="9" rx="1"/><circle cx="6" cy="7" r="1.2"/><path d="M2.8 11.2L5.8 8.2L9 10.5L11.2 8.8L13.2 11.5"/></svg>;
  if (id === "videos") return <svg {...common} stroke="currentColor" strokeWidth={1.3} aria-hidden><rect x="2.5" y="3.8" width="11" height="8.5" rx="1"/><path d="M6.5 7.5L10.2 8.9L6.5 10.3V7.5Z" fill="currentColor" stroke="none"/></svg>;
  if (id === "drives") return <svg {...common} stroke="currentColor" strokeWidth={1.35} aria-hidden><rect x="2.5" y="4.5" width="11" height="8" rx="1.2"/><path d="M2.5 7H13.5"/><circle cx="5.2" cy="10.2" r="1" fill="currentColor" stroke="none"/></svg>;
  return <svg {...common} stroke="currentColor" strokeWidth={1.3} aria-hidden><circle cx="8" cy="8" r="5"/><path d="M8 6.2V8L10 9.2" strokeLinecap="round"/></svg>;
}

export default function FilesView(): JSX.Element | null {
  const isOpen = useFilesystemStore((s) => s.isOpen);
  const locationId = useFilesystemStore((s) => s.locationId);
  const currentPath = useFilesystemStore((s) => s.currentPath);
  const entries = useFilesystemStore((s) => s.entries);
  const selectedPaths = useFilesystemStore((s) => s.selectedPaths);
  const isLoading = useFilesystemStore((s) => s.isLoading);
  const error = useFilesystemStore((s) => s.error);
  const history = useFilesystemStore((s) => s.pathHistory);
  const historyIndex = useFilesystemStore((s) => s.historyIndex);

  const close = useFilesystemStore((s) => s.close);
  const navigateTo = useFilesystemStore((s) => s.navigateTo);
  const navigateToPath = useFilesystemStore((s) => s.navigateToPath);
  const goBack = useFilesystemStore((s) => s.goBack);
  const goForward = useFilesystemStore((s) => s.goForward);
  const goUp = useFilesystemStore((s) => s.goUp);
  const refresh = useFilesystemStore((s) => s.refresh);
  const select = useFilesystemStore((s) => s.select);
  const clearSelection = useFilesystemStore((s) => s.clearSelection);
  const selectAll = useFilesystemStore((s) => s.selectAll);
  const createFolder = useFilesystemStore((s) => s.createFolder);
  const rename = useFilesystemStore((s) => s.rename);
  const deletePaths = useFilesystemStore((s) => s.deletePaths);
  const openEntry = useFilesystemStore((s) => s.openEntry);

  const panelRef = useRef<HTMLDivElement>(null);
  const [focusedIdx, setFocusedIdx] = useState<number>(-1);
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [newFolderName, setNewFolderName] = useState("New folder");
  const [showNewFolder, setShowNewFolder] = useState(false);

  const canBack = historyIndex > 0;
  const canForward = historyIndex < history.length - 1;
  const canUp = currentPath !== "drives:" && currentPath !== "recent:" && currentPath !== "C:\\" && currentPath !== "D:\\" && !!currentPath;

  const breadcrumbs = useMemo(() => {
    if (currentPath === "drives:") return [{ label: "Drives", path: "drives:" }];
    if (currentPath === "recent:") return [{ label: "Recent", path: "recent:" }];
    // split Windows path
    const parts = currentPath.split("\\").filter(Boolean);
    // handle C: case
    const crumbs: { label: string; path: string }[] = [];
    let acc = "";
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i]!;
      if (i === 0 && p.endsWith(":")) {
        acc = p + "\\";
        crumbs.push({ label: p, path: acc });
      } else {
        acc = acc ? `${acc}\\${p}` : p;
        // normalize: for C:\Users case, acc already has slash
        if (acc.startsWith("C:") && !acc.startsWith("C:\\")) acc = acc.replace("C:", "C:\\");
        const label = p;
        crumbs.push({ label, path: acc.replace(/\\+$/, "") || acc });
      }
    }
    // Ensure first crumb path correctness for C:
    return crumbs.length ? crumbs : [{ label: currentPath, path: currentPath }];
  }, [currentPath]);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    setFocusedIdx(entries.length ? 0 : -1);
    const el = panelRef.current;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !el) return;
      const nodes = Array.from(el.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')).filter(n => !n.hasAttribute("disabled"));
      if (nodes.length === 0) return;
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    el?.addEventListener("keydown", onKey);
    return () => { el?.removeEventListener("keydown", onKey); try { prev?.focus(); } catch {} };
  }, [isOpen, entries.length]);

  useEffect(() => {
    if (!isOpen) return;
    setFocusedIdx((idx) => (entries.length === 0 ? -1 : Math.min(idx, entries.length - 1)));
  }, [entries, isOpen]);

  const onBackdrop = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) close();
  }, [close]);

  const handleOpen = useCallback(async (idx: number) => {
    const entry = entries[idx];
    if (!entry) return;
    const result = await openEntry(entry);
    if (result) {
      useSettingsStore.getState().setToast(`Opened ${result}`);
      window.setTimeout(() => useSettingsStore.getState().setToast(null), 1800);
    }
  }, [entries, openEntry]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIdx((i) => Math.min((i < 0 ? 0 : i + 1), entries.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIdx((i) => Math.max((i < 0 ? 0 : i - 1), 0));
    } else if (e.key === "Enter") {
      if (focusedIdx >= 0) void handleOpen(focusedIdx);
    } else if (e.key === "a" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault(); selectAll();
    } else if (e.key === "Escape" && renameTarget) {
      setRenameTarget(null);
    }
  }, [entries.length, focusedIdx, handleOpen, renameTarget, selectAll]);

  if (!isOpen) return null;

  return (
    <div className={styles.backdrop} role="presentation" onMouseDown={onBackdrop}>
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label="Azalea Files"
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>Azalea Files</h2>
            <p className={styles.subtitle}>Windows filesystem • Mock data • Real ops via Tauri when backend ready</p>
          </div>
          <button type="button" className={styles.closeBtn} onClick={close} aria-label="Close Files" title="Close Files (Esc)">×</button>
        </div>

        <div className={styles.body}>
          <nav className={styles.nav} aria-label="Locations">
            {LOCATIONS.map((loc) => (
              <button
                key={loc.id}
                type="button"
                className={`${styles.navItem} ${locationId === loc.id ? styles.navItemActive : ""}`}
                aria-current={locationId === loc.id ? "page" : undefined}
                onClick={() => void navigateTo(loc.id)}
              >
                <span className={styles.navIcon} aria-hidden><NavIcon id={loc.id} /></span>
                <span className={styles.navLabel}>{loc.label}</span>
              </button>
            ))}
          </nav>

          <div className={styles.main}>
            <div className={styles.pathBar}>
              <div className={styles.navBtns}>
                <button type="button" className={styles.iconBtn} aria-label="Back" title="Back" disabled={!canBack} onClick={() => void goBack()}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} aria-hidden><path d="M10 3L6 8L10 13" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
                <button type="button" className={styles.iconBtn} aria-label="Forward" title="Forward" disabled={!canForward} onClick={() => void goForward()}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} aria-hidden><path d="M6 3L10 8L6 13" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
                <button type="button" className={styles.iconBtn} aria-label="Up" title="Up" disabled={!canUp} onClick={() => void goUp()}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} aria-hidden><path d="M8 4V12M8 4L5 7M8 4L11 7" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
                <button type="button" className={styles.iconBtn} aria-label="Refresh" title="Refresh" onClick={() => void refresh()}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.3} aria-hidden><path d="M12.8 8A4.8 4.8 0 1 1 11 3.8"/><path d="M12.8 3.2V8H8.2" strokeLinejoin="round"/></svg>
                </button>
              </div>

              <div className={styles.breadcrumbs} role="navigation" aria-label="Breadcrumb">
                {breadcrumbs.map((c, idx) => (
                  <span key={c.path + idx} style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                    <button
                      type="button"
                      className={`${styles.crumb} ${idx === breadcrumbs.length - 1 ? styles.crumbActive : ""}`}
                      onClick={() => void navigateToPath(c.path)}
                      title={c.path}
                    >
                      {c.label}
                    </button>
                    {idx < breadcrumbs.length - 1 && <span className={styles.sep}>›</span>}
                  </span>
                ))}
              </div>
            </div>

            <div className={styles.toolbar} role="toolbar" aria-label="File actions">
              {!showNewFolder ? (
                <button
                  type="button"
                  className={`${styles.toolBtn} ${styles.toolBtnPrimary}`}
                  aria-label="Create folder"
                  disabled={currentPath === "recent:" || currentPath === "drives:"}
                  title={currentPath === "recent:" ? "Cannot create here" : "Create folder"}
                  onClick={() => setShowNewFolder(true)}
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden><path d="M8 3.5V12.5M3.5 8H12.5"/></svg>
                  New folder
                </button>
              ) : (
                <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                  <input
                    className={styles.inlineInput}
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="Folder name"
                    aria-label="New folder name"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const n = newFolderName.trim() || "New folder";
                        void createFolder(n).then(() => {
                          useSettingsStore.getState().setToast(`Created folder "${n}"`);
                          window.setTimeout(() => useSettingsStore.getState().setToast(null), 1600);
                          setShowNewFolder(false);
                          setNewFolderName("New folder");
                        });
                      }
                      if (e.key === "Escape") setShowNewFolder(false);
                    }}
                  />
                  <button
                    type="button"
                    className={styles.toolBtn}
                    onClick={() => {
                      const n = newFolderName.trim() || "New folder";
                      void createFolder(n).then(() => {
                        useSettingsStore.getState().setToast(`Created folder "${n}"`);
                        window.setTimeout(() => useSettingsStore.getState().setToast(null), 1600);
                        setShowNewFolder(false);
                        setNewFolderName("New folder");
                      });
                    }}
                  >
                    Create
                  </button>
                  <button type="button" className={styles.toolBtn} onClick={() => setShowNewFolder(false)}>Cancel</button>
                </span>
              )}

              <button
                type="button"
                className={styles.toolBtn}
                aria-label="Rename"
                disabled={selectedPaths.length !== 1}
                onClick={() => {
                  const p = selectedPaths[0];
                  if (!p) return;
                  const entry = entries.find((e) => e.path === p);
                  if (!entry) return;
                  setRenameTarget(p);
                  setRenameValue(entry.name);
                }}
              >
                Rename
              </button>

              <button
                type="button"
                className={styles.toolBtn}
                aria-label="Delete"
                disabled={selectedPaths.length === 0}
                onClick={() => {
                  const count = selectedPaths.length;
                  void deletePaths(selectedPaths).then(() => {
                    useSettingsStore.getState().setToast(`Deleted ${count} item${count > 1 ? "s" : ""}`);
                    window.setTimeout(() => useSettingsStore.getState().setToast(null), 1600);
                  });
                }}
              >
                Delete
              </button>

              <button type="button" className={styles.toolBtn} aria-label="Select all" onClick={() => selectAll()} disabled={entries.length === 0}>
                Select all
              </button>

              {selectedPaths.length > 0 && (
                <button type="button" className={styles.toolBtn} aria-label="Clear selection" onClick={() => clearSelection()}>
                  Clear
                </button>
              )}

              {renameTarget && (
                <span style={{ display: "inline-flex", gap: 6, alignItems: "center", marginLeft: "auto" }}>
                  <input
                    className={styles.inlineInput}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    aria-label="Rename to"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const t = renameTarget;
                        const nv = renameValue.trim();
                        if (!nv || !t) return;
                        void rename(t, nv).then(() => {
                          useSettingsStore.getState().setToast(`Renamed to "${nv}"`);
                          window.setTimeout(() => useSettingsStore.getState().setToast(null), 1600);
                          setRenameTarget(null);
                        });
                      }
                      if (e.key === "Escape") setRenameTarget(null);
                    }}
                  />
                  <button
                    type="button"
                    className={styles.toolBtn}
                    onClick={() => {
                      const t = renameTarget!;
                      const nv = renameValue.trim();
                      if (!nv) return;
                      void rename(t, nv).then(() => {
                        useSettingsStore.getState().setToast(`Renamed to "${nv}"`);
                        window.setTimeout(() => useSettingsStore.getState().setToast(null), 1600);
                        setRenameTarget(null);
                      });
                    }}
                  >
                    Confirm
                  </button>
                  <button type="button" className={styles.toolBtn} onClick={() => setRenameTarget(null)}>Cancel</button>
                </span>
              )}
            </div>

            {error && <div className={styles.error} role="alert">Unable to read "{currentPath}". {error}</div>}

            <div className={styles.listWrap} role="region" aria-label="File list">
              {isLoading ? (
                <div className={styles.loading} role="status" aria-label="Loading files">
                  <div className={styles.skeleton} style={{ width: "100%" }} />
                  <div className={styles.skeleton} style={{ width: "82%" }} />
                  <div className={styles.skeleton} style={{ width: "68%" }} />
                  <div className={styles.skeleton} style={{ width: "90%" }} />
                </div>
              ) : entries.length === 0 ? (
                <div className={styles.empty}>
                  <div className={styles.emptyIcon} aria-hidden>
                    <svg width="22" height="22" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.35}><path d="M2.5 3.5A1 1 0 0 1 3.5 2.5H6l1.5 1.5H12.5A1 1 0 0 1 13.5 5V12.5A1 1 0 0 1 12.5 13.5H3.5A1 1 0 0 1 2.5 12.5V3.5Z"/></svg>
                  </div>
                  <div className={styles.emptyTitle}>Empty folder</div>
                  <div className={styles.emptyDesc}>This folder is empty. Create a new folder to get started.</div>
                  <button
                    type="button"
                    className={`${styles.toolBtn} ${styles.toolBtnPrimary}`}
                    disabled={currentPath === "recent:" || currentPath === "drives:"}
                    onClick={() => setShowNewFolder(true)}
                  >
                    Create Folder
                  </button>
                </div>
              ) : (
                <table className={styles.table} role="grid" aria-label="Files">
                  <thead>
                    <tr>
                      <th style={{ width: "62%" }}>Name</th>
                      <th>Size</th>
                      <th>Modified</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry, idx) => (
                      <FileRow
                        key={entry.path}
                        entry={entry}
                        selected={selectedPaths.includes(entry.path)}
                        focused={focusedIdx === idx}
                        onSelect={(multi) => {
                          select(entry.path, multi);
                          setFocusedIdx(idx);
                        }}
                        onOpen={() => void handleOpen(idx)}
                      />
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className={styles.selectionBar} aria-live="polite">
              <span>{entries.length} item{entries.length !== 1 ? "s" : ""}</span>
              {selectedPaths.length > 0 && <span>• {selectedPaths.length} selected</span>}
              <span style={{ marginLeft: "auto", color: "var(--color-text-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 360 }}>{currentPath}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
