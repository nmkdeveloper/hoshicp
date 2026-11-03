import React from 'react';

export interface VimStatusProps {
  mode?: string;
  subMode?: string;
  keyBuffer?: string;
  active?: boolean;
  showWhenInactive?: boolean;
  className?: string;
}

function getModeBadgeStyle(mode: string): { bg: string; text: string; border: string } {
  const normalized = mode.toUpperCase();

  if (normalized.includes('INSERT')) {
    return {
      bg: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
      text: 'text-sky-300',
      border: 'border-sky-500/40',
    };
  }
  if (normalized.includes('VISUAL')) {
    return {
      bg: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      text: 'text-amber-300',
      border: 'border-amber-500/40',
    };
  }
  if (normalized.includes('REPLACE')) {
    return {
      bg: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
      text: 'text-rose-300',
      border: 'border-rose-500/40',
    };
  }
  // Default NORMAL mode with Hoshino pastel pink/periwinkle accent
  return {
    bg: 'bg-pink-500/20 text-pink-300 border-pink-500/40',
    text: 'text-pink-300',
    border: 'border-pink-500/40',
  };
}

export const VimStatus: React.FC<VimStatusProps> = ({
  mode = 'NORMAL',
  subMode,
  keyBuffer,
  active = true,
  showWhenInactive = false,
  className = '',
}) => {
  if (!active && !showWhenInactive) {
    return null;
  }

  if (!active) {
    return (
      <div
        data-testid="vim-status"
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-mono font-medium rounded border border-slate-700/50 bg-slate-800/40 text-slate-400 ${className}`}
      >
        <span>VIM: OFF</span>
      </div>
    );
  }

  const badge = getModeBadgeStyle(mode);
  const formattedMode = mode.toUpperCase().replace(/^--\s*|\s*--$/g, '');

  return (
    <div
      data-testid="vim-status"
      className={`inline-flex items-center gap-2 px-2.5 py-0.5 text-xs font-mono font-semibold rounded-md border shadow-sm backdrop-blur-sm transition-all duration-150 ${badge.bg} ${className}`}
    >
      <span className="tracking-wider">{`-- ${formattedMode} --`}</span>
      {subMode && (
        <span className="text-[10px] font-normal opacity-80">{`(${subMode})`}</span>
      )}
      {keyBuffer && (
        <span
          data-testid="vim-keybuffer"
          className="ml-1 px-1 py-0.2 rounded bg-black/30 text-amber-200 text-[11px]"
        >
          {keyBuffer}
        </span>
      )}
    </div>
  );
};

export default VimStatus;
