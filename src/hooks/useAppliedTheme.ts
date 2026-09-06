import { useEffect } from "react";
import { useSettingsStore } from "../stores/settingsStore";

/**
 * Applies settings.appearance.theme to <html data-theme="..."> so the CSS
 * tokens in styles/tokens/colors.css (and --color-wallpaper) actually react
 * to the Settings > Appearance > Theme control. Previously this setting was
 * only stored in state and never applied anywhere (§ visual bug fix).
 *
 * Extended: also applies accentColor, transparency and animationLevel live
 * via root CSS vars / attributes so Settings > Appearance is immediately visible.
 */

function isHexColor(v: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v);
}

function toSubtle(accent: string): string {
  if (/^#([0-9a-fA-F]{3})$/.test(accent)) {
    const r = accent[1];
    const g = accent[2];
    const b = accent[3];
    return `#${r}${r}${g}${g}${b}${b}22`;
  }
  if (/^#([0-9a-fA-F]{6})$/.test(accent)) {
    return `${accent}22`;
  }
  // non-hex (e.g. rgb, named) — use color-mix fallback (14% accent)
  return `color-mix(in srgb, ${accent} 14%, transparent)`;
}

export function useAppliedTheme(): void {
  const theme = useSettingsStore((s) => s.settings.appearance.theme);
  const accentColor = useSettingsStore((s) => s.settings.appearance.accentColor);
  const transparency = useSettingsStore((s) => s.settings.appearance.transparency);
  const animationLevel = useSettingsStore((s) => s.settings.appearance.animationLevel);

  // theme -> data-theme
  useEffect(() => {
    const root = document.documentElement;

    if (theme !== "system") {
      root.setAttribute("data-theme", theme);
      return;
    }

    // system: follow OS preference live
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => root.setAttribute("data-theme", mql.matches ? "dark" : "light");
    apply();
    mql.addEventListener("change", apply);
    return () => mql.removeEventListener("change", apply);
  }, [theme]);

  // accentColor / transparency / animationLevel -> CSS vars + data-anim
  useEffect(() => {
    const root = document.documentElement;

    // accentColor live
    if (accentColor) {
      if (isHexColor(accentColor)) {
        root.style.setProperty("--color-accent", accentColor);
        root.style.setProperty("--color-accent-hover", accentColor);
        root.style.setProperty("--color-focus-ring", accentColor);
        root.style.setProperty("--color-accent-subtle", toSubtle(accentColor));
      } else {
        // fallback for any valid CSS color string
        root.style.setProperty("--color-accent", accentColor);
        root.style.setProperty("--color-accent-hover", accentColor);
        root.style.setProperty("--color-focus-ring", accentColor);
        root.style.setProperty("--color-accent-subtle", toSubtle(accentColor));
      }
    }

    // transparency -> --az-panel-opacity (0..1) + alias --az-transparency
    const clamped = Math.min(100, Math.max(0, Number(transparency) || 0));
    const opacity = clamped / 100;
    root.style.setProperty("--az-panel-opacity", String(opacity));
    root.style.setProperty("--az-transparency", String(opacity));

    // animationLevel -> data-anim + duration overrides
    root.setAttribute("data-anim", animationLevel);
    // keep dataset in sync for any dataset.anim reads
    (root.dataset as DOMStringMap & { anim?: string }).anim = animationLevel;

    if (animationLevel === "none") {
      root.style.setProperty("--duration-fast", "0ms");
      root.style.setProperty("--duration-normal", "0ms");
      root.style.setProperty("--duration-slow", "0ms");
    } else if (animationLevel === "reduced") {
      root.style.setProperty("--duration-fast", "60ms");
      root.style.setProperty("--duration-normal", "90ms");
      root.style.setProperty("--duration-slow", "120ms");
    } else {
      // full — remove overrides to fall back to motion.css defaults
      root.style.removeProperty("--duration-fast");
      root.style.removeProperty("--duration-normal");
      root.style.removeProperty("--duration-slow");
    }
  }, [accentColor, transparency, animationLevel]);
}
