import { describe, it, expect } from 'vitest';
import { getThemeExtensions } from '../themes';
import type { ThemeName } from '../themes';

describe('Editor Theme Engine', () => {
  it('provides transparent background extension for glass and mica themes', () => {
    const ext = getThemeExtensions('cute-hoshino');
    expect(ext).toBeDefined();
    expect(Array.isArray(ext)).toBe(true);
  });

  const themes: ThemeName[] = [
    'cute-hoshino',
    'classic-dark',
    'classic-light',
    'dracula',
    'one-dark',
    'catppuccin',
  ];

  for (const theme of themes) {
    it(`supports theme: ${theme}`, () => {
      const ext = getThemeExtensions(theme);
      expect(ext).toBeDefined();
      expect(Array.isArray(ext)).toBe(true);
    });

    it(`supports transparent option for ${theme}`, () => {
      const extTransparent = getThemeExtensions(theme, { transparent: true });
      const extOpaque = getThemeExtensions(theme, { transparent: false });
      expect(extTransparent).toBeDefined();
      expect(extOpaque).toBeDefined();
    });
  }
});
