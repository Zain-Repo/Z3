export const BUILT_IN_THEME_IDS = ["t3-chat", "grove", "ocean", "ember", "iris"] as const;

export type BuiltInThemeId = (typeof BUILT_IN_THEME_IDS)[number];
export type ThemeAppearance = "light" | "dark";

/** Semantic color roles shared by the web surface and future native clients. */
export const THEME_COLOR_ROLES = [
  "canvas",
  "text",
  "muted",
  "mutedForeground",
  "surface",
  "surfaceRaised",
  "border",
  "input",
  "accent",
  "accentForeground",
  "secondary",
  "secondaryForeground",
  "sidebar",
  "sidebarForeground",
  "codeBackground",
  "codeForeground",
] as const;

export type ThemeColorRole = (typeof THEME_COLOR_ROLES)[number];
export type ThemeColors = Readonly<Record<ThemeColorRole, string>>;
export type ThemeVariants = Readonly<Partial<Record<ThemeAppearance, ThemeColors>>>;
export type ThemeDefinition = Readonly<{
  id: string;
  label: string;
  appearance: ThemeAppearance;
  colors: ThemeColors;
  fontSans: string;
  fontMono: string;
  variants?: ThemeVariants;
}>;

type ThemeSeed = {
  lightCanvas: string;
  lightSurface: string;
  darkCanvas: string;
  darkSurface: string;
  accent: string;
  fontSans: string;
  fontMono: string;
  lightOverrides?: Partial<ThemeColors>;
  darkOverrides?: Partial<ThemeColors>;
};

function createTheme(id: string, label: string, seed: ThemeSeed): ThemeDefinition {
  const light = {
    canvas: seed.lightCanvas,
    text: "#1f2937",
    muted: "#eef1f6",
    mutedForeground: "#536174",
    surface: seed.lightSurface,
    surfaceRaised: "#ffffff",
    border: "#d7dce5",
    input: "#c5ccd8",
    accent: seed.accent,
    accentForeground: "#ffffff",
    secondary: "#eef1f6",
    secondaryForeground: "#273244",
    sidebar: seed.lightSurface,
    sidebarForeground: "#273244",
    codeBackground: "#f2f4f8",
    codeForeground: "#273244",
    ...seed.lightOverrides,
  } satisfies ThemeColors;
  const dark = {
    canvas: seed.darkCanvas,
    text: "#f3f4f6",
    muted: "#242a34",
    mutedForeground: "#b4bdca",
    surface: seed.darkSurface,
    surfaceRaised: "#20242c",
    border: "#343b48",
    input: "#424b5b",
    accent: seed.accent,
    accentForeground: "#ffffff",
    secondary: "#242a34",
    secondaryForeground: "#e5e7eb",
    sidebar: seed.darkCanvas,
    sidebarForeground: "#f3f4f6",
    codeBackground: "#151a22",
    codeForeground: "#e5e7eb",
    ...seed.darkOverrides,
  } satisfies ThemeColors;

  return {
    id,
    label,
    appearance: "light",
    colors: light,
    fontSans: seed.fontSans,
    fontMono: seed.fontMono,
    variants: { dark },
  };
}

// Keep the persisted ID so existing installations receive the Z3 palette.
export const T3_CODE_THEME = createTheme("t3-code", "Z3 · Graphite", {
  lightCanvas: "#f7f6f3",
  lightSurface: "#ffffff",
  darkCanvas: "#191a1c",
  darkSurface: "#222326",
  accent: "#a04b2a",
  fontSans: '"DM Sans Variable", "DM Sans", "Segoe UI", sans-serif',
  fontMono: '"JetBrains Mono", "SF Mono", Consolas, monospace',
  lightOverrides: {
    text: "#262729",
    muted: "#eeede9",
    mutedForeground: "#646569",
    border: "#deddd8",
    input: "#cccac4",
    secondary: "#eeede9",
    secondaryForeground: "#37383b",
    sidebar: "#efeee9",
    sidebarForeground: "#37383b",
    codeBackground: "#f0efeb",
    codeForeground: "#37383b",
  },
  darkOverrides: {
    text: "#eeece8",
    muted: "#2a2b2e",
    mutedForeground: "#a6a7ac",
    surfaceRaised: "#2d2e32",
    border: "#3b3c40",
    input: "#505157",
    accent: "#e7aa83",
    accentForeground: "#251b16",
    secondary: "#2d2e32",
    secondaryForeground: "#eeece8",
    sidebar: "#202123",
    sidebarForeground: "#eeece8",
    codeBackground: "#1c1d1f",
    codeForeground: "#e0ded9",
  },
});
export const T3_CHAT_THEME = createTheme("t3-chat", "Rose", {
  lightCanvas: "#fff8fc",
  lightSurface: "#fff0f8",
  darkCanvas: "#171019",
  darkSurface: "#241827",
  accent: "#a92b7c",
  fontSans: '"Nunito Sans", "DM Sans Variable", sans-serif',
  fontMono: '"JetBrains Mono", "SF Mono", Consolas, monospace',
});
export const GROVE_THEME = createTheme("grove", "Grove", {
  lightCanvas: "#f7fbf5",
  lightSurface: "#eaf4e8",
  darkCanvas: "#101914",
  darkSurface: "#1b2a20",
  accent: "#246b3c",
  fontSans: '"Aptos", "Segoe UI", sans-serif',
  fontMono: '"Cascadia Mono", "JetBrains Mono", Consolas, monospace',
});
export const OCEAN_THEME = createTheme("ocean", "Ocean", {
  lightCanvas: "#f5fbff",
  lightSurface: "#e5f2fa",
  darkCanvas: "#0d1721",
  darkSurface: "#162938",
  accent: "#14638f",
  fontSans: '"IBM Plex Sans", "Segoe UI", sans-serif',
  fontMono: '"IBM Plex Mono", "JetBrains Mono", Consolas, monospace',
});
export const EMBER_THEME = createTheme("ember", "Ember", {
  lightCanvas: "#fffaf5",
  lightSurface: "#fff0df",
  darkCanvas: "#1c1511",
  darkSurface: "#302019",
  accent: "#a84717",
  fontSans: '"Source Sans 3", "Segoe UI", sans-serif',
  fontMono: '"Source Code Pro", "JetBrains Mono", Consolas, monospace',
});
export const IRIS_THEME = createTheme("iris", "Iris", {
  lightCanvas: "#faf8ff",
  lightSurface: "#f0ebff",
  darkCanvas: "#161321",
  darkSurface: "#252039",
  accent: "#6540b4",
  fontSans: '"Plus Jakarta Sans", "DM Sans Variable", sans-serif',
  fontMono: '"JetBrains Mono", "SF Mono", Consolas, monospace',
});

export const BUILT_IN_THEMES: ReadonlyArray<ThemeDefinition> = [
  T3_CHAT_THEME,
  GROVE_THEME,
  OCEAN_THEME,
  EMBER_THEME,
  IRIS_THEME,
];

export function getBuiltInTheme(id: string): ThemeDefinition | null {
  return [T3_CODE_THEME, ...BUILT_IN_THEMES].find((theme) => theme.id === id) ?? null;
}

export function getThemeColorsForAppearance(
  theme: ThemeDefinition,
  appearance: ThemeAppearance,
): ThemeColors | null {
  if (theme.appearance === appearance) return theme.colors;
  return theme.variants?.[appearance] ?? null;
}
