import React, { useState, useEffect } from 'react';
import {
  Settings,
  X,
  FileCode,
  Terminal,
  Cpu,
  Palette,
  Sparkles,
  RotateCcw,
  Check,
  FolderCode,
  Sliders,
  Keyboard,
  Download,
  Globe,
  Trash2,
  Loader2,
} from 'lucide-react';
import { useTheme, THEME_LIST, type ThemeName } from '../theme/ThemeManager';
import { DEFAULT_TEMPLATES } from '../../hooks/useCompanion';
import {
  DEFAULT_SHORTCUTS,
  SHORTCUT_DEFINITIONS,
  type ShortcutMap,
  type ShortcutAction,
  eventToShortcutString,
} from '../../utils/shortcuts';

export interface DownloadedFont {
  family: string;
  slug: string;
  url: string;
  css_content: string;
}

export function injectFontFaceCss(slug: string, cssContent: string) {
  if (typeof document === 'undefined') return;
  const id = `hoshicp-font-${slug}`;
  let el = document.getElementById(id) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = id;
    document.head.appendChild(el);
  }
  el.textContent = cssContent;
}

export interface AppSettings {
  pathTemplate: string;
  defaultLanguage: string;
  templates: Record<string, string>;
  compilerCommands: Record<string, string>;
  defaultTimeLimit: number;
  defaultMemoryLimit: number;
  tabSize: number;
  indentWithSpaces: boolean;
  completionKey: 'tab' | 'enter' | 'both';
  fontSize: number;
  fontFamily: string;
  shortcuts: ShortcutMap;
  lspPaths: {
    cpp: string;
    rust: string;
    python: string;
  };
  lspEnabled: boolean;
  lspDiagnostics: boolean;
  formatters: {
    cpp: string;
    rust: string;
    python: string;
  };
  formatOnSave: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  pathTemplate: '{group}/{name}.{ext}',
  defaultLanguage: 'cpp',
  templates: DEFAULT_TEMPLATES,
  compilerCommands: {
    cpp: 'g++ -O3 {source} -o {output}',
    rust: 'rustc -O {source} -o {output}',
    python: 'python {source}',
    java: 'javac {source}',
  },
  defaultTimeLimit: 2000,
  defaultMemoryLimit: 256,
  tabSize: 4,
  indentWithSpaces: true,
  completionKey: 'tab',
  fontSize: 14,
  fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
  shortcuts: DEFAULT_SHORTCUTS,
  lspPaths: {
    cpp: 'clangd',
    rust: 'rust-analyzer',
    python: 'pyright-langserver',
  },
  lspEnabled: true,
  lspDiagnostics: true,
  formatters: {
    cpp: 'clang-format',
    rust: 'rustfmt',
    python: 'black -',
  },
  formatOnSave: true,
};

const STORAGE_KEY_SETTINGS = 'hoshicp:settings';

const getStorage = () => {
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  if (typeof globalThis !== 'undefined' && (globalThis as any).localStorage)
    return (globalThis as any).localStorage;
  return null;
};

export function loadStoredSettings(): AppSettings {
  const storage = getStorage();
  if (!storage) return DEFAULT_SETTINGS;
  try {
    const raw = storage.getItem(STORAGE_KEY_SETTINGS);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      tabSize: typeof parsed.tabSize === 'number' ? parsed.tabSize : DEFAULT_SETTINGS.tabSize,
      indentWithSpaces:
        typeof parsed.indentWithSpaces === 'boolean'
          ? parsed.indentWithSpaces
          : DEFAULT_SETTINGS.indentWithSpaces,
      completionKey: parsed.completionKey || DEFAULT_SETTINGS.completionKey,
      fontSize: typeof parsed.fontSize === 'number' ? parsed.fontSize : DEFAULT_SETTINGS.fontSize,
      fontFamily: parsed.fontFamily || DEFAULT_SETTINGS.fontFamily,
      shortcuts: { ...DEFAULT_SHORTCUTS, ...(parsed.shortcuts || {}) },
      templates: { ...DEFAULT_SETTINGS.templates, ...(parsed.templates || {}) },
      compilerCommands: {
        ...DEFAULT_SETTINGS.compilerCommands,
        ...(parsed.compilerCommands || {}),
      },
      lspPaths: { ...DEFAULT_SETTINGS.lspPaths, ...(parsed.lspPaths || {}) },
      formatters: { ...DEFAULT_SETTINGS.formatters, ...(parsed.formatters || {}) },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveStoredSettings(settings: AppSettings): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
  } catch {}
}

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: (settings: AppSettings) => void;
}

type TabType = 'general' | 'editor' | 'compilers' | 'lsp' | 'formatter' | 'theming' | 'hotkeys';

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onSave,
}) => {
  const {
    theme,
    setTheme,
    transparent,
    setTransparent,
    surfaceOpacity,
    setSurfaceOpacity,
    liquidGlass,
    setLiquidGlass,
    bgImage,
    setBgImage,
    bgBlur,
    setBgBlur,
    bgOpacity,
    setBgOpacity,
    showMascot,
    setShowMascot,
  } = useTheme();

  const [activeTab, setActiveTab] = useState<TabType>('general');
  const [settings, setSettings] = useState<AppSettings>(() => loadStoredSettings());
  const [activeTemplateLang, setActiveTemplateLang] = useState<string>('cpp');
  const [savedBadge, setSavedBadge] = useState<boolean>(false);
  const [recordingAction, setRecordingAction] = useState<ShortcutAction | null>(null);
  const [downloadedFonts, setDownloadedFonts] = useState<DownloadedFont[]>([]);
  const [googleFontInput, setGoogleFontInput] = useState<string>('');
  const [isDownloadingFont, setIsDownloadingFont] = useState<boolean>(false);
  const [fontMessage, setFontMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  const fetchDownloadedFonts = async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const list = await invoke<DownloadedFont[]>('get_downloaded_google_fonts');
      if (list && Array.isArray(list)) {
        setDownloadedFonts(list);
        list.forEach((f) => injectFontFaceCss(f.slug, f.css_content));
      }
    } catch {}
  };

  useEffect(() => {
    fetchDownloadedFonts();
  }, [isOpen]);

  const handleDownloadFont = async () => {
    const input = googleFontInput.trim();
    if (!input) return;

    setIsDownloadingFont(true);
    setFontMessage(null);

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const res = await invoke<any>('download_google_font', { fontInput: input });
      if (res && res.css_content) {
        injectFontFaceCss(res.slug, res.css_content);
        await fetchDownloadedFonts();
        const appliedFamily = `'${res.family}', monospace`;
        setSettings((prev) => ({ ...prev, fontFamily: appliedFamily }));
        setFontMessage({
          type: 'success',
          text: res.cached
            ? `Font '${res.family}' was already downloaded. Applied successfully!`
            : `Downloaded and applied '${res.family}' from Google Fonts!`,
        });
        setGoogleFontInput('');
      }
    } catch (err: any) {
      setFontMessage({
        type: 'error',
        text: err?.message || String(err) || 'Failed to download font from Google Fonts',
      });
    } finally {
      setIsDownloadingFont(false);
    }
  };

  const handleDeleteFont = async (slug: string, family: string) => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('delete_downloaded_google_font', { slug });
      await fetchDownloadedFonts();
      if (settings.fontFamily.includes(family)) {
        setSettings((prev) => ({
          ...prev,
          fontFamily: "'JetBrains Mono', monospace",
        }));
      }
      setFontMessage({
        type: 'success',
        text: `Removed font '${family}'`,
      });
    } catch {}
  };

  useEffect(() => {
    if (!recordingAction) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        setRecordingAction(null);
        return;
      }

      const str = eventToShortcutString(e);
      if (str) {
        setSettings((prev) => ({
          ...prev,
          shortcuts: {
            ...prev.shortcuts,
            [recordingAction]: str,
          },
        }));
        setRecordingAction(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [recordingAction]);

  useEffect(() => {
    if (isOpen) {
      setSettings(loadStoredSettings());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    saveStoredSettings(settings);
    if (onSave) onSave(settings);
    setSavedBadge(true);
    setTimeout(() => {
      setSavedBadge(false);
      onClose();
    }, 400);
  };

  const handleResetDefaults = () => {
    setSettings(DEFAULT_SETTINGS);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-3xl flex-col rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] shadow-2xl backdrop-blur-md overflow-hidden text-[var(--theme-text)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--theme-border)] px-5 py-3.5 bg-black/20">
          <div className="flex items-center space-x-2">
            <Settings className="h-5 w-5 text-[var(--theme-accent)]" />
            <h2 className="text-base font-semibold tracking-tight">Preferences & Settings</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--theme-text-muted)] hover:bg-white/10 hover:text-[var(--theme-text)] transition-colors"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Content with Sidebar Tabs */}
        <div className="flex flex-1 overflow-hidden min-h-[420px]">
          {/* Tabs Sidebar */}
          <div className="w-48 shrink-0 border-r border-[var(--theme-border)] bg-black/15 p-2 space-y-1">
            <button
              type="button"
              onClick={() => setActiveTab('general')}
              className={`flex w-full items-center space-x-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                activeTab === 'general'
                  ? 'bg-[var(--theme-tab-active)] text-[var(--theme-accent)]'
                  : 'text-[var(--theme-text-muted)] hover:bg-white/5 hover:text-[var(--theme-text)]'
              }`}
            >
              <FileCode className="h-4 w-4" />
              <span>General & Templates</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('editor')}
              className={`flex w-full items-center space-x-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                activeTab === 'editor'
                  ? 'bg-[var(--theme-tab-active)] text-[var(--theme-accent)]'
                  : 'text-[var(--theme-text-muted)] hover:bg-white/5 hover:text-[var(--theme-text)]'
              }`}
            >
              <Sliders className="h-4 w-4" />
              <span>Editor & Indentation</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('compilers')}
              className={`flex w-full items-center space-x-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                activeTab === 'compilers'
                  ? 'bg-[var(--theme-tab-active)] text-[var(--theme-accent)]'
                  : 'text-[var(--theme-text-muted)] hover:bg-white/5 hover:text-[var(--theme-text)]'
              }`}
            >
              <Terminal className="h-4 w-4" />
              <span>Compilers & Runners</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('lsp')}
              className={`flex w-full items-center space-x-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                activeTab === 'lsp'
                  ? 'bg-[var(--theme-tab-active)] text-[var(--theme-accent)]'
                  : 'text-[var(--theme-text-muted)] hover:bg-white/5 hover:text-[var(--theme-text)]'
              }`}
            >
              <Cpu className="h-4 w-4" />
              <span>LSP & Autocomplete</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('formatter')}
              className={`flex w-full items-center space-x-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                activeTab === 'formatter'
                  ? 'bg-[var(--theme-tab-active)] text-[var(--theme-accent)]'
                  : 'text-[var(--theme-text-muted)] hover:bg-white/5 hover:text-[var(--theme-text)]'
              }`}
            >
              <FolderCode className="h-4 w-4" />
              <span>Code Formatter</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('theming')}
              className={`flex w-full items-center space-x-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                activeTab === 'theming'
                  ? 'bg-[var(--theme-tab-active)] text-[var(--theme-accent)]'
                  : 'text-[var(--theme-text-muted)] hover:bg-white/5 hover:text-[var(--theme-text)]'
              }`}
            >
              <Palette className="h-4 w-4" />
              <span>Theming & Mica</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('hotkeys')}
              className={`flex w-full items-center space-x-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                activeTab === 'hotkeys'
                  ? 'bg-[var(--theme-tab-active)] text-[var(--theme-accent)]'
                  : 'text-[var(--theme-text-muted)] hover:bg-white/5 hover:text-[var(--theme-text)]'
              }`}
            >
              <Keyboard className="h-4 w-4" />
              <span>Keyboard Shortcuts</span>
            </button>
          </div>

          {/* Tab Panel Content */}
          <div className="flex-1 overflow-y-auto p-5 text-xs space-y-4">
            {/* General & Templates Tab */}
            {activeTab === 'general' && (
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block font-medium text-[var(--theme-text-muted)]">
                    Competitive Companion Ingestion Path Template
                  </label>
                  <input
                    type="text"
                    value={settings.pathTemplate}
                    onChange={(e) =>
                      setSettings({ ...settings, pathTemplate: e.target.value })
                    }
                    placeholder="{group}/{name}.{ext}"
                    className="w-full rounded-lg border border-[var(--theme-border)] bg-black/20 px-3 py-2 font-mono text-[var(--theme-text)] focus:border-[var(--theme-accent)] focus:outline-none"
                  />
                  <span className="text-[11px] text-[var(--theme-text-muted)] mt-1 block">
                    Supported tokens: <code>{'{group}'}</code>, <code>{'{name}'}</code>, <code>{'{ext}'}</code>
                  </span>
                </div>

                <div>
                  <label className="mb-1 block font-medium text-[var(--theme-text-muted)]">
                    Default Programming Language
                  </label>
                  <select
                    value={settings.defaultLanguage}
                    onChange={(e) =>
                      setSettings({ ...settings, defaultLanguage: e.target.value })
                    }
                    className="w-full rounded-lg border border-[var(--theme-border)] bg-black/20 px-3 py-2 font-medium text-[var(--theme-text)] focus:border-[var(--theme-accent)] focus:outline-none"
                  >
                    <option value="cpp">C++ (cpp)</option>
                    <option value="rust">Rust (rs)</option>
                    <option value="python">Python (py)</option>
                    <option value="java">Java (java)</option>
                  </select>
                </div>

                <div className="pt-2">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="font-medium text-[var(--theme-text-muted)]">
                      Language Template Code
                    </label>
                    <div className="flex items-center space-x-1">
                      {['cpp', 'rust', 'python', 'java'].map((lang) => (
                        <button
                          key={lang}
                          type="button"
                          onClick={() => setActiveTemplateLang(lang)}
                          className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                            activeTemplateLang === lang
                              ? 'bg-[var(--theme-tab-active)] text-[var(--theme-accent)]'
                              : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text)]'
                          }`}
                        >
                          {lang.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>

                  <textarea
                    rows={8}
                    value={settings.templates[activeTemplateLang] || ''}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        templates: {
                          ...settings.templates,
                          [activeTemplateLang]: e.target.value,
                        },
                      })
                    }
                    className="w-full rounded-lg border border-[var(--theme-border)] bg-black/30 p-3 font-mono text-[11px] text-slate-200 focus:border-[var(--theme-accent)] focus:outline-none leading-relaxed"
                  />
                  <span className="text-[11px] text-[var(--theme-text-muted)] mt-1 block">
                    Supports <code>{'${PROBLEM_NAME}'}</code> and <code>{'${DATE}'}</code> substitution.
                  </span>
                </div>
              </div>
            )}

            {/* Editor & Indentation Tab */}
            {activeTab === 'editor' && (
              <div className="space-y-4">
                {/* Font Size & Family */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block font-medium text-[var(--theme-text-muted)]">
                      Font Size ({settings.fontSize || 14}px)
                    </label>
                    <input
                      type="range"
                      min={11}
                      max={26}
                      step={1}
                      value={settings.fontSize || 14}
                      onChange={(e) =>
                        setSettings({ ...settings, fontSize: Number(e.target.value) })
                      }
                      className="w-full accent-[var(--theme-accent)]"
                    />
                    <div className="flex justify-between text-[10px] text-[var(--theme-text-muted)] font-mono mt-0.5">
                      <span>11px</span>
                      <span>14px</span>
                      <span>18px</span>
                      <span>26px</span>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 flex items-center justify-between font-medium text-[var(--theme-text-muted)]">
                      <span>Active Font Family</span>
                      <span className="text-[10px] text-[var(--theme-accent)]">
                        {downloadedFonts.length > 0
                          ? `${downloadedFonts.length} Google font(s) downloaded`
                          : 'JetBrains Mono built-in'}
                      </span>
                    </label>

                    <div className="space-y-1.5">
                      <select
                        value={settings.fontFamily}
                        onChange={(e) =>
                          setSettings({ ...settings, fontFamily: e.target.value })
                        }
                        className="w-full rounded-lg border border-[var(--theme-border)] bg-black/20 px-3 py-1.5 font-medium text-[var(--theme-text)] focus:border-[var(--theme-accent)] focus:outline-none text-xs"
                      >
                        <optgroup label="Default Built-in Offline Font">
                          <option value="'JetBrains Mono', monospace">JetBrains Mono (Bundled)</option>
                        </optgroup>

                        {downloadedFonts.length > 0 && (
                          <optgroup label="Downloaded Google Fonts">
                            {downloadedFonts.map((f) => (
                              <option key={f.slug} value={`'${f.family}', monospace`}>
                                {f.family}
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Google Fonts Downloader Card */}
                <div className="rounded-xl border border-[var(--theme-border)] bg-black/25 p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Globe className="h-4 w-4 text-[var(--theme-accent)]" />
                      <span className="font-semibold text-xs text-[var(--theme-text)]">
                        Download Google Font
                      </span>
                    </div>
                    <span className="text-[10px] text-[var(--theme-text-muted)]">
                      Saved to app data directory
                    </span>
                  </div>

                  <p className="text-[11px] text-[var(--theme-text-muted)] leading-relaxed">
                    Paste a Google Fonts URL (e.g.{' '}
                    <code className="text-pink-300">https://fonts.google.com/specimen/Fira+Code</code>) or enter a font family name. If not already downloaded, HoshiCP will fetch the font files and store them locally for offline reuse.
                  </p>

                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={googleFontInput}
                      onChange={(e) => setGoogleFontInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleDownloadFont();
                        }
                      }}
                      placeholder="e.g. Fira Code, Inconsolata, Roboto Mono, or Google Fonts URL..."
                      className="flex-1 rounded-lg border border-[var(--theme-border)] bg-black/30 px-3 py-1.5 font-mono text-xs text-[var(--theme-text)] focus:border-[var(--theme-accent)] focus:outline-none placeholder-slate-500"
                    />
                    <button
                      type="button"
                      disabled={isDownloadingFont || !googleFontInput.trim()}
                      onClick={handleDownloadFont}
                      className="flex items-center space-x-1.5 rounded-lg bg-[var(--theme-accent)] px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:brightness-110 disabled:opacity-50 transition-all shrink-0"
                    >
                      {isDownloadingFont ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>Downloading...</span>
                        </>
                      ) : (
                        <>
                          <Download className="h-3.5 w-3.5" />
                          <span>Download &amp; Apply</span>
                        </>
                      )}
                    </button>
                  </div>

                  {fontMessage && (
                    <div
                      className={`rounded-lg px-3 py-2 text-xs font-medium border ${
                        fontMessage.type === 'success'
                          ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
                          : 'border-rose-500/30 bg-rose-500/15 text-rose-300'
                      }`}
                    >
                      {fontMessage.text}
                    </div>
                  )}

                  {/* List of currently cached fonts */}
                  {downloadedFonts.length > 0 && (
                    <div className="pt-1 space-y-1.5 border-t border-[var(--theme-border)]/50">
                      <div className="text-[10px] uppercase font-bold text-[var(--theme-text-muted)] tracking-wider">
                        Installed Google Fonts Cache ({downloadedFonts.length})
                      </div>
                      <div className="space-y-1">
                        {downloadedFonts.map((f) => {
                          const isActive = settings.fontFamily.includes(f.family);
                          return (
                            <div
                              key={f.slug}
                              className="flex items-center justify-between rounded-lg border border-[var(--theme-border)] bg-black/20 px-2.5 py-1.5 text-xs"
                            >
                              <div className="flex items-center space-x-2">
                                <span className="font-medium text-[var(--theme-text)]">{f.family}</span>
                                {isActive && (
                                  <span className="rounded bg-emerald-500/20 px-1.5 py-0.2 text-[10px] font-medium text-emerald-300 border border-emerald-500/30">
                                    Active
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center space-x-1">
                                {!isActive && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setSettings((prev) => ({
                                        ...prev,
                                        fontFamily: `'${f.family}', monospace`,
                                      }))
                                    }
                                    className="rounded px-2 py-0.5 text-[11px] text-[var(--theme-accent)] hover:bg-white/10"
                                  >
                                    Apply
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleDeleteFont(f.slug, f.family)}
                                  className="rounded p-1 text-[var(--theme-text-muted)] hover:text-rose-400"
                                  title="Delete cached font"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="mb-1 block font-medium text-[var(--theme-text-muted)]">
                    Default Tab Size (Number of spaces)
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[2, 4, 8].map((size) => (
                      <button
                        key={size}
                        type="button"
                        onClick={() => setSettings({ ...settings, tabSize: size })}
                        className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                          settings.tabSize === size
                            ? 'border-[var(--theme-accent)] bg-[var(--theme-tab-active)] text-[var(--theme-accent)]'
                            : 'border-[var(--theme-border)] text-[var(--theme-text-muted)] hover:bg-white/5'
                        }`}
                      >
                        {size} spaces
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-1 block font-medium text-[var(--theme-text-muted)]">
                    Indentation Mode
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSettings({ ...settings, indentWithSpaces: true })}
                      className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                        settings.indentWithSpaces
                          ? 'border-[var(--theme-accent)] bg-[var(--theme-tab-active)] text-[var(--theme-accent)]'
                          : 'border-[var(--theme-border)] text-[var(--theme-text-muted)] hover:bg-white/5'
                      }`}
                    >
                      Spaces (Recommended)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSettings({ ...settings, indentWithSpaces: false })}
                      className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                        !settings.indentWithSpaces
                          ? 'border-[var(--theme-accent)] bg-[var(--theme-tab-active)] text-[var(--theme-accent)]'
                          : 'border-[var(--theme-border)] text-[var(--theme-text-muted)] hover:bg-white/5'
                      }`}
                    >
                      Tab Characters (\t)
                    </button>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block font-medium text-[var(--theme-text-muted)]">
                    Autocomplete Suggestion Accept Key
                  </label>
                  <select
                    value={settings.completionKey}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        completionKey: e.target.value as 'tab' | 'enter' | 'both',
                      })
                    }
                    className="w-full rounded-lg border border-[var(--theme-border)] bg-black/20 px-3 py-2 font-medium text-[var(--theme-text)] focus:border-[var(--theme-accent)] focus:outline-none"
                  >
                    <option value="tab">Tab key only</option>
                    <option value="enter">Enter key only</option>
                    <option value="both">Both Tab and Enter keys</option>
                  </select>
                  <span className="text-[11px] text-[var(--theme-text-muted)] mt-1 block">
                    Choose which key confirms and inserts autocomplete suggestions into code.
                  </span>
                </div>
              </div>
            )}

            {/* Compilers & Runners Tab */}
            {activeTab === 'compilers' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block font-medium text-[var(--theme-text-muted)]">
                      Default Execution Time Limit (ms)
                    </label>
                    <input
                      type="number"
                      min={50}
                      max={60000}
                      value={settings.defaultTimeLimit}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          defaultTimeLimit: Math.max(50, parseInt(e.target.value) || 2000),
                        })
                      }
                      className="w-full rounded-lg border border-[var(--theme-border)] bg-black/20 px-3 py-2 font-mono text-[var(--theme-text)] focus:border-[var(--theme-accent)] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-medium text-[var(--theme-text-muted)]">
                      Default Memory Limit (MB)
                    </label>
                    <input
                      type="number"
                      min={16}
                      max={4096}
                      value={settings.defaultMemoryLimit}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          defaultMemoryLimit: Math.max(16, parseInt(e.target.value) || 256),
                        })
                      }
                      className="w-full rounded-lg border border-[var(--theme-border)] bg-black/20 px-3 py-2 font-mono text-[var(--theme-text)] focus:border-[var(--theme-accent)] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <div className="font-medium text-[var(--theme-text-muted)]">
                    Compilation & Runner Commands
                  </div>

                  <div>
                    <label className="text-[11px] text-[var(--theme-text-muted)]">
                      C++ Compile Command
                    </label>
                    <input
                      type="text"
                      value={settings.compilerCommands.cpp || ''}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          compilerCommands: {
                            ...settings.compilerCommands,
                            cpp: e.target.value,
                          },
                        })
                      }
                      className="w-full rounded-lg border border-[var(--theme-border)] bg-black/20 px-3 py-1.5 font-mono text-xs text-[var(--theme-text)] focus:border-[var(--theme-accent)] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-[var(--theme-text-muted)]">
                      Rust Compile Command
                    </label>
                    <input
                      type="text"
                      value={settings.compilerCommands.rust || ''}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          compilerCommands: {
                            ...settings.compilerCommands,
                            rust: e.target.value,
                          },
                        })
                      }
                      className="w-full rounded-lg border border-[var(--theme-border)] bg-black/20 px-3 py-1.5 font-mono text-xs text-[var(--theme-text)] focus:border-[var(--theme-accent)] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-[var(--theme-text-muted)]">
                      Python Command
                    </label>
                    <input
                      type="text"
                      value={settings.compilerCommands.python || ''}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          compilerCommands: {
                            ...settings.compilerCommands,
                            python: e.target.value,
                          },
                        })
                      }
                      className="w-full rounded-lg border border-[var(--theme-border)] bg-black/20 px-3 py-1.5 font-mono text-xs text-[var(--theme-text)] focus:border-[var(--theme-accent)] focus:outline-none"
                    />
                  </div>

                  <span className="text-[11px] text-[var(--theme-text-muted)] block">
                    Use <code>{'{source}'}</code> and <code>{'{output}'}</code> placeholders in commands.
                  </span>
                </div>
              </div>
            )}

            {/* LSP & Autocomplete Tab */}
            {activeTab === 'lsp' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.lspEnabled}
                      onChange={(e) =>
                        setSettings({ ...settings, lspEnabled: e.target.checked })
                      }
                      className="rounded border-[var(--theme-border)] accent-[var(--theme-accent)]"
                    />
                    <span className="font-medium text-[var(--theme-text)]">
                      Enable Language Server Protocol (LSP) Code Completion
                    </span>
                  </label>

                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.lspDiagnostics}
                      onChange={(e) =>
                        setSettings({ ...settings, lspDiagnostics: e.target.checked })
                      }
                      className="rounded border-[var(--theme-border)] accent-[var(--theme-accent)]"
                    />
                    <span className="font-medium text-[var(--theme-text)]">
                      Enable Live Diagnostics & Error Squiggles
                    </span>
                  </label>
                </div>

                <div className="space-y-3 pt-2">
                  <div className="font-medium text-[var(--theme-text-muted)]">
                    Language Server Executable Paths
                  </div>

                  <div>
                    <label className="text-[11px] text-[var(--theme-text-muted)]">
                      C/C++ LSP Executable (clangd)
                    </label>
                    <input
                      type="text"
                      value={settings.lspPaths.cpp || ''}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          lspPaths: { ...settings.lspPaths, cpp: e.target.value },
                        })
                      }
                      placeholder="clangd"
                      className="w-full rounded-lg border border-[var(--theme-border)] bg-black/20 px-3 py-1.5 font-mono text-xs text-[var(--theme-text)] focus:border-[var(--theme-accent)] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-[var(--theme-text-muted)]">
                      Rust LSP Executable (rust-analyzer)
                    </label>
                    <input
                      type="text"
                      value={settings.lspPaths.rust || ''}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          lspPaths: { ...settings.lspPaths, rust: e.target.value },
                        })
                      }
                      placeholder="rust-analyzer"
                      className="w-full rounded-lg border border-[var(--theme-border)] bg-black/20 px-3 py-1.5 font-mono text-xs text-[var(--theme-text)] focus:border-[var(--theme-accent)] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-[var(--theme-text-muted)]">
                      Python LSP Executable (pyright-langserver / pylsp)
                    </label>
                    <input
                      type="text"
                      value={settings.lspPaths.python || ''}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          lspPaths: { ...settings.lspPaths, python: e.target.value },
                        })
                      }
                      placeholder="pyright-langserver"
                      className="w-full rounded-lg border border-[var(--theme-border)] bg-black/20 px-3 py-1.5 font-mono text-xs text-[var(--theme-text)] focus:border-[var(--theme-accent)] focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Code Formatter Tab */}
            {activeTab === 'formatter' && (
              <div className="space-y-4">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.formatOnSave}
                    onChange={(e) =>
                      setSettings({ ...settings, formatOnSave: e.target.checked })
                    }
                    className="rounded border-[var(--theme-border)] accent-[var(--theme-accent)]"
                  />
                  <span className="font-medium text-[var(--theme-text)]">
                    Format file automatically on save
                  </span>
                </label>

                <div className="space-y-3 pt-2">
                  <div className="font-medium text-[var(--theme-text-muted)]">
                    Formatter Binaries / Commands
                  </div>

                  <div>
                    <label className="text-[11px] text-[var(--theme-text-muted)]">
                      C/C++ Formatter (e.g. clang-format)
                    </label>
                    <input
                      type="text"
                      value={settings.formatters.cpp || ''}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          formatters: { ...settings.formatters, cpp: e.target.value },
                        })
                      }
                      placeholder="clang-format"
                      className="w-full rounded-lg border border-[var(--theme-border)] bg-black/20 px-3 py-1.5 font-mono text-xs text-[var(--theme-text)] focus:border-[var(--theme-accent)] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-[var(--theme-text-muted)]">
                      Rust Formatter (e.g. rustfmt)
                    </label>
                    <input
                      type="text"
                      value={settings.formatters.rust || ''}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          formatters: { ...settings.formatters, rust: e.target.value },
                        })
                      }
                      placeholder="rustfmt"
                      className="w-full rounded-lg border border-[var(--theme-border)] bg-black/20 px-3 py-1.5 font-mono text-xs text-[var(--theme-text)] focus:border-[var(--theme-accent)] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-[var(--theme-text-muted)]">
                      Python Formatter (e.g. black - or autopep8)
                    </label>
                    <input
                      type="text"
                      value={settings.formatters.python || ''}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          formatters: { ...settings.formatters, python: e.target.value },
                        })
                      }
                      placeholder="black -"
                      className="w-full rounded-lg border border-[var(--theme-border)] bg-black/20 px-3 py-1.5 font-mono text-xs text-[var(--theme-text)] focus:border-[var(--theme-accent)] focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Theming & Appearance Tab */}
            {activeTab === 'theming' && (
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block font-medium text-[var(--theme-text-muted)]">
                    Color Theme
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {THEME_LIST.map((t) => {
                      const isCur = theme === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setTheme(t.id as ThemeName)}
                          className={`flex items-center space-x-2 rounded-lg border p-2 text-left transition-colors ${
                            isCur
                              ? 'border-[var(--theme-accent)] bg-[var(--theme-tab-active)] font-semibold text-[var(--theme-accent)]'
                              : 'border-[var(--theme-border)] hover:bg-white/5'
                          }`}
                        >
                          <span
                            className="h-3.5 w-3.5 shrink-0 rounded-full border border-white/20"
                            style={{ backgroundColor: t.previewColor }}
                          />
                          <span className="truncate">{t.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-3 pt-2 border-t border-[var(--theme-border)]">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={transparent}
                      onChange={(e) => setTransparent(e.target.checked)}
                      className="rounded border-[var(--theme-border)] accent-[var(--theme-accent)]"
                    />
                    <span className="font-medium text-[var(--theme-text)]">
                      Enable Mica / Acrylic Transparent Glass Backdrop
                    </span>
                  </label>

                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={liquidGlass}
                      onChange={(e) => setLiquidGlass(e.target.checked)}
                      className="rounded border-[var(--theme-border)] accent-[var(--theme-accent)]"
                    />
                    <div>
                      <span className="font-medium text-[var(--theme-text)]">
                        Enable Liquid Glass & Refraction Effect
                      </span>
                      <span className="text-[11px] text-[var(--theme-text-muted)] block">
                        Adds fluid specular rim highlights, subtle refraction gradient, and saturated backdrop glow.
                      </span>
                    </div>
                  </label>

                  <div>
                    <div className="flex justify-between text-[11px] mb-1 font-medium text-[var(--theme-text-muted)]">
                      <span>UI Card Surface Opacity (Độ trong suốt)</span>
                      <span className="font-mono text-[var(--theme-accent)] font-semibold">
                        {Math.round(surfaceOpacity * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.2"
                      max="1.0"
                      step="0.02"
                      value={surfaceOpacity}
                      onChange={(e) => setSurfaceOpacity(Number(e.target.value))}
                      className="w-full accent-[var(--theme-accent)]"
                    />
                    <div className="flex justify-between text-[10px] text-[var(--theme-text-muted)] font-mono mt-0.5">
                      <span>20% (Ultra Clear)</span>
                      <span>88% (Default Frosted)</span>
                      <span>100% (Solid Opaque)</span>
                    </div>
                  </div>

                  {theme === 'cute-hoshino' && (
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showMascot}
                        onChange={(e) => setShowMascot(e.target.checked)}
                        className="rounded border-[var(--theme-border)] accent-[var(--theme-accent)]"
                      />
                      <span className="font-medium text-[var(--theme-text)]">
                        Display Anime Mascot (Hoshino) Watermark
                      </span>
                    </label>
                  )}
                </div>

                <div className="space-y-3 pt-2 border-t border-[var(--theme-border)]">
                  <div>
                    <label className="mb-1 block font-medium text-[var(--theme-text-muted)]">
                      Custom Background Image URL / File Path
                    </label>
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        value={bgImage || ''}
                        onChange={(e) => setBgImage(e.target.value || null)}
                        placeholder="https://... or file:///..."
                        className="flex-1 rounded-lg border border-[var(--theme-border)] bg-black/20 px-3 py-1.5 font-mono text-xs text-[var(--theme-text)] focus:border-[var(--theme-accent)] focus:outline-none"
                      />
                      {bgImage && (
                        <button
                          type="button"
                          onClick={() => setBgImage(null)}
                          className="rounded-lg bg-rose-500/20 px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-500/30"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="flex justify-between text-[11px] mb-1 font-medium text-[var(--theme-text-muted)]">
                        <span>Background Blur</span>
                        <span>{bgBlur}px</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="40"
                        value={bgBlur}
                        onChange={(e) => setBgBlur(Number(e.target.value))}
                        className="w-full accent-[var(--theme-accent)]"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] mb-1 font-medium text-[var(--theme-text-muted)]">
                        <span>Background Opacity</span>
                        <span>{Math.round(bgOpacity * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0.05"
                        max="1"
                        step="0.05"
                        value={bgOpacity}
                        onChange={(e) => setBgOpacity(Number(e.target.value))}
                        className="w-full accent-[var(--theme-accent)]"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Keyboard Shortcuts Customization Tab */}
            {activeTab === 'hotkeys' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-sm text-[var(--theme-accent)]">
                      Keyboard Shortcut Customization
                    </div>
                    <p className="text-[11px] text-[var(--theme-text-muted)] mt-0.5">
                      Click any key badge below to rebind. Press your new key combination or Esc to cancel.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setSettings((prev) => ({
                        ...prev,
                        shortcuts: DEFAULT_SHORTCUTS,
                      }))
                    }
                    className="flex items-center space-x-1 rounded-md border border-[var(--theme-border)] px-2.5 py-1 text-[11px] text-[var(--theme-text-muted)] hover:bg-white/5 hover:text-[var(--theme-text)] transition-colors shrink-0"
                    title="Restore all default keyboard shortcuts"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>Reset Shortcuts</span>
                  </button>
                </div>

                {recordingAction && (
                  <div className="rounded-lg border border-[var(--theme-accent)] bg-[var(--theme-accent)]/15 p-3 text-xs text-[var(--theme-text)] flex items-center justify-between animate-pulse">
                    <span>
                      Recording shortcut for{' '}
                      <strong>
                        {SHORTCUT_DEFINITIONS.find((d) => d.action === recordingAction)?.label}
                      </strong>
                      ... Press any key combination.
                    </span>
                    <button
                      type="button"
                      onClick={() => setRecordingAction(null)}
                      className="text-xs text-rose-300 underline ml-2"
                    >
                      Cancel (Esc)
                    </button>
                  </div>
                )}

                <div className="rounded-lg border border-[var(--theme-border)] overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-[var(--theme-border)] bg-black/30 text-[var(--theme-text-muted)]">
                        <th className="p-2.5 font-medium">Category</th>
                        <th className="p-2.5 font-medium">Action & Description</th>
                        <th className="p-2.5 font-medium text-right">Shortcut Key</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--theme-border)]/40 text-xs">
                      {SHORTCUT_DEFINITIONS.map((def) => {
                        const currentKey = settings.shortcuts?.[def.action] || DEFAULT_SHORTCUTS[def.action];
                        const isRecording = recordingAction === def.action;
                        const isDefault = currentKey === DEFAULT_SHORTCUTS[def.action];

                        return (
                          <tr
                            key={def.action}
                            className={`transition-colors ${
                              isRecording ? 'bg-[var(--theme-tab-active)]' : 'hover:bg-white/5'
                            }`}
                          >
                            <td className="p-2.5 align-middle">
                              <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-[var(--theme-text-muted)]">
                                {def.category}
                              </span>
                            </td>
                            <td className="p-2.5 align-middle">
                              <div className="font-medium text-[var(--theme-text)]">{def.label}</div>
                              <div className="text-[11px] text-[var(--theme-text-muted)]">
                                {def.description}
                              </div>
                            </td>
                            <td className="p-2.5 text-right align-middle">
                              {isRecording ? (
                                <span className="inline-block rounded-md bg-[var(--theme-accent)] px-3 py-1 font-mono text-xs font-bold text-white shadow-sm animate-pulse">
                                  Press key...
                                </span>
                              ) : (
                                <div className="inline-flex items-center space-x-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setRecordingAction(def.action)}
                                    className="rounded-md border border-[var(--theme-border)] bg-black/40 px-2.5 py-1 font-mono text-xs font-semibold text-[var(--theme-accent)] shadow-sm hover:border-[var(--theme-accent)] hover:bg-[var(--theme-accent)]/15 transition-all"
                                    title="Click to rebind this shortcut"
                                  >
                                    {currentKey}
                                  </button>
                                  {!isDefault && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setSettings((prev) => ({
                                          ...prev,
                                          shortcuts: {
                                            ...prev.shortcuts,
                                            [def.action]: DEFAULT_SHORTCUTS[def.action],
                                          },
                                        }))
                                      }
                                      className="rounded p-1 text-[var(--theme-text-muted)] hover:text-rose-400 transition-colors"
                                      title="Reset this shortcut to default"
                                    >
                                      <RotateCcw className="h-3 w-3" />
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[var(--theme-border)] bg-black/20 px-5 py-3">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="flex items-center space-x-1.5 rounded-lg border border-[var(--theme-border)] px-3 py-1.5 text-xs font-medium text-[var(--theme-text-muted)] hover:bg-white/5 hover:text-[var(--theme-text)] transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset Defaults</span>
          </button>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-white/10 px-3.5 py-1.5 text-xs font-medium text-[var(--theme-text)] hover:bg-white/15 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex items-center space-x-1.5 rounded-lg bg-[var(--theme-accent)] px-4 py-1.5 text-xs font-semibold text-white shadow hover:brightness-110 active:scale-95 transition-all"
            >
              {savedBadge ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  <span>Saved</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
