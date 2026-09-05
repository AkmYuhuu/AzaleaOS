import { useCallback, useEffect, useRef } from "react";

export function useFocusTrap(open: boolean, onClose: () => void): React.RefObject<HTMLDivElement> {
  const ref = useRef<HTMLDivElement>(null) as React.RefObject<HTMLDivElement>;
  const prevRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    prevRef.current = document.activeElement as HTMLElement | null;
    const el = ref.current;
    // focus first focusable or container
    requestAnimationFrame(() => {
      const focusable = el?.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      (focusable ?? el)?.focus();
    });
    return () => {
      // restore focus
      try { prevRef.current?.focus(); } catch { /* ignore */ }
    };
  }, [open]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== "Tab") return;
    const el = ref.current;
    if (!el) return;
    const nodes = Array.from(
      el.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')
    ).filter((n) => n.offsetParent !== null || n === document.activeElement);
    if (nodes.length === 0) { e.preventDefault(); return; }
    const first = nodes[0]!;
    const last = nodes[nodes.length - 1]!;
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }, []);

  // Attach keydown handler via effect to support programmatic ref usage
  useEffect(() => {
    if (!open) return;
    const el = ref.current;
    if (!el) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // let parent handle Esc via global priority; don't close here to avoid double
      }
      if (e.key !== "Tab") return;
      const nodes = Array.from(
        el.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')
      ).filter((n) => !n.hasAttribute("disabled"));
      if (nodes.length === 0) { e.preventDefault(); return; }
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    el.addEventListener("keydown", handler);
    return () => el.removeEventListener("keydown", handler);
  }, [open]);

  // expose onKeyDown for JSX if needed
  // store on element via data attr not needed
  return ref;
}
