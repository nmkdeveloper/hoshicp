import React, { useState } from 'react';
import {
  Play,
  Trash2,
  ChevronDown,
  ChevronRight,
  Split,
  CheckCircle2,
  XCircle,
  Clock,
  HardDrive,
  AlertCircle,
  AlertOctagon,
  Loader2,
  Copy,
  Check,
} from 'lucide-react';
import type { TestCase } from '../../types';
import type { TestCaseResult, TestcaseStatus } from './types';

export interface TestCaseItemProps {
  testcase: TestCase;
  index: number;
  result?: TestCaseResult;
  isRunning?: boolean;
  onUpdate: (updated: TestCase) => void;
  onDelete: (id: string) => void;
  onRunSingle: (id: string) => void;
  onOpenDiff: (expected: string, actual: string, title: string) => void;
}

export const StatusPill: React.FC<{ status?: TestcaseStatus | string; isRunning?: boolean }> = ({
  status,
  isRunning,
}) => {
  if (isRunning || status === 'Running') {
    return (
      <span className="flex items-center space-x-1 rounded-full border border-sky-500/30 bg-sky-500/20 px-2 py-0.5 text-[11px] font-medium text-sky-300 animate-pulse">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>Running</span>
      </span>
    );
  }

  switch (status) {
    case 'Accepted':
      return (
        <span className="flex items-center space-x-1 rounded-full border border-emerald-500/30 bg-emerald-500/20 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
          <CheckCircle2 className="h-3 w-3" />
          <span>AC</span>
        </span>
      );
    case 'WrongAnswer':
      return (
        <span className="flex items-center space-x-1 rounded-full border border-rose-500/30 bg-rose-500/20 px-2 py-0.5 text-[11px] font-medium text-rose-300">
          <XCircle className="h-3 w-3" />
          <span>WA</span>
        </span>
      );
    case 'TimeLimitExceeded':
      return (
        <span className="flex items-center space-x-1 rounded-full border border-amber-500/30 bg-amber-500/20 px-2 py-0.5 text-[11px] font-medium text-amber-300">
          <Clock className="h-3 w-3" />
          <span>TLE</span>
        </span>
      );
    case 'MemoryLimitExceeded':
      return (
        <span className="flex items-center space-x-1 rounded-full border border-orange-500/30 bg-orange-500/20 px-2 py-0.5 text-[11px] font-medium text-orange-300">
          <HardDrive className="h-3 w-3" />
          <span>MLE</span>
        </span>
      );
    case 'CompilationError':
      return (
        <span className="flex items-center space-x-1 rounded-full border border-purple-500/30 bg-purple-500/20 px-2 py-0.5 text-[11px] font-medium text-purple-300">
          <AlertCircle className="h-3 w-3" />
          <span>CE</span>
        </span>
      );
    case 'RuntimeError':
      return (
        <span className="flex items-center space-x-1 rounded-full border border-red-500/30 bg-red-500/20 px-2 py-0.5 text-[11px] font-medium text-red-300">
          <AlertOctagon className="h-3 w-3" />
          <span>RE</span>
        </span>
      );
    default:
      return (
        <span className="flex items-center rounded-full border border-slate-700/50 bg-slate-800/40 px-2 py-0.5 text-[11px] font-medium text-[var(--theme-text-muted)]">
          Pending
        </span>
      );
  }
};

export const TestCaseItem: React.FC<TestCaseItemProps> = ({
  testcase,
  index,
  result,
  isRunning = false,
  onUpdate,
  onDelete,
  onRunSingle,
  onOpenDiff,
}) => {
  const [expanded, setExpanded] = useState<boolean>(true);
  const [copiedInput, setCopiedInput] = useState<boolean>(false);

  const title = `Case #${index + 1}`;

  const copyInput = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(testcase.input);
      setCopiedInput(true);
      setTimeout(() => setCopiedInput(false), 1200);
    } catch {}
  };

  return (
    <div className="rounded-lg border border-[var(--theme-border)] bg-black/20 overflow-hidden text-xs transition-colors hover:border-[var(--theme-border-focus)]">
      {/* Header bar */}
      <div
        className="flex items-center justify-between px-3 py-2 bg-black/30 cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center space-x-2">
          <button
            type="button"
            className="text-[var(--theme-text-muted)] hover:text-[var(--theme-text)]"
            title={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
          <span className="font-semibold text-sm">{title}</span>
          {testcase.custom && (
            <span className="rounded bg-sky-500/20 px-1.5 py-0.2 text-[10px] font-medium text-sky-300 border border-sky-500/30">
              Custom
            </span>
          )}
          <StatusPill status={result?.status} isRunning={isRunning} />
        </div>

        <div className="flex items-center space-x-2 text-[var(--theme-text-muted)]">
          {result?.execution_time_ms !== undefined && (
            <span className="font-mono text-[11px]">{`${result.execution_time_ms}ms`}</span>
          )}
          {result?.memory_usage_kb !== undefined && (
            <span className="font-mono text-[11px]">{`${result.memory_usage_kb}KB`}</span>
          )}

          {/* Action: Open Diff */}
          {result?.stdout !== undefined && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenDiff(testcase.output, result.stdout ?? '', title);
              }}
              className="flex items-center space-x-1 rounded p-1 hover:bg-white/10 hover:text-[var(--theme-text)] transition-colors"
              title="Open Diff Viewer"
            >
              <Split className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Action: Run Single Test */}
          <button
            type="button"
            disabled={isRunning}
            onClick={(e) => {
              e.stopPropagation();
              onRunSingle(testcase.id);
            }}
            className="flex items-center rounded p-1 hover:bg-emerald-500/20 hover:text-emerald-300 disabled:opacity-40 transition-colors"
            title="Run this test case"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
          </button>

          {/* Action: Delete */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(testcase.id);
            }}
            className="flex items-center rounded p-1 hover:bg-rose-500/20 hover:text-rose-300 transition-colors"
            title="Delete test case"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="p-3 space-y-2 border-t border-[var(--theme-border)]/50">
          {/* Input field */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] text-[var(--theme-text-muted)]">
              <span>Input</span>
              <button
                type="button"
                onClick={copyInput}
                className="flex items-center space-x-1 hover:text-[var(--theme-text)]"
                title="Copy input"
              >
                {copiedInput ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                <span>{copiedInput ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <textarea
              value={testcase.input}
              onChange={(e) => onUpdate({ ...testcase, input: e.target.value })}
              rows={Math.min(6, Math.max(2, testcase.input.split('\n').length))}
              className="w-full rounded-md border border-[var(--theme-border)] bg-black/40 px-2.5 py-1.5 font-mono text-xs text-[var(--theme-text)] placeholder-slate-500 focus:border-[var(--theme-border-focus)] focus:outline-none resize-y"
              placeholder="Test case input..."
            />
          </div>

          {/* Expected Output field */}
          <div className="space-y-1">
            <div className="text-[11px] text-[var(--theme-text-muted)]">Expected Output</div>
            <textarea
              value={testcase.output}
              onChange={(e) => onUpdate({ ...testcase, output: e.target.value })}
              rows={Math.min(6, Math.max(2, testcase.output.split('\n').length))}
              className="w-full rounded-md border border-[var(--theme-border)] bg-black/40 px-2.5 py-1.5 font-mono text-xs text-[var(--theme-text)] placeholder-slate-500 focus:border-[var(--theme-border-focus)] focus:outline-none resize-y"
              placeholder="Expected output..."
            />
          </div>

          {/* Actual stdout if available */}
          {result?.stdout !== undefined && (
            <div className="space-y-1 pt-1">
              <div className="flex items-center justify-between text-[11px] text-[var(--theme-text-muted)]">
                <span>Actual Output</span>
                {result.status === 'WrongAnswer' && (
                  <button
                    type="button"
                    onClick={() => onOpenDiff(testcase.output, result.stdout ?? '', title)}
                    className="text-[11px] text-rose-400 hover:underline"
                  >
                    View Diff
                  </button>
                )}
              </div>
              <pre
                className={`rounded-md border p-2 font-mono text-xs max-h-36 overflow-auto ${
                  result.status === 'WrongAnswer'
                    ? 'border-rose-500/40 bg-rose-950/20 text-rose-200'
                    : 'border-emerald-500/30 bg-emerald-950/15 text-emerald-200'
                }`}
              >
                {result.stdout || <span className="italic opacity-50">&lt;empty&gt;</span>}
              </pre>
            </div>
          )}

          {/* Stderr if present */}
          {result?.stderr && result.stderr.trim().length > 0 && (
            <div className="space-y-1 pt-1">
              <div className="text-[11px] text-amber-400">Standard Error (stderr)</div>
              <pre className="rounded-md border border-amber-500/30 bg-amber-950/20 p-2 font-mono text-xs text-amber-200 max-h-32 overflow-auto whitespace-pre-wrap">
                {result.stderr}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
