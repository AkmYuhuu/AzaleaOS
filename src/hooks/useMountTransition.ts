import { useEffect, useState } from "react";

/**
 * Generic enter/exit mount transition. Many panels in this app (Launcher,
 * Settings, Resource Center) do `if (!isOpen) return null`, which kills any
 * exit animation instantly. This hook keeps the component rendered for
 * `duration`ms after `isOpen` flips to false, so CSS can play a real closing
 * animation instead of the panel just vanishing.
 *
 * Usage:
 *   const { shouldRender, phase } = useMountTransition(isOpen, 180);
 *   if (!shouldRender) return null;
 *   <div className={phase === "enter" ? styles.enter : styles.exit}>
 */
export function useMountTransition(isOpen: boolean, duration = 180) {
  const [shouldRender, setShouldRender] = useState(isOpen);

  useEffect(() => {
    let timeoutId: number | undefined;
    if (isOpen) {
      setShouldRender(true);
    } else if (shouldRender) {
      timeoutId = window.setTimeout(() => setShouldRender(false), duration);
    }
    return () => window.clearTimeout(timeoutId);
  }, [isOpen, duration, shouldRender]);

  return { shouldRender, phase: isOpen ? ("enter" as const) : ("exit" as const) };
}
