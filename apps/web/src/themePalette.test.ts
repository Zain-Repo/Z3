import { describe, expect, it } from "vite-plus/test";
import { DEFAULT_THEME_ID, getThemeDefinition, T3_CODE_THEME } from "./themePalette";

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => {
    const channel = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}

function contrast(foreground: string, background: string): number {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

describe("Z3 default palette", () => {
  it("preserves the existing saved palette identifier", () => {
    expect(DEFAULT_THEME_ID).toBe("t3-code");
    expect(getThemeDefinition("t3-code")).toBe(T3_CODE_THEME);
  });

  for (const [appearance, colors] of Object.entries({
    light: T3_CODE_THEME.colors,
    dark: T3_CODE_THEME.variants!.dark!,
  })) {
    it(`keeps text and actions readable in ${appearance} mode`, () => {
      for (const background of [colors.canvas, colors.surface, colors.sidebar]) {
        expect(contrast(colors.text, background)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(colors.mutedForeground, background)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(colors.accent, background)).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrast(colors.accentForeground, colors.accent)).toBeGreaterThanOrEqual(4.5);
    });
  }
});
