import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import App from '../App';

describe('App Root Component', () => {
  it('renders complete HoshiCP application shell', () => {
    const html = renderToString(<App />);

    expect(html).toContain('HoshiCP');
    expect(html).toContain('A. Watermelon');
    expect(html).toContain('Compile &amp; Run');
    expect(html).toContain('Stress Test');
    expect(html).toContain('Terminal');
  });
});
