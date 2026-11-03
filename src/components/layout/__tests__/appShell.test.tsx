import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { AppShell } from '../AppShell';
import { ThemeProvider } from '../../theme/ThemeManager';

describe('AppShell Component', () => {
  it('renders complete CP workspace layout with HeaderBar, Editor, and TestCaseList', () => {
    const html = renderToString(
      <ThemeProvider>
        <AppShell />
      </ThemeProvider>
    );

    // HeaderBar presence
    expect(html).toContain('HoshiCP');
    expect(html).toContain('A. Watermelon');
    expect(html).toContain('Compile &amp; Run');

    // TestCaseList presence
    expect(html).toContain('Test Cases');
    expect(html).toContain('Case #1');
    expect(html).toContain('Run All');

    // Terminal / Console Drawer presence
    expect(html).toContain('Terminal');
  });
});
