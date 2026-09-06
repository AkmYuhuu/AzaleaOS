// Empty workspace is intentionally minimal — plain wallpaper like macOS/Linux.
// No center card/brain icon that blocks the viewport. Subtle bottom hint only.
export default function EmptyWorkspace({ workspaceName = "Development" }: { workspaceName?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`${workspaceName} — empty workspace`}
      style={{
        position: "absolute",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 1,
        pointerEvents: "none",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 10px",
        borderRadius: 999,
        fontSize: 11,
        lineHeight: 1,
        letterSpacing: "0.02em",
        color: "var(--color-text-faint)",
        background: "color-mix(in srgb, var(--color-surface) 72%, transparent)",
        border: "1px solid color-mix(in srgb, var(--color-border) 70%, transparent)",
        backdropFilter: "blur(6px)",
        opacity: 0.85,
        whiteSpace: "nowrap",
        maxWidth: "calc(100% - 32px)",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      <span style={{ fontWeight: 600, color: "var(--color-text-muted)", overflow: "hidden", textOverflow: "ellipsis" }}>
        {workspaceName}
      </span>
      <span aria-hidden style={{ opacity: 0.5 }}>
        ·
      </span>
      <span>Press Ctrl+Space to launch</span>
    </div>
  );
}
