import React, { useState, useId } from 'react';
import { X, Columns2, AlignJustify, CheckCircle2, AlertTriangle, Copy, Check } from 'lucide-react';
import { computeTokenDiff } from './diffHelper';

export interface DiffViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  expected: string;
  actual: string;
  testcaseTitle?: string;
}

export const DiffViewerModal: React.FC<DiffViewerModalProps> = ({
  isOpen,
  onClose,
  expected,
  actual,
  testcaseTitle = 'Test Case',
}) => {
  const [viewMode, setViewMode] = useState<'side-by-side' | 'unified'>('side-by-side');
  const [copiedExpected, setCopiedExpected] = useState(false);
  const [copiedActual, setCopiedActual] = useState(false);
  const titleId = useId();

  if (!isOpen) return null;

  const diff = computeTokenDiff(actual, expected);

  const copyToClipboard = async (text: string, isActual: boolean) => {
    try {
      await navigator.clipboard.writeText(text);
      if (isActual) {
        setCopiedActual(true);
        setTimeout(() => setCopiedActual(false), 1500);
      } else {
        setCopiedExpected(true);
        setTimeout(() => setCopiedExpected(false), 1500);
      }
    } catch {}
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-4xl flex-col rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] shadow-2xl backdrop-blur-md overflow-hidden text-[var(--theme-text)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--theme-border)] px-5 py-3.5 bg-black/20">
          <div className="flex items-center space-x-3">
            <span id={titleId} className="font-semibold text-base tracking-tight">{`${testcaseTitle} Diff`}</span>
            {diff.hasMismatch ? (
              <span className="flex items-center space-x-1.5 rounded-full border border-rose-500/30 bg-rose-500/15 px-2.5 py-0.5 text-xs font-medium text-rose-400">
                <AlertTriangle className="h-3 w-3" />
                <span>{`Wrong Answer (Mismatch on line ${diff.mismatchLine ?? 1})`}</span>
              </span>
            ) : (
              <span className="flex items-center space-x-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
                <CheckCircle2 className="h-3 w-3" />
                <span>Outputs Match</span>
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2">
            {/* View Mode Toggle */}
            <div className="flex items-center rounded-lg border border-[var(--theme-border)] bg-black/30 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setViewMode('side-by-side')}
                className={`flex items-center space-x-1 rounded-md px-2.5 py-1 transition-colors ${
                  viewMode === 'side-by-side'
                    ? 'bg-[var(--theme-accent)] text-white font-medium shadow-sm'
                    : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text)]'
                }`}
              >
                <Columns2 className="h-3.5 w-3.5" />
                <span>Side by Side</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('unified')}
                className={`flex items-center space-x-1 rounded-md px-2.5 py-1 transition-colors ${
                  viewMode === 'unified'
                    ? 'bg-[var(--theme-accent)] text-white font-medium shadow-sm'
                    : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text)]'
                }`}
              >
                <AlignJustify className="h-3.5 w-3.5" />
                <span>Unified</span>
              </button>
            </div>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-[var(--theme-text-muted)] hover:bg-white/10 hover:text-[var(--theme-text)] transition-colors"
              title="Close modal"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Mismatch Detail Banner */}
        {diff.hasMismatch && (
          <div className="border-b border-rose-500/20 bg-rose-500/10 px-5 py-2 text-xs text-rose-300 flex items-center justify-between">
            <div>
              <span className="font-semibold">{`Line ${diff.mismatchLine ?? 1} token mismatch:`}</span>{' '}
              expected <code className="bg-black/30 px-1.5 py-0.5 rounded text-rose-200 font-mono">{diff.expectedToken}</code>, but got{' '}
              <code className="bg-black/30 px-1.5 py-0.5 rounded text-rose-200 font-mono">{diff.actualToken}</code>
            </div>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-auto p-4 font-mono text-xs">
          {viewMode === 'side-by-side' ? (
            <div className="grid grid-cols-2 gap-4">
              {/* Expected Column */}
              <div className="flex flex-col rounded-lg border border-[var(--theme-border)] bg-black/25 overflow-hidden">
                <div className="flex items-center justify-between border-b border-[var(--theme-border)] bg-black/30 px-3 py-2 text-[var(--theme-text-muted)] font-sans font-medium text-xs">
                  <span>Expected Output</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(expected, false)}
                    className="flex items-center space-x-1 text-[11px] hover:text-[var(--theme-text)] transition-colors"
                  >
                    {copiedExpected ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                    <span>{copiedExpected ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <div className="p-2 space-y-0.5 overflow-x-auto min-h-[140px] max-h-[50vh]">
                  {diff.lines.length === 0 ? (
                    <div className="text-[var(--theme-text-muted)] italic p-2">&lt;empty&gt;</div>
                  ) : (
                    diff.lines.map((l) => {
                      const isMismatch = l.status === 'mismatch' || l.status === 'missing';
                      return (
                        <div
                          key={`exp-${l.lineNumber}`}
                          className={`flex items-start rounded px-1.5 py-0.5 leading-relaxed ${
                            isMismatch ? 'bg-emerald-500/15 text-emerald-300' : 'text-[var(--theme-text)]'
                          }`}
                        >
                          <span className="w-8 shrink-0 select-none text-right pr-2 text-[var(--theme-text-muted)] opacity-60">
                            {l.lineNumber}
                          </span>
                          <span className="whitespace-pre-wrap break-all">{l.expected || (isMismatch && l.status === 'missing' ? ' ' : '')}</span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Actual Column */}
              <div className="flex flex-col rounded-lg border border-[var(--theme-border)] bg-black/25 overflow-hidden">
                <div className="flex items-center justify-between border-b border-[var(--theme-border)] bg-black/30 px-3 py-2 text-[var(--theme-text-muted)] font-sans font-medium text-xs">
                  <span>Actual Output</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(actual, true)}
                    className="flex items-center space-x-1 text-[11px] hover:text-[var(--theme-text)] transition-colors"
                  >
                    {copiedActual ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                    <span>{copiedActual ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <div className="p-2 space-y-0.5 overflow-x-auto min-h-[140px] max-h-[50vh]">
                  {diff.lines.length === 0 ? (
                    <div className="text-[var(--theme-text-muted)] italic p-2">&lt;empty&gt;</div>
                  ) : (
                    diff.lines.map((l) => {
                      const isMismatch = l.status === 'mismatch' || l.status === 'extra';
                      return (
                        <div
                          key={`act-${l.lineNumber}`}
                          className={`flex items-start rounded px-1.5 py-0.5 leading-relaxed ${
                            isMismatch ? 'bg-rose-500/20 text-rose-300' : 'text-[var(--theme-text)]'
                          }`}
                        >
                          <span className="w-8 shrink-0 select-none text-right pr-2 text-[var(--theme-text-muted)] opacity-60">
                            {l.lineNumber}
                          </span>
                          <span className="whitespace-pre-wrap break-all">{l.actual || (isMismatch && l.status === 'extra' ? ' ' : '')}</span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Unified View */
            <div className="rounded-lg border border-[var(--theme-border)] bg-black/25 overflow-hidden">
              <div className="border-b border-[var(--theme-border)] bg-black/30 px-3 py-2 text-[var(--theme-text-muted)] font-sans font-medium text-xs">
                Unified Diff View
              </div>
              <div className="p-2 space-y-0.5 overflow-x-auto min-h-[140px] max-h-[50vh]">
                {diff.unified.length === 0 ? (
                  <div className="text-[var(--theme-text-muted)] italic p-2">&lt;empty&gt;</div>
                ) : (
                  diff.unified.map((u, idx) => {
                    const isAdded = u.type === 'added';
                    const isDeleted = u.type === 'deleted';
                    return (
                      <div
                        key={`uni-${idx}`}
                        className={`flex items-start rounded px-1.5 py-0.5 leading-relaxed ${
                          isAdded
                            ? 'bg-rose-500/20 text-rose-300'
                            : isDeleted
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : 'text-[var(--theme-text)]'
                        }`}
                      >
                        <span className="w-6 shrink-0 select-none text-center font-bold">
                          {isAdded ? '+' : isDeleted ? '-' : ' '}
                        </span>
                        <span className="w-8 shrink-0 select-none text-right pr-2 text-[var(--theme-text-muted)] opacity-60">
                          {u.lineNumActual ?? u.lineNumExpected ?? ''}
                        </span>
                        <span className="whitespace-pre-wrap break-all">{u.text}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-[var(--theme-border)] bg-black/20 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-white/10 px-4 py-1.5 text-xs font-medium text-[var(--theme-text)] hover:bg-white/15 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
