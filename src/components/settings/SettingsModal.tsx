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
} from 'lucide-react';
import { useTheme, THEME_LIST, type ThemeName } from '../theme/ThemeManager';
import { DEFAULT_TEMPLATES } from '../../hooks/useCompanion';

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

            {/* Keyboard Shortcuts Reference Tab */}
            {activeTab === 'hotkeys' && (
              <div className="space-y-3">
                <div className="font-semibold text-sm text-[var(--theme-accent)]">
                  Available Keyboard Shortcuts
                </div>
                <div className="rounded-lg border border-[var(--theme-border)] overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-[var(--theme-border)] bg-black/30 text-[var(--theme-text-muted)]">
                        <th className="p-2.5 font-medium">Action</th>
                        <th className="p-2.5 font-medium">Shortcut</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--theme-border)]/40 font-mono text-[11px]">
                      <tr>
                        <td className="p-2 text-[var(--theme-text)]">Save Source Code</td>
                        <td className="p-2 text-[var(--theme-accent)]">Ctrl + S</td>
                      </tr>
                      <tr>
                        <td className="p-2 text-[var(--theme-text)]">Open Source Code</td>
                        <td className="p-2 text-[var(--theme-accent)]">Ctrl + O</td>
                      </tr>
                      <tr>
                        <td className="p-2 text-[var(--theme-text)]">Select Next Matching Pattern (CodeBlocks)</td>
                        <td className="p-2 text-[var(--theme-accent)]">Ctrl + E / Ctrl + D</td>
                      </tr>
                      <tr>
                        <td className="p-2 text-[var(--theme-text)]">Find in Code</td>
                        <td className="p-2 text-[var(--theme-accent)]">Ctrl + F</td>
                      </tr>
                      <tr>
                        <td className="p-2 text-[var(--theme-text)]">Replace in Code</td>
                        <td className="p-2 text-[var(--theme-accent)]">Ctrl + H</td>
                      </tr>
                      <tr>
                        <td className="p-2 text-[var(--theme-text)]">Compile &amp; Run All Testcases</td>
                        <td className="p-2 text-[var(--theme-accent)]">Ctrl + F5</td>
                      </tr>
                      <tr>
                        <td className="p-2 text-[var(--theme-text)]">Run All Testcases (No Recompile)</td>
                        <td className="p-2 text-[var(--theme-accent)]">F5</td>
                      </tr>
                      <tr>
                        <td className="p-2 text-[var(--theme-text)]">Stop Execution</td>
                        <td className="p-2 text-[var(--theme-accent)]">Shift + F5</td>
                      </tr>
                      <tr>
                        <td className="p-2 text-[var(--theme-text)]">Open Settings</td>
                        <td className="p-2 text-[var(--theme-accent)]">Ctrl + ,</td>
                      </tr>
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
