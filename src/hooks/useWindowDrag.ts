import { useCallback, useEffect, useRef, useState } from "react";

type Position = { x: number; y: number };

type UseWindowDragReturn = {
  position: Position;
  maximized: boolean;
  setMaximized: (v: boolean) => void;
  toggleMaximized: () => void;
  isDragging: boolean;
  showPreview: boolean;
  windowRef: React.RefObject<HTMLDivElement>;
  onMouseDown: (e: React.MouseEvent) => void;
  windowStyle: React.CSSProperties;
};

export function useWindowDrag(windowRef: React.RefObject<HTMLDivElement>, opts?: { initialMaximized?: boolean; clampPadding?: number }): UseWindowDragReturn {
  const [maximized, setMaximized] = useState(!!opts?.initialMaximized);
  const [position, setPosition] = useState<Position>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [hasCentered, setHasCentered] = useState(false);

  const dragStartRef = useRef<{ clientX: number; clientY: number; posX: number; posY: number } | null>(null);
  const wasMaximizedRef = useRef(false);
  const prevPosRef = useRef<Position>({ x: 0, y: 0 });
  const pendingRestoreRef = useRef(false);
  const containerRectRef = useRef<DOMRect | null>(null);

  const clampPadding = opts?.clampPadding ?? 8;

  // initial centering when mounted and not maximized
  useEffect(() => {
    if (maximized || hasCentered) return;
    const win = windowRef.current;
    const container = win?.parentElement as HTMLElement | null;
    if (!win || !container) return;
    // wait a tick for layout
    const id = window.requestAnimationFrame(() => {
      const cRect = container.getBoundingClientRect();
      const w = win.offsetWidth ? Math.min(win.offsetWidth, cRect.width - 32) : Math.min(720, cRect.width - 32);
      // estimate height 420 or container height - 40; use win height if available else 420
      const h = Math.min(win.offsetHeight || 420, cRect.height - 24);
      const cx = Math.max(clampPadding, (cRect.width - w) / 2);
      const cy = Math.max(clampPadding, (cRect.height - h) / 2 - 8);
      setPosition({ x: cx, y: cy });
      prevPosRef.current = { x: cx, y: cy };
      setHasCentered(true);
    });
    return () => window.cancelAnimationFrame(id);
  }, [maximized, hasCentered, clampPadding, windowRef]);

  // keep clamped on resize
  useEffect(() => {
    const onResize = () => {
      if (maximized) return;
      const win = windowRef.current;
      const container = win?.parentElement as HTMLElement | null;
      if (!win || !container) return;
      const cRect = container.getBoundingClientRect();
      const winW = win.offsetWidth ? Math.min(win.offsetWidth, cRect.width - 32) : Math.min(720, cRect.width - 32);
      const winH = Math.min(win.offsetHeight || 420, cRect.height - 24);
      setPosition((p) => {
        const maxX = Math.max(clampPadding, cRect.width - winW - clampPadding);
        const maxY = Math.max(clampPadding, cRect.height - winH - clampPadding);
        const nx = Math.min(Math.max(clampPadding, p.x), maxX);
        const ny = Math.min(Math.max(clampPadding, p.y), maxY);
        if (nx !== p.x || ny !== p.y) prevPosRef.current = { x: nx, y: ny };
        return { x: nx, y: ny };
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [maximized, clampPadding, windowRef]);

  const toggleMaximized = useCallback(() => {
    if (maximized) {
      // restore to previous
      setMaximized(false);
      setPosition(prevPosRef.current);
      setShowPreview(false);
    } else {
      // save current before maximizing
      prevPosRef.current = { ...position };
      setMaximized(true);
      setShowPreview(false);
    }
  }, [maximized, position]);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      const win = windowRef.current;
      const container = win?.parentElement as HTMLElement | null;
      if (!win || !container) return;
      const cRect = container.getBoundingClientRect();
      containerRectRef.current = cRect;
      wasMaximizedRef.current = maximized;
      if (maximized) {
        // pending restore, don't immediately flip — wait for move > threshold
        pendingRestoreRef.current = true;
        dragStartRef.current = { clientX: e.clientX, clientY: e.clientY, posX: 0, posY: 0 };
        setIsDragging(true);
        setShowPreview(false);
        e.preventDefault();
        return;
      }
      // restored drag start
      // if not yet centered (position 0,0) calculate centered first
      let startX = position.x;
      let startY = position.y;
      if (!hasCentered && position.x === 0 && position.y === 0) {
        const w = win.offsetWidth ? Math.min(win.offsetWidth, cRect.width - 32) : Math.min(720, cRect.width - 32);
        const h = Math.min(win.offsetHeight || 420, cRect.height - 24);
        startX = Math.max(clampPadding, (cRect.width - w) / 2);
        startY = Math.max(clampPadding, (cRect.height - h) / 2 - 8);
        setPosition({ x: startX, y: startY });
        setHasCentered(true);
      }
      prevPosRef.current = { x: startX, y: startY };
      dragStartRef.current = { clientX: e.clientX, clientY: e.clientY, posX: startX, posY: startY };
      setIsDragging(true);
      e.preventDefault();
    },
    [windowRef, maximized, position, hasCentered, clampPadding]
  );

  useEffect(() => {
    if (!isDragging) return;

    const onMove = (ev: MouseEvent) => {
      const start = dragStartRef.current;
      const cRect = containerRectRef.current;
      const win = windowRef.current;
      const container = win?.parentElement as HTMLElement | null;
      if (!start || !cRect || !win || !container) return;

      // handle maximized -> restore on drag down threshold
      if (wasMaximizedRef.current && pendingRestoreRef.current) {
        const dy = ev.clientY - start.clientY;
        const dx = Math.abs(ev.clientX - start.clientX);
        if (dy > 8 || dx > 8) {
          // restore
          pendingRestoreRef.current = false;
          wasMaximizedRef.current = false;
          setMaximized(false);
          // compute new position centered under cursor
          const w = win.offsetWidth ? Math.min(win.offsetWidth, cRect.width - 32) : Math.min(720, cRect.width - 32);
          const newX = ev.clientX - cRect.left - w / 2;
          const newY = ev.clientY - cRect.top - 16;
          const winH = Math.min(win.offsetHeight || 420, cRect.height - 24);
          const maxX = Math.max(clampPadding, cRect.width - w - clampPadding);
          const maxY = Math.max(clampPadding, cRect.height - winH - clampPadding);
          const clampedX = Math.min(Math.max(clampPadding, newX), maxX);
          const clampedY = Math.min(Math.max(clampPadding, newY), maxY);
          const nextPos = { x: clampedX, y: clampedY };
          setPosition(nextPos);
          prevPosRef.current = nextPos;
          // reset drag start to this new position so continued drag is smooth
          dragStartRef.current = { clientX: ev.clientX, clientY: ev.clientY, posX: clampedX, posY: clampedY };
          // preview false after restore
          setShowPreview(false);
          return;
        } else {
          // still pending, check snap preview? but maximized has no preview
          return;
        }
      }

      const dx = ev.clientX - start.clientX;
      const dy = ev.clientY - start.clientY;
      let nx = start.posX + dx;
      let ny = start.posY + dy;

      // clamp within container
      const w = win.offsetWidth ? Math.min(win.offsetWidth, cRect.width - 32) : Math.min(720, cRect.width - 32);
      // for width we use w, for height use win height estimate
      const winH = Math.min(win.offsetHeight || 420, cRect.height - 24);
      const maxX = Math.max(clampPadding, cRect.width - w - clampPadding);
      const maxY = Math.max(clampPadding, cRect.height - winH - clampPadding);
      nx = Math.min(Math.max(clampPadding, nx), maxX);
      ny = Math.min(Math.max(clampPadding, ny), maxY);

      setPosition({ x: nx, y: ny });

      // snap preview when near top (y < 12px relative to container top)
      const relY = ev.clientY - cRect.top;
      const nearTop = relY < 12;
      setShowPreview(nearTop);
    };

    const onUp = (ev: MouseEvent) => {
      const cRect = containerRectRef.current;
      if (wasMaximizedRef.current && pendingRestoreRef.current) {
        // clicked header of maximized without significant move -> stay maximized
        pendingRestoreRef.current = false;
        setIsDragging(false);
        setShowPreview(false);
        dragStartRef.current = null;
        return;
      }
      // if preview visible and not wasMaximized, maximize
      if (showPreview && cRect) {
        const relY = ev.clientY - cRect.top;
        if (relY < 12) {
          // save position before maximizing
          prevPosRef.current = { ...position };
          setMaximized(true);
        }
      }
      setIsDragging(false);
      setShowPreview(false);
      dragStartRef.current = null;
      pendingRestoreRef.current = false;
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isDragging, showPreview, position, windowRef, clampPadding]);

  const windowStyle: React.CSSProperties = maximized
    ? {
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        left: 0,
        top: 0,
      }
    : {
        position: "absolute",
        left: position.x,
        top: position.y,
      };

  return { position, maximized, setMaximized, toggleMaximized, isDragging, showPreview, windowRef, onMouseDown, windowStyle };
}
