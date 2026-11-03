import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { ThemeProvider, THEME_LIST } from '../ThemeManager';

describe('ThemeManager & ThemeProvider', () => {
  it('defines all 6 signature themes', () => {
    const ids = THEME_LIST.map((t) => t.id);
    expect(ids).toContain('cute-hoshino');
    expect(ids).toContain('classic-dark');
    expect(ids).toContain('classic-light');
    expect(ids).toContain('dracula');
    expect(ids).toContain('one-dark');
    expect(ids).toContain('catppuccin');
  });

  it('renders children within data-theme attribute container', () => {
    const html = renderToString(
      <ThemeProvider defaultTheme="cute-hoshino" defaultTransparent={true}>
        <div id="test-child">HoshiCP Content</div>
      </ThemeProvider>
    );

    expect(html).toContain('data-theme="cute-hoshino"');
    expect(html).toContain('HoshiCP Content');
    expect(html).toContain('hoshino-mascot-watermark');
  });

  it('renders classic-dark without mascot watermark', () => {
    const html = renderToString(
      <ThemeProvider defaultTheme="classic-dark" defaultTransparent={false}>
        <div id="test-child">Dark Content</div>
      </ThemeProvider>
    );

    expect(html).toContain('data-theme="classic-dark"');
    expect(html).not.toContain('hoshino-mascot-watermark');
  });
});
