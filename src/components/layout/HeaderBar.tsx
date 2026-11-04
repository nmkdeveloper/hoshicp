import React, { useState, useRef, useEffect } from 'react';
import {
  Play,
  PlaySquare,
  Square,
  Palette,
  Settings,
  Plus,
  X,
  Minus,
  Maximize2,
  Code2,
  Check,
  Eye,
  EyeOff,
  FolderOpen,
  Save,
} from 'lucide-react';
import { useTheme, THEME_LIST, type ThemeName } from '../theme/ThemeManager';
import type { Problem } from '../../types';

export interface HeaderBarProps {
  problems: Problem[];
  activeProblemId: string;
  onSelectProblem: (id: string) => void;
  onCloseProblem: (id: string) => void;
  onNewProblem: () => void;
  isCompiling?: boolean;
  isRunning?: boolean;
  onCompileAndRun: () => void;
  onRun: () => void;
  onStop: () => void;
  onSaveCode?: () => void;
  onOpenCode?: () => void;
  onOpenSettings: () => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  problems,
  activeProblemId,
  onSelectProblem,
  onCloseProblem,
  onNewProblem,
  isCompiling = false,
  isRunning = false,
  onCompileAndRun,
  onRun,
  onStop,
  onSaveCode,
  onOpenCode,
  onOpenSettings,
}) => {
  const { theme, setTheme, transparent, setTransparent, showMascot, setShowMascot } = useTheme();
  const [themeDropdownOpen, setThemeDropdownOpen] = useState(false);
  const themeDropdownRef = useRef<HTMLDivElement | null>(null);

  // Close theme menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (themeDropdownRef.current && !themeDropdownRef.current.contains(e.target as Node)) {
        setThemeDropdownOpen(false);
      }
    };
    if (themeDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [themeDropdownOpen]);

  const handleMinimize = async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('window_minimize');
    } catch {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        await getCurrentWindow().minimize();
      } catch {}
    }
  };

  const handleMaximize = async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('window_toggle_maximize');
    } catch {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        await getCurrentWindow().toggleMaximize();
      } catch {}
    }
  };

  const handleClose = async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('window_close');
    } catch {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        await getCurrentWindow().close();
      } catch {}
    }
  };

  const handleHeaderMouseDown = async (e: React.MouseEvent<HTMLElement>) => {
    if (e.button === 0) {
      const target = e.target as HTMLElement;
      if (
        target.hasAttribute('data-tauri-drag-region') ||
        target.tagName === 'HEADER' ||
        target.classList.contains('glass-header')
      ) {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          await invoke('window_start_dragging');
        } catch {
          try {
            const { getCurrentWindow } = await import('@tauri-apps/api/window');
            await getCurrentWindow().startDragging();
          } catch {}
        }
      }
    }
  };

  const isBusy = isCompiling || isRunning;

  return (
    <header
      data-tauri-drag-region
      onMouseDown={handleHeaderMouseDown}
      className="glass-header flex h-12 w-full select-none items-center justify-between border-b border-[var(--theme-border)] px-3 text-[var(--theme-text)] z-30"
    >
      {/* Left: App Logo & Mascot Icon + Multi-tab Workspace */}
      <div className="flex items-center space-x-3 overflow-hidden">
        {/* Mascot & Brand */}
        <div className="flex items-center space-x-2 shrink-0 pr-2">
          <img
            src="/icon.png"
            alt="HoshiCP Mascot"
            className="h-7 w-7 rounded-full border border-[var(--theme-accent)] object-cover shadow-sm"
          />
          <span className="font-bold text-sm tracking-tight text-[var(--theme-accent)]">HoshiCP</span>
        </div>

        {/* Problem Tabs */}
        <div className="flex items-center space-x-1 overflow-x-auto scrollbar-none py-1">
          {problems.map((p) => {
            const isActive = p.id === activeProblemId;
            return (
              <div
                key={p.id}
                onClick={() => onSelectProblem(p.id)}
                className={`group flex items-center space-x-2 rounded-t-md px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors border-b-2 ${
                  isActive
                    ? 'border-[var(--theme-accent)] bg-[var(--theme-tab-active)] text-[var(--theme-text)]'
                    : 'border-transparent text-[var(--theme-text-muted)] hover:bg-white/5 hover:text-[var(--theme-text)]'
                }`}
                title={p.name}
              >
                <Code2 className="h-3.5 w-3.5 shrink-0 opacity-70" />
                <span className="truncate max-w-[130px]">{p.name || 'Untitled Problem'}</span>
                {problems.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseProblem(p.id);
                    }}
                    className="rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-opacity"
                    title="Close tab"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })}

          {/* New Tab Button */}
          <button
            type="button"
            onClick={onNewProblem}
            className="flex items-center rounded p-1.5 text-[var(--theme-text-muted)] hover:bg-white/10 hover:text-[var(--theme-text)] transition-colors"
            title="New Problem Tab"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Center / Right: Primary Actions & Settings & Window Controls */}
      <div className="flex items-center space-x-2 shrink-0">
        {/* Primary Action Buttons */}
        <div className="flex items-center space-x-1.5 border-r border-[var(--theme-border)] pr-2">
          {/* Compile & Run */}
          <button
            type="button"
            disabled={isBusy}
            onClick={onCompileAndRun}
            className="flex items-center space-x-1.5 rounded-lg bg-[var(--theme-accent)] px-3 py-1 text-xs font-semibold text-white shadow-sm hover:brightness-110 disabled:opacity-50 transition-all active:scale-95"
            title="Compile and Run All Testcases (Ctrl+F5)"
          >
            <PlaySquare className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{isCompiling ? 'Compiling...' : 'Compile & Run'}</span>
          </button>

          {/* Run */}
          <button
            type="button"
            disabled={isBusy}
            onClick={onRun}
            className="flex items-center space-x-1 rounded-lg border border-[var(--theme-border)] bg-white/5 px-2.5 py-1 text-xs font-medium text-[var(--theme-text)] hover:bg-white/10 disabled:opacity-40 transition-colors"
            title="Run without recompiling (F5)"
          >
            <Play className="h-3 w-3 fill-current" />
            <span className="hidden md:inline">Run</span>
          </button>

          {/* Stop */}
          <button
            type="button"
            disabled={!isBusy}
            onClick={onStop}
            className="flex items-center space-x-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-xs font-medium text-rose-300 hover:bg-rose-500/20 disabled:opacity-30 transition-colors"
            title="Stop Execution (Shift+F5)"
          >
            <Square className="h-3 w-3 fill-current" />
            <span className="hidden md:inline">Stop</span>
          </button>

          {/* Open Code */}
          <button
            type="button"
            onClick={onOpenCode}
            className="flex items-center space-x-1 rounded-lg border border-[var(--theme-border)] bg-white/5 px-2 py-1 text-xs font-medium text-[var(--theme-text)] hover:bg-white/10 transition-colors"
            title="Open Source Code File (Ctrl+O)"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Open</span>
          </button>

          {/* Save Code */}
          <button
            type="button"
            onClick={onSaveCode}
            className="flex items-center space-x-1 rounded-lg border border-[var(--theme-border)] bg-white/5 px-2 py-1 text-xs font-medium text-[var(--theme-text)] hover:bg-white/10 transition-colors"
            title="Save Source Code (Ctrl+S)"
          >
            <Save className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Save</span>
          </button>
        </div>

        {/* Theme Selector Popover */}
        <div className="relative" ref={themeDropdownRef}>
          <button
            type="button"
            onClick={() => setThemeDropdownOpen(!themeDropdownOpen)}
            className="flex items-center rounded-lg p-1.5 text-[var(--theme-text-muted)] hover:bg-white/10 hover:text-[var(--theme-text)] transition-colors"
            title="Theme & Mica Options"
          >
            <Palette className="h-4 w-4" />
          </button>

          {themeDropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-2 shadow-2xl backdrop-blur-xl z-50 animate-in fade-in zoom-in-95 duration-100">
              <div className="px-2 py-1 text-[11px] font-semibold text-[var(--theme-text-muted)] uppercase tracking-wider">
                Select Theme
              </div>
              <div className="space-y-1">
                {THEME_LIST.map((t) => {
                  const isCur = theme === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setTheme(t.id);
                        setThemeDropdownOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
                        isCur ? 'bg-[var(--theme-tab-active)] text-[var(--theme-accent)] font-semibold' : 'hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <span
                          className="h-3 w-3 rounded-full border border-white/20"
                          style={{ backgroundColor: t.previewColor }}
                        />
                        <span>{t.label}</span>
                      </div>
                      {isCur && <Check className="h-3.5 w-3.5 text-[var(--theme-accent)]" />}
                    </button>
                  );
                })}
              </div>

              <div className="my-2 border-t border-[var(--theme-border)]" />

              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => setTransparent(!transparent)}
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs hover:bg-white/5 transition-colors"
                >
                  <span className="text-[var(--theme-text-muted)]">Mica / Glass Backdrop</span>
                  <span className="font-mono text-[11px] text-[var(--theme-accent)]">{transparent ? 'ON' : 'OFF'}</span>
                </button>

                {theme === 'cute-hoshino' && (
                  <button
                    type="button"
                    onClick={() => setShowMascot(!showMascot)}
                    className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs hover:bg-white/5 transition-colors"
                  >
                    <span className="text-[var(--theme-text-muted)]">Mascot Watermark</span>
                    {showMascot ? (
                      <Eye className="h-3.5 w-3.5 text-[var(--theme-accent)]" />
                    ) : (
                      <EyeOff className="h-3.5 w-3.5 text-slate-500" />
                    )}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Settings Button */}
        <button
          type="button"
          onClick={onOpenSettings}
          className="rounded-lg p-1.5 text-[var(--theme-text-muted)] hover:bg-white/10 hover:text-[var(--theme-text)] transition-colors"
          title="Settings (Ctrl+,)"
        >
          <Settings className="h-4 w-4" />
        </button>

        {/* Tauri Window Controls (Minimize, Maximize, Close) */}
        <div className="flex items-center space-x-0.5 border-l border-[var(--theme-border)] pl-1">
          <button
            type="button"
            onClick={handleMinimize}
            className="flex h-7 w-7 items-center justify-center rounded text-[var(--theme-text-muted)] hover:bg-white/10 hover:text-[var(--theme-text)] transition-colors"
            title="Minimize"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={handleMaximize}
            className="flex h-7 w-7 items-center justify-center rounded text-[var(--theme-text-muted)] hover:bg-white/10 hover:text-[var(--theme-text)] transition-colors"
            title="Maximize"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="flex h-7 w-7 items-center justify-center rounded text-[var(--theme-text-muted)] hover:bg-rose-500 hover:text-white transition-colors"
            title="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
};
