import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  SettingsModal,
  loadStoredSettings,
  saveStoredSettings,
  DEFAULT_SETTINGS,
} from '../SettingsModal';
import { ThemeProvider } from '../../theme/ThemeManager';

describe('SettingsModal Component and Storage', () => {
  beforeEach(() => {
    const store: Record<string, string> = {};
    const mockStorage = {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        for (const k in store) delete store[k];
      },
    };

    (globalThis as any).localStorage = mockStorage;
  });

  it('does not render when isOpen is false', () => {
    const html = renderToString(
      <ThemeProvider>
        <SettingsModal isOpen={false} onClose={() => {}} />
      </ThemeProvider>
    );
    expect(html).not.toContain('Preferences &amp; Settings');
    expect(html).not.toContain('General &amp; Templates');
  });

  it('renders settings dialog with all primary configuration tabs', () => {
    const html = renderToString(
      <ThemeProvider>
        <SettingsModal isOpen={true} onClose={() => {}} />
      </ThemeProvider>
    );

    expect(html).toContain('Preferences &amp; Settings');
    expect(html).toContain('General &amp; Templates');
    expect(html).toContain('Compilers &amp; Runners');
    expect(html).toContain('LSP &amp; Autocomplete');
    expect(html).toContain('Code Formatter');
    expect(html).toContain('Theming &amp; Mica');
    expect(html).toContain('Save Changes');
    expect(html).toContain('Reset Defaults');
  });

  it('correctly loads default settings when local storage is empty', () => {
    const settings = loadStoredSettings();
    expect(settings.pathTemplate).toBe(DEFAULT_SETTINGS.pathTemplate);
    expect(settings.defaultLanguage).toBe('cpp');
    expect(settings.lspEnabled).toBe(true);
    expect(settings.formatOnSave).toBe(true);
  });

  it('persists and retrieves modified settings to local storage', () => {
    const modified = {
      ...DEFAULT_SETTINGS,
      pathTemplate: 'contest/{group}/{name}.{ext}',
      defaultLanguage: 'rust',
      defaultTimeLimit: 3000,
    };
    saveStoredSettings(modified);

    const loaded = loadStoredSettings();
    expect(loaded.pathTemplate).toBe('contest/{group}/{name}.{ext}');
    expect(loaded.defaultLanguage).toBe('rust');
    expect(loaded.defaultTimeLimit).toBe(3000);
  });
});
