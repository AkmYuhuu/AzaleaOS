import type { FsEntry } from "../../types/filesystem";

function KindIcon({ kind, name }: { kind: FsEntry["kind"]; name: string }) {
  const isDrive = kind === "drive";
  const isFolder = kind === "folder";
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  const fileTone: Record<string, string> = {
    png: "#0ea5e9", jpg: "#0ea5e9", jpeg: "#0ea5e9", mp4: "#8b5cf6", pdf: "#ef4444",
    docx: "#2563eb", xlsx: "#059669", csv: "#059669", md: "#6b7280", txt: "#6b7280",
    exe: "#71706f", zip: "#b7791f", lnk: "#9a9998",
  };
  if (isDrive) {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.35} aria-hidden>
        <rect x="2.5" y="4.5" width="11" height="8" rx="1.2" />
        <path d="M2.5 7H13.5" />
        <circle cx="5.2" cy="10.2" r="1" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (isFolder) {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.35} aria-hidden>
        <path d="M2.5 3.5A1 1 0 0 1 3.5 2.5H6l1.5 1.5H12.5A1 1 0 0 1 13.5 5V12.5A1 1 0 0 1 12.5 13.5H3.5A1 1 0 0 1 2.5 12.5V3.5Z" />
      </svg>
    );
  }
  const tint = fileTone[ext] ?? "currentColor";
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M4.2 2.5H9L11.8 5.2V12.5A1 1 0 0 1 10.8 13.5H4.2A1 1 0 0 1 3.2 12.5V3.5A1 1 0 0 1 4.2 2.5Z" stroke={tint} strokeWidth={1.3} />
      <path d="M9 2.7V5.2H11.8" stroke={tint} strokeWidth={1.2} strokeLinejoin="round" />
    </svg>
  );
}

export default function FileRow({
  entry,
  selected,
  focused,
  onSelect,
  onOpen,
}: {
  entry: FsEntry;
  selected: boolean;
  focused: boolean;
  onSelect: (multi: boolean) => void;
  onOpen: () => void;
}) {
  return (
    <tr
      role="row"
      aria-selected={selected}
      tabIndex={focused ? 0 : -1}
      data-selected={selected ? "true" : "false"}
      data-focused={focused ? "true" : "false"}
      onClick={(e) => onSelect(e.ctrlKey || e.metaKey)}
      onDoubleClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onOpen(); } }}
      title={entry.name}
      style={{
        cursor: "default",
        background: selected ? "var(--color-accent-subtle)" : undefined,
        outline: focused ? "2px solid var(--color-focus-ring)" : undefined,
        outlineOffset: focused ? -2 : undefined,
      }}
    >
      <td style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", minWidth: 0 }}>
        <span style={{ color: selected ? "var(--color-accent)" : "var(--color-text-muted)", flexShrink: 0 }}>
          <KindIcon kind={entry.kind} name={entry.name} />
        </span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: entry.kind !== "file" ? 500 : 400 }}>
          {entry.name}
        </span>
      </td>
      <td style={{ padding: "8px 10px", whiteSpace: "nowrap", color: "var(--color-text-muted)", fontVariantNumeric: "tabular-nums", fontSize: 12 }}>
        {entry.kind === "file" && entry.sizeKb !== undefined ? (entry.sizeKb >= 1024 ? `${(entry.sizeKb / 1024).toFixed(1)} MB` : `${entry.sizeKb} KB`) : entry.kind === "drive" ? "-" : "-"}
      </td>
      <td style={{ padding: "8px 10px", whiteSpace: "nowrap", color: "var(--color-text-faint)", fontSize: 12 }}>
        {entry.modifiedAt ? new Date(entry.modifiedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: entry.modifiedAt < Date.now() - 180*86400000 ? "numeric" : undefined }) : "-"}
      </td>
    </tr>
  );
}
