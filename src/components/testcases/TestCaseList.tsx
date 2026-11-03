import React from 'react';
import { Play, Plus, CheckCircle2, AlertTriangle, Layers } from 'lucide-react';
import type { TestCase } from '../../types';
import type { TestCaseResult } from './types';
import { TestCaseItem } from './TestCaseItem';

export interface TestCaseListProps {
  testcases: TestCase[];
  results?: Record<string, TestCaseResult>;
  isRunningAll?: boolean;
  runningTestId?: string | null;
  onAddTestCase: () => void;
  onUpdateTestCase: (tc: TestCase) => void;
  onDeleteTestCase: (id: string) => void;
  onRunAll: () => void;
  onRunSingle: (id: string) => void;
  onOpenDiff: (expected: string, actual: string, title: string) => void;
  className?: string;
}

export const TestCaseList: React.FC<TestCaseListProps> = ({
  testcases,
  results = {},
  isRunningAll = false,
  runningTestId = null,
  onAddTestCase,
  onUpdateTestCase,
  onDeleteTestCase,
  onRunAll,
  onRunSingle,
  onOpenDiff,
  className = '',
}) => {
  // Compute summary stats
  const total = testcases.length;
  const ranCount = Object.keys(results).length;
  const passedCount = Object.values(results).filter((r) => r.status === 'Accepted').length;
  const hasFailed = Object.values(results).some(
    (r) => r.status !== 'Accepted' && r.status !== 'Running' && r.status !== 'Pending'
  );

  return (
    <div className={`flex h-full flex-col bg-[var(--theme-surface)] text-[var(--theme-text)] border-l border-[var(--theme-border)] ${className}`}>
      {/* Testcases Header */}
      <div className="flex items-center justify-between border-b border-[var(--theme-border)] px-4 py-2.5 bg-black/20">
        <div className="flex items-center space-x-2">
          <Layers className="h-4 w-4 text-[var(--theme-accent)]" />
          <span className="font-semibold text-sm">Test Cases</span>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-[var(--theme-text-muted)] font-mono">
            {total}
          </span>
        </div>

        {/* Status Pill & Summary */}
        <div className="flex items-center space-x-2">
          {ranCount > 0 && (
            <div
              className={`flex items-center space-x-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium border ${
                !hasFailed && passedCount === total && total > 0
                  ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
                  : hasFailed
                  ? 'border-rose-500/30 bg-rose-500/15 text-rose-300'
                  : 'border-slate-700/50 bg-slate-800/40 text-[var(--theme-text-muted)]'
              }`}
            >
              {!hasFailed && passedCount === total && total > 0 ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : hasFailed ? (
                <AlertTriangle className="h-3 w-3" />
              ) : null}
              <span>{`${passedCount}/${total} Passed`}</span>
            </div>
          )}

          {/* Run All Button */}
          <button
            type="button"
            disabled={isRunningAll || total === 0}
            onClick={onRunAll}
            className="flex items-center space-x-1.5 rounded-lg bg-[var(--theme-accent)] px-3 py-1 text-xs font-semibold text-white shadow-sm hover:brightness-110 disabled:opacity-50 transition-all active:scale-95"
            title="Run all test cases"
          >
            <Play className="h-3 w-3 fill-current" />
            <span>{isRunningAll ? 'Running...' : 'Run All'}</span>
          </button>

          {/* Add Testcase Button */}
          <button
            type="button"
            onClick={onAddTestCase}
            className="flex items-center space-x-1 rounded-lg border border-[var(--theme-border)] bg-white/5 px-2.5 py-1 text-xs font-medium text-[var(--theme-text)] hover:bg-white/10 transition-colors"
            title="Add new test case"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add</span>
          </button>
        </div>
      </div>

      {/* Testcases Scroll Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {testcases.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center text-[var(--theme-text-muted)]">
            <Layers className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm font-medium">No test cases available</p>
            <p className="text-xs mt-1">Click "Add" above to create custom input and expected output.</p>
          </div>
        ) : (
          testcases.map((tc, idx) => (
            <TestCaseItem
              key={tc.id}
              testcase={tc}
              index={idx}
              result={results[tc.id]}
              isRunning={isRunningAll || runningTestId === tc.id}
              onUpdate={onUpdateTestCase}
              onDelete={onDeleteTestCase}
              onRunSingle={onRunSingle}
              onOpenDiff={onOpenDiff}
            />
          ))
        )}
      </div>
    </div>
  );
};
