import {
  BUILT_IN_THEMES,
  T3_CODE_THEME,
  getBuiltInTheme,
  getThemeColorsForAppearance,
  THEME_COLOR_ROLES,
  type ThemeAppearance,
  type ThemeColorRole,
  type ThemeColors,
  type ThemeDefinition,
} from "@t3tools/shared/themePalettes";

export { BUILT_IN_THEMES, THEME_COLOR_ROLES, T3_CODE_THEME };
export type { ThemeAppearance, ThemeColorRole, ThemeColors, ThemeDefinition };

export const THEME_APPEARANCE_MODE_STORAGE_KEY = "t3code:theme-appearance-mode";
export const THEME_PALETTE_STORAGE_KEY = "t3code:theme-palette";
export const DEFAULT_THEME_ID = "t3-code";

const THEME_VARIABLES: Readonly<Record<ThemeColorRole, string>> = {
  canvas: "--app-theme-canvas",
  text: "--app-theme-text",
  muted: "--app-theme-muted",
  mutedForeground: "--app-theme-muted-foreground",
  surface: "--app-theme-surface",
  surfaceRaised: "--app-theme-surface-raised",
  border: "--app-theme-border",
  input: "--app-theme-input",
  accent: "--app-theme-accent",
  accentForeground: "--app-theme-accent-foreground",
  secondary: "--app-theme-secondary",
  secondaryForeground: "--app-theme-secondary-foreground",
  sidebar: "--app-theme-sidebar",
  sidebarForeground: "--app-theme-sidebar-foreground",
  codeBackground: "--app-theme-code-background",
  codeForeground: "--app-theme-code-foreground",
};

export function getThemeColorVariable(role: ThemeColorRole): string {
  return THEME_VARIABLES[role];
}

export function getThemeDefinition(themeId: string): ThemeDefinition | null {
  return getBuiltInTheme(themeId);
}

export function readThemePalettePreference(): string {
  if (typeof window === "undefined") return DEFAULT_THEME_ID;
  try {
    return window.localStorage.getItem(THEME_PALETTE_STORAGE_KEY) ?? DEFAULT_THEME_ID;
  } catch {
    return DEFAULT_THEME_ID;
  }
}

export function writeThemePalettePreference(themeId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_PALETTE_STORAGE_KEY, themeId);
  } catch {
    // Theme selection remains functional for the current session when storage is unavailable.
  }
}

export function applyThemePalette(themeId: string, appearance: ThemeAppearance): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const theme = getThemeDefinition(themeId);
  if (!theme) {
    if (root.dataset) delete root.dataset.themeId;
    return;
  }

  const colors = getThemeColorsForAppearance(theme, appearance) ?? theme.colors;
  if (root.dataset) root.dataset.themeId = theme.id;
  if (!root.style) return;
  root.style.setProperty("--font-sans", theme.fontSans);
  root.style.setProperty("--font-mono", theme.fontMono);
  for (const [role, value] of Object.entries(colors) as Array<[ThemeColorRole, string]>) {
    root.style.setProperty(THEME_VARIABLES[role], value);
  }
}
