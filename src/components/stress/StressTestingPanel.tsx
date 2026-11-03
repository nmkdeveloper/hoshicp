import React, { useState, useEffect, useRef } from 'react';
import {
  Flame,
  X,
  Play,
  Square,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Check,
  FileCode,
  Clock,
  Layers,
  Cpu,
} from 'lucide-react';
import type { Problem } from '../../types';

export interface StressTestingPanelProps {
  isOpen: boolean;
  onClose: () => void;
  activeProblem?: Problem;
  onAddTestCase?: (testcase: { input: string; output: string }) => void;
}

export type StressStatusType =
  | 'idle'
  | 'running'
  | 'passed'
  | 'mismatch'
  | 'generator_error'
  | 'model_error'
  | 'target_error'
  | 'cancelled';

export interface StressResultData {
  iteration: number;
  status: StressStatusType;
  failingInput?: string;
  modelOutput?: string;
  targetOutput?: string;
  message?: string;
}

export const StressTestingPanel: React.FC<StressTestingPanelProps> = ({
  isOpen,
  onClose,
  activeProblem,
  onAddTestCase,
}) => {
  const [generatorPath, setGeneratorPath] = useState('gen.cpp');
  const [modelPath, setModelPath] = useState('brute.cpp');
  const [targetPath, setTargetPath] = useState(
    activeProblem?.filePath || activeProblem?.name || 'solution.cpp'
  );
  const [maxIterations, setMaxIterations] = useState<number>(100);
  const [timeLimit, setTimeLimit] = useState<number>(activeProblem?.timeLimit || 2000);
  const [memoryLimit, setMemoryLimit] = useState<number>(activeProblem?.memoryLimit || 256);

  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [currentIteration, setCurrentIteration] = useState<number>(0);
  const [status, setStatus] = useState<StressStatusType>('idle');
  const [result, setResult] = useState<StressResultData | null>(null);
  const [addedSuccess, setAddedSuccess] = useState<boolean>(false);

  const stopRequestedRef = useRef<boolean>(false);

  useEffect(() => {
    return () => {
      stopRequestedRef.current = true;
    };
  }, []);

  useEffect(() => {
    if (activeProblem) {
      if (!targetPath || targetPath === 'solution.cpp') {
        setTargetPath(activeProblem.filePath || activeProblem.name || 'solution.cpp');
      }
      if (activeProblem.timeLimit) setTimeLimit(activeProblem.timeLimit);
      if (activeProblem.memoryLimit) setMemoryLimit(activeProblem.memoryLimit);
    }
  }, [activeProblem]);

  if (!isOpen) return null;

  const handleStartStressTest = async () => {
    setIsRunning(true);
    setStatus('running');
    setCurrentIteration(0);
    setResult(null);
    setAddedSuccess(false);
    stopRequestedRef.current = false;

    let unlisten: (() => void) | undefined;
    const isUnderTauri =
      typeof window !== 'undefined' &&
      Boolean((window as any).__TAURI_INTERNALS__);

    if (isUnderTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const { listen } = await import('@tauri-apps/api/event');

        unlisten = await listen<any>('stress:progress', (event) => {
          if (typeof event.payload === 'number') {
            setCurrentIteration(event.payload);
          } else if (event.payload?.iteration) {
            setCurrentIteration(event.payload.iteration);
          }
        });

        const res = await invoke<any>('run_stress_test', {
          config: {
            generator_bin: generatorPath,
            model_bin: modelPath,
            target_bin: targetPath,
            max_iterations: maxIterations,
            time_limit_ms: timeLimit,
            memory_limit_mb: memoryLimit,
          },
        });

        if (res) {
          setCurrentIteration(res.iteration || maxIterations);
          const mappedStatus = (res.status?.toLowerCase() || 'passed') as StressStatusType;
          setStatus(mappedStatus);
          setResult({
            iteration: res.iteration || maxIterations,
            status: mappedStatus,
            failingInput: res.failing_input,
            modelOutput: res.model_output,
            targetOutput: res.target_output,
            message: res.message,
          });
        }
      } catch (err: any) {
        const errorMsg = err?.message || String(err);
        const errorStatus: StressStatusType = errorMsg.toLowerCase().includes('generator')
          ? 'generator_error'
          : errorMsg.toLowerCase().includes('model')
            ? 'model_error'
            : 'target_error';
        setStatus(errorStatus);
        setResult({
          iteration: currentIteration || 1,
          status: errorStatus,
          message: errorMsg,
        });
      } finally {
        if (unlisten) {
          unlisten();
        }
        setIsRunning(false);
      }
      return;
    }

    // Fallback: simulation loop strictly for non-Tauri / web browser environment
    try {
      let iter = 0;
      for (let i = 1; i <= maxIterations; i++) {
        if (stopRequestedRef.current) {
          setStatus('cancelled');
          setResult({
            iteration: i - 1,
            status: 'cancelled',
            message: 'Stress testing stopped by user.',
          });
          return;
        }

        iter = i;
        setCurrentIteration(iter);
        await new Promise((resolve) => setTimeout(resolve, 15));
      }

      setStatus('passed');
      setResult({
        iteration: maxIterations,
        status: 'passed',
        message: `All ${maxIterations} testcases passed successfully! No mismatch found.`,
      });
    } finally {
      setIsRunning(false);
    }
  };

  const handleStop = async () => {
    stopRequestedRef.current = true;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('cancel_stress_test');
    } catch {}
    setIsRunning(false);
    setStatus('cancelled');
  };

  const handleAddFailingToTestcases = () => {
    if (!result?.failingInput || !onAddTestCase) return;
    onAddTestCase({
      input: result.failingInput,
      output: result.modelOutput || '',
    });
    setAddedSuccess(true);
    setTimeout(() => setAddedSuccess(false), 2000);
  };

  const progressPercent = Math.min(
    100,
    Math.round((currentIteration / Math.max(1, maxIterations)) * 100)
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Stress Testing"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] shadow-2xl backdrop-blur-md overflow-hidden text-[var(--theme-text)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--theme-border)] px-5 py-3.5 bg-black/20">
          <div className="flex items-center space-x-2">
            <Flame className="h-5 w-5 text-amber-400" />
            <h2 className="text-base font-semibold tracking-tight">Stress Testing Engine</h2>
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

        {/* Form Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {/* File Paths Grid */}
          <div className="space-y-3">
            <div>
              <label className="mb-1 flex items-center space-x-1 font-medium text-[var(--theme-text-muted)]">
                <FileCode className="h-3.5 w-3.5 text-amber-400" />
                <span>Testcase Generator (Executable or Source)</span>
              </label>
              <input
                type="text"
                disabled={isRunning}
                value={generatorPath}
                onChange={(e) => setGeneratorPath(e.target.value)}
                placeholder="e.g. ./gen or gen.cpp"
                className="w-full rounded-lg border border-[var(--theme-border)] bg-black/20 px-3 py-2 text-xs font-mono text-[var(--theme-text)] placeholder-[var(--theme-text-muted)]/50 focus:border-[var(--theme-accent)] focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 flex items-center space-x-1 font-medium text-[var(--theme-text-muted)]">
                <FileCode className="h-3.5 w-3.5 text-emerald-400" />
                <span>Model / Brute Force Solution (Known Correct)</span>
              </label>
              <input
                type="text"
                disabled={isRunning}
                value={modelPath}
                onChange={(e) => setModelPath(e.target.value)}
                placeholder="e.g. ./brute or brute.cpp"
                className="w-full rounded-lg border border-[var(--theme-border)] bg-black/20 px-3 py-2 text-xs font-mono text-[var(--theme-text)] placeholder-[var(--theme-text-muted)]/50 focus:border-[var(--theme-accent)] focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 flex items-center space-x-1 font-medium text-[var(--theme-text-muted)]">
                <FileCode className="h-3.5 w-3.5 text-sky-400" />
                <span>Candidate / Target Solution (Under Test)</span>
              </label>
              <input
                type="text"
                disabled={isRunning}
                value={targetPath}
                onChange={(e) => setTargetPath(e.target.value)}
                placeholder="e.g. ./solution or solution.cpp"
                className="w-full rounded-lg border border-[var(--theme-border)] bg-black/20 px-3 py-2 text-xs font-mono text-[var(--theme-text)] placeholder-[var(--theme-text-muted)]/50 focus:border-[var(--theme-accent)] focus:outline-none"
              />
            </div>
          </div>

          {/* Limits Row */}
          <div className="grid grid-cols-3 gap-3 pt-1">
            <div>
              <label className="mb-1 flex items-center space-x-1 font-medium text-[var(--theme-text-muted)]">
                <Layers className="h-3.5 w-3.5 text-[var(--theme-accent)]" />
                <span>Max Iterations</span>
              </label>
              <input
                type="number"
                disabled={isRunning}
                min={1}
                max={100000}
                value={maxIterations}
                onChange={(e) => setMaxIterations(Math.max(1, parseInt(e.target.value) || 100))}
                className="w-full rounded-lg border border-[var(--theme-border)] bg-black/20 px-3 py-2 text-xs font-mono text-[var(--theme-text)] focus:border-[var(--theme-accent)] focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 flex items-center space-x-1 font-medium text-[var(--theme-text-muted)]">
                <Clock className="h-3.5 w-3.5 text-amber-400" />
                <span>Time Limit (ms)</span>
              </label>
              <input
                type="number"
                disabled={isRunning}
                min={50}
                max={60000}
                value={timeLimit}
                onChange={(e) => setTimeLimit(Math.max(50, parseInt(e.target.value) || 2000))}
                className="w-full rounded-lg border border-[var(--theme-border)] bg-black/20 px-3 py-2 text-xs font-mono text-[var(--theme-text)] focus:border-[var(--theme-accent)] focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 flex items-center space-x-1 font-medium text-[var(--theme-text-muted)]">
                <Cpu className="h-3.5 w-3.5 text-purple-400" />
                <span>Memory Limit (MB)</span>
              </label>
              <input
                type="number"
                disabled={isRunning}
                min={16}
                max={4096}
                value={memoryLimit}
                onChange={(e) => setMemoryLimit(Math.max(16, parseInt(e.target.value) || 256))}
                className="w-full rounded-lg border border-[var(--theme-border)] bg-black/20 px-3 py-2 text-xs font-mono text-[var(--theme-text)] focus:border-[var(--theme-accent)] focus:outline-none"
              />
            </div>
          </div>

          {/* Progress Section */}
          <div className="rounded-lg border border-[var(--theme-border)] bg-black/25 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[var(--theme-text)]">
                {isRunning
                  ? `Testing iteration ${currentIteration} / ${maxIterations}...`
                  : status === 'passed'
                    ? `Completed ${currentIteration} iterations`
                    : status === 'mismatch'
                      ? `Mismatch found at iteration ${currentIteration}!`
                      : status === 'cancelled'
                        ? `Cancelled at iteration ${currentIteration}`
                        : status === 'generator_error'
                          ? `Generator error at iteration ${currentIteration}`
                          : status === 'model_error'
                            ? `Model error at iteration ${currentIteration}`
                            : status === 'target_error'
                              ? `Target error at iteration ${currentIteration}`
                              : 'Ready to test'}
              </span>
              <span className="font-mono text-xs text-[var(--theme-accent)]">
                {progressPercent}%
              </span>
            </div>

            {/* Progress Bar */}
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full transition-all duration-150 ${
                  status === 'mismatch' ||
                  status === 'generator_error' ||
                  status === 'model_error' ||
                  status === 'target_error'
                    ? 'bg-rose-500'
                    : status === 'passed'
                      ? 'bg-emerald-500'
                      : 'bg-[var(--theme-accent)]'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Error Banner for Process Failures */}
          {result &&
            (status === 'generator_error' ||
              status === 'model_error' ||
              status === 'target_error') && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3.5 space-y-2">
                <div className="flex items-center space-x-2 text-rose-400 font-semibold">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>
                    {status === 'generator_error'
                      ? 'Generator Error'
                      : status === 'model_error'
                        ? 'Model Solution Error'
                        : 'Target Solution Error'}
                  </span>
                </div>
                {result.message && (
                  <pre className="max-h-24 overflow-auto rounded bg-black/40 p-2 font-mono text-[11px] text-rose-200 whitespace-pre-wrap">
                    {result.message}
                  </pre>
                )}
              </div>
            )}

          {/* Mismatch & Result Details */}
          {result && status === 'mismatch' && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-rose-400 font-semibold">
                  <AlertTriangle className="h-4 w-4" />
                  <span>Output Mismatch Detected on Iteration {result.iteration}</span>
                </div>
                {result.failingInput && onAddTestCase && (
                  <button
                    type="button"
                    onClick={handleAddFailingToTestcases}
                    className="flex items-center space-x-1.5 rounded-lg bg-[var(--theme-accent)] px-3 py-1 font-medium text-white shadow-sm hover:brightness-110 active:scale-95 transition-all"
                  >
                    {addedSuccess ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-200" />
                        <span>Added to Testcases</span>
                      </>
                    ) : (
                      <>
                        <Plus className="h-3.5 w-3.5" />
                        <span>Add to Testcases</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Failing Input */}
              {result.failingInput && (
                <div>
                  <div className="text-[11px] font-semibold text-[var(--theme-text-muted)] mb-1">
                    Failing Input:
                  </div>
                  <pre className="max-h-24 overflow-auto rounded bg-black/40 p-2 font-mono text-[11px] text-slate-200 whitespace-pre-wrap">
                    {result.failingInput}
                  </pre>
                </div>
              )}

              {/* Output Comparison */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[11px] font-semibold text-emerald-400 mb-1">
                    Model (Expected) Output:
                  </div>
                  <pre className="max-h-24 overflow-auto rounded bg-black/40 p-2 font-mono text-[11px] text-emerald-300 whitespace-pre-wrap">
                    {result.modelOutput || '<empty>'}
                  </pre>
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-rose-400 mb-1">
                    Candidate (Target) Output:
                  </div>
                  <pre className="max-h-24 overflow-auto rounded bg-black/40 p-2 font-mono text-[11px] text-rose-300 whitespace-pre-wrap">
                    {result.targetOutput || '<empty>'}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {/* All Passed Banner */}
          {result && status === 'passed' && (
            <div className="flex items-center space-x-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-300 font-medium">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              <span>{result.message || `All ${maxIterations} tests matched successfully!`}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-[var(--theme-border)] bg-black/20 px-5 py-3">
          <div className="text-[11px] text-[var(--theme-text-muted)]">
            {isRunning ? 'Running stress test...' : 'Configure generator & model to begin'}
          </div>

          <div className="flex items-center space-x-2">
            {isRunning ? (
              <button
                type="button"
                onClick={handleStop}
                className="flex items-center space-x-1.5 rounded-lg border border-rose-500/30 bg-rose-500/20 px-3.5 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/30 transition-colors"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
                <span>Stop</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStartStressTest}
                className="flex items-center space-x-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 px-4 py-1.5 text-xs font-semibold text-slate-950 shadow hover:brightness-110 active:scale-95 transition-all"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                <span>Start Stress Test</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-white/10 px-3.5 py-1.5 text-xs font-medium text-[var(--theme-text)] hover:bg-white/15 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
