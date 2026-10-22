export const THEME_STORAGE_KEY = "zuryo-theme";

export type ThemeChoice = "light" | "dark" | "system";

/** Unknown or missing values mean "follow the operating system". */
export function parseThemeChoice(value: string | null): ThemeChoice {
  return value === "light" || value === "dark" ? value : "system";
}

export function resolveDark(choice: ThemeChoice, systemPrefersDark: boolean): boolean {
  return choice === "dark" || (choice === "system" && systemPrefersDark);
}

/** Runs before paint so a stored theme never flashes the wrong background. */
export function themeBootstrapScript(): string {
  return `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");var s=window.matchMedia("(prefers-color-scheme: dark)").matches;var d=t==="dark"||(t!=="light"&&s);document.documentElement.classList.toggle("dark",d);document.documentElement.style.colorScheme=d?"dark":"light";var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",d?"#101814":"#f6f4ef")}catch(e){}})();`;
}
