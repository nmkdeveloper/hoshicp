import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { VimStatus } from '../vimStatus';

describe('VimStatus Component', () => {
  it('renders NORMAL mode badge by default', () => {
    const html = renderToString(<VimStatus mode="NORMAL" />);
    expect(html).toContain('-- NORMAL --');
    expect(html).toContain('bg-pink-500/20');
  });

  it('renders INSERT mode with sky/blue theme', () => {
    const html = renderToString(<VimStatus mode="INSERT" />);
    expect(html).toContain('-- INSERT --');
    expect(html).toContain('bg-sky-500/20');
  });

  it('renders VISUAL and submodes', () => {
    const html = renderToString(<VimStatus mode="VISUAL LINE" subMode="C-O" />);
    expect(html).toContain('-- VISUAL LINE --');
    expect(html).toContain('(C-O)');
    expect(html).toContain('bg-amber-500/20');
  });

  it('renders REPLACE mode with rose theme', () => {
    const html = renderToString(<VimStatus mode="REPLACE" />);
    expect(html).toContain('-- REPLACE --');
    expect(html).toContain('bg-rose-500/20');
  });

  it('renders key buffer sequence when provided', () => {
    const html = renderToString(<VimStatus mode="NORMAL" keyBuffer="d2w" />);
    expect(html).toContain('d2w');
    expect(html).toContain('data-testid="vim-keybuffer"');
  });

  it('returns empty string when active is false and showWhenInactive is false', () => {
    const html = renderToString(<VimStatus active={false} />);
    expect(html).toBe('');
  });

  it('renders inactive badge when showWhenInactive is true', () => {
    const html = renderToString(<VimStatus active={false} showWhenInactive={true} />);
    expect(html).toContain('VIM: OFF');
  });
});
