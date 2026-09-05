import { useEffect } from "react";
import { useSettingsStore } from "../stores/settingsStore";

/**
 * Applies settings.appearance.theme to <html data-theme="..."> so the CSS
 * tokens in styles/tokens/colors.css (and --color-wallpaper) actually react
 * to the Settings > Appearance > Theme control. Previously this setting was
 * only stored in state and never applied anywhere (§ visual bug fix).
 */
export function useAppliedTheme(): void {
  const theme = useSettingsStore((s) => s.settings.appearance.theme);

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
}
