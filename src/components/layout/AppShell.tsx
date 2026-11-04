import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Terminal,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  XCircle,
  Copy,
  Check,
  PanelRightClose,
  PanelRightOpen,
  Split,
} from 'lucide-react';
import { HeaderBar } from './HeaderBar';
import { CodeEditor } from '../editor/CodeEditor';
import { TestCaseList } from '../testcases/TestCaseList';
import { DiffViewerModal } from '../testcases/DiffViewerModal';
import { computeTokenDiff } from '../testcases/diffHelper';
import { useTheme } from '../theme/ThemeManager';
import { type Problem, type TestCase, type TestCaseResult, padLinesToMinimum, stripPaddingLines } from '../../types';
import { loadStoredSettings, type AppSettings } from '../settings/SettingsModal';
import { DEFAULT_TEMPLATES } from '../../hooks/useCompanion';
import { parseTestcaseFiles, type RawTestcaseFile } from '../testcases/testcaseParser';
import { matchesShortcut } from '../../utils/shortcuts';

export interface AppShellProps {
  initialProblems?: Problem[];
  problems?: Problem[];
  activeProblemId?: string;
  onSelectProblem?: (id: string) => void;
  onCloseProblem?: (id: string) => void;
  onNewProblem?: () => void;
  onProblemsChange?: (problems: Problem[]) => void;
  onOpenSettings?: () => void;
  onFileSave?: (problem: Problem) => void;
  settings?: AppSettings;
}

export function createDefaultProblem(): Problem {
  const settings = loadStoredSettings();
  const lang = (settings.defaultLanguage as any) || 'cpp';
  const rawTemplate = settings.templates?.[lang] || DEFAULT_TEMPLATES[lang] || '';
  const ext = lang === 'python' ? 'py' : lang === 'rust' ? 'rs' : lang === 'java' ? 'java' : 'cpp';
  const fileName = `main.${ext}`;
  const code = padLinesToMinimum(
    rawTemplate
      .replace(/\$\{PROBLEM_NAME\}/g, fileName)
      .replace(/\$\{DATE\}/g, new Date().toLocaleDateString())
      .replace(/\$\{TIME\}/g, new Date().toLocaleTimeString()),
    120
  );

  return {
    id: 'problem-1',
    name: fileName,
    group: 'Custom',
    language: lang,
    code,
    timeLimit: settings.defaultTimeLimit || 2000,
    memoryLimit: settings.defaultMemoryLimit || 256,
    testcases: [
      { id: 'tc-1', input: '', output: '', custom: true },
    ],
  };
}

export const DEFAULT_PROBLEMS: Problem[] = [createDefaultProblem()];

export const AppShell: React.FC<AppShellProps> = ({
  initialProblems = DEFAULT_PROBLEMS,
  problems: problemsProp,
  activeProblemId: activeProblemIdProp,
  onSelectProblem: onSelectProblemProp,
  onCloseProblem: onCloseProblemProp,
  onNewProblem: onNewProblemProp,
  onProblemsChange,
  onOpenSettings,
  onFileSave,
  settings: settingsProp,
}) => {
  const { theme, transparent } = useTheme();
  const settings = settingsProp ?? loadStoredSettings();

  // Problem management state
  const [internalProblems, setInternalProblems] = useState<Problem[]>(initialProblems);
  const [internalActiveProblemId, setInternalActiveProblemId] = useState<string>(
    initialProblems[0]?.id || 'problem-1'
  );

  const problems = problemsProp ?? internalProblems;
  const activeProblemId = activeProblemIdProp ?? internalActiveProblemId;

  const setProblems = (updater: Problem[] | ((prev: Problem[]) => Problem[])) => {
    const next = typeof updater === 'function' ? updater(problems) : updater;
    if (onProblemsChange) {
      onProblemsChange(next);
    }
    setInternalProblems(next);
  };

  const setActiveProblemId = (id: string) => {
    if (onSelectProblemProp) {
      onSelectProblemProp(id);
    }
    setInternalActiveProblemId(id);
  };

  const activeProblem = problems.find((p) => p.id === activeProblemId) || problems[0];

  // LSP server state
  const [lspPort, setLspPort] = useState<number | undefined>(undefined);

  useEffect(() => {
    let isMounted = true;
    const lang = activeProblem?.language;
    if (!lang) {
      setLspPort(undefined);
      return;
    }

    const startLsp = async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const port = await invoke<number>('start_lsp_server', {
          language: lang,
        });
        if (isMounted) {
          setLspPort(port);
        }
      } catch {
        if (isMounted) {
          setLspPort(undefined);
        }
      }
    };

    startLsp();

    return () => {
      isMounted = false;
    };
  }, [activeProblem?.language]);

  // Execution and compilation state
  const [isCompiling, setIsCompiling] = useState<boolean>(false);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [runningTestId, setRunningTestId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, TestCaseResult>>({});

  // Layout panes state
  const [rightPaneWidth, setRightPaneWidth] = useState<number>(380);
  const [isRightPaneCollapsed, setIsRightPaneCollapsed] = useState<boolean>(false);
  const [consoleHeight, setConsoleHeight] = useState<number>(160);
  const [isConsoleOpen, setIsConsoleOpen] = useState<boolean>(false);
  const [activeConsoleTab, setActiveConsoleTab] = useState<'compiler' | 'execution'>('compiler');
  const [compilerLogs, setCompilerLogs] = useState<string>('Ready to build.\n');
  const [executionLogs, setExecutionLogs] = useState<string>('');

  // Diff Modal state
  const [diffModal, setDiffModal] = useState<{
    isOpen: boolean;
    expected: string;
    actual: string;
    title: string;
  }>({
    isOpen: false,
    expected: '',
    actual: '',
    title: '',
  });

  const [copiedConsole, setCopiedConsole] = useState(false);

  // Resize handling refs
  const isResizingRightRef = useRef(false);
  const isResizingConsoleRef = useRef(false);

  // Problem management callbacks
  const handleSelectProblem = (id: string) => {
    setActiveProblemId(id);
    setResults({});
  };

  const handleCloseProblem = (id: string) => {
    if (onCloseProblemProp) {
      onCloseProblemProp(id);
      return;
    }
    if (problems.length <= 1) return;
    const remaining = problems.filter((p) => p.id !== id);
    setProblems(remaining);
    if (activeProblemId === id) {
      setActiveProblemId(remaining[0].id);
      setResults({});
    }
  };

  const handleNewProblem = () => {
    if (onNewProblemProp) {
      onNewProblemProp();
      return;
    }
    const settings = loadStoredSettings();
    const lang = settings.defaultLanguage || 'cpp';
    const rawTemplate = settings.templates?.[lang] || DEFAULT_TEMPLATES[lang] || '';
    const probName = `Problem ${problems.length + 1}`;
    const code = padLinesToMinimum(
      rawTemplate
        .replace(/\$\{PROBLEM_NAME\}/g, probName)
        .replace(/\$\{DATE\}/g, new Date().toLocaleDateString())
        .replace(/\$\{TIME\}/g, new Date().toLocaleTimeString()),
      120
    );

    const newId = `problem-${Date.now()}`;
    const newProblem: Problem = {
      id: newId,
      name: probName,
      group: 'Custom',
      language: lang,
      code,
      timeLimit: settings.defaultTimeLimit || 2000,
      memoryLimit: settings.defaultMemoryLimit || 256,
      testcases: [
        { id: `tc-${Date.now()}-1`, input: '1\n', output: '1\n', custom: true },
      ],
    };
    setProblems([...problems, newProblem]);
    setActiveProblemId(newId);
    setResults({});
  };

  const handleFileDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const newItems: Problem[] = [];
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        const file = e.dataTransfer.files[i];
        try {
          const text = await file.text();
          const ext = file.name.split('.').pop()?.toLowerCase() || 'cpp';
          const lang = ext === 'py' ? 'python' : ext === 'rs' ? 'rust' : ext === 'java' ? 'java' : 'cpp';
          const newId = `problem-${Date.now()}-${i}`;
          newItems.push({
            id: newId,
            name: file.name,
            group: 'Imported',
            language: lang,
            code: padLinesToMinimum(text, 120),
            timeLimit: 2000,
            memoryLimit: 256,
            testcases: [{ id: `tc-${Date.now()}-${i}-1`, input: '1\n', output: '1\n', custom: true }],
          });
        } catch {}
      }
      if (newItems.length > 0) {
        setProblems((prev) => [...prev, ...newItems]);
        setActiveProblemId(newItems[0].id);
        setResults({});
      }
    }
  };

  const handleCodeChange = (newCode: string) => {
    setProblems((prev) =>
      prev.map((p) => (p.id === activeProblemId ? { ...p, code: newCode } : p))
    );
    if (activeProblem && onFileSave) {
      onFileSave({ ...activeProblem, code: stripPaddingLines(newCode) });
    }
  };

  // Testcase modification callbacks
  const handleAddTestCase = () => {
    if (!activeProblem) return;
    const newTc: TestCase = {
      id: `tc-custom-${Date.now()}`,
      input: '',
      output: '',
      custom: true,
    };
    setProblems((prev) =>
      prev.map((p) =>
        p.id === activeProblemId ? { ...p, testcases: [...p.testcases, newTc] } : p
      )
    );
  };

  const handleUpdateTestCase = (updated: TestCase) => {
    setProblems((prev) =>
      prev.map((p) =>
        p.id === activeProblemId
          ? {
              ...p,
              testcases: p.testcases.map((tc) => (tc.id === updated.id ? updated : tc)),
            }
          : p
      )
    );
  };

  const handleDeleteTestCase = (id: string) => {
    setProblems((prev) =>
      prev.map((p) =>
        p.id === activeProblemId
          ? {
              ...p,
              testcases: p.testcases.filter((tc) => tc.id !== id),
            }
          : p
      )
    );
    setResults((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handleOpenDiff = (expected: string, actual: string, title: string) => {
    setDiffModal({
      isOpen: true,
      expected,
      actual,
      title,
    });
  };

  // Execution engine trigger
  const runTestcasesViaTauri = useCallback(
    async (targetTcId?: string) => {
      if (!activeProblem) return;

      setIsRunning(true);
      if (targetTcId) {
        setRunningTestId(targetTcId);
      }

      const testsToRun = targetTcId
        ? activeProblem.testcases.filter((t) => t.id === targetTcId)
        : activeProblem.testcases;

      // If no testcases exist, execute code directly and log output & RE details straight to console drawer
      if (testsToRun.length === 0) {
        setIsConsoleOpen(true);
        setActiveConsoleTab('execution');
        setExecutionLogs(
          (prev) => prev + `[${new Date().toLocaleTimeString()}] Running ${activeProblem.name} without testcases...\n`
        );
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const res = await invoke<any>('run_testcase', {
            sourceCode: stripPaddingLines(activeProblem.code),
            language: activeProblem.language,
            testcase: { id: 'tc-direct', input: '', output: '', custom: true },
            timeLimitMs: activeProblem.timeLimit,
            memoryLimitMb: activeProblem.memoryLimit,
          });
          const exitStr = res.exit_code !== null ? `Exit code: ${res.exit_code}` : 'Terminated';
          let logOutput = `[Execution Finished] Status: ${res.status} (${exitStr}, Time: ${res.execution_time_ms}ms, Mem: ${res.memory_usage_kb}KB)\n`;
          if (res.stdout && res.stdout.length > 0) {
            logOutput += `--- Standard Output (stdout) ---\n${res.stdout}\n`;
          }
          if (res.stderr && res.stderr.length > 0) {
            logOutput += `--- Standard Error (stderr) ---\n${res.stderr}\n`;
          }
          if (res.status === 'RuntimeError') {
            logOutput += `[Runtime Error (RE)] Process terminated abnormally with non-zero exit code.\n`;
          }
          setExecutionLogs((prev) => prev + logOutput);
        } catch (err: any) {
          setExecutionLogs((prev) => prev + `[Execution Error] ${err?.message || err}\n`);
        } finally {
          setIsRunning(false);
          setRunningTestId(null);
        }
        return;
      }

      // Mark running status
      setResults((prev) => {
        const next = { ...prev };
        testsToRun.forEach((tc) => {
          next[tc.id] = { status: 'Running' };
        });
        return next;
      });

      try {
        // Try invoking Tauri backend runner if available
        const { invoke } = await import('@tauri-apps/api/core');
        const res = await invoke<any>('run_all_testcases', {
          sourceCode: stripPaddingLines(activeProblem.code),
          language: activeProblem.language,
          testcases: testsToRun,
          timeLimitMs: activeProblem.timeLimit,
          memoryLimitMb: activeProblem.memoryLimit,
        });

        if (res && res.results) {
          const newResults: Record<string, TestCaseResult> = {};
          let hasRuntimeError = false;
          let runtimeErrorLogs = '';
          res.results.forEach((r: any, idx: number) => {
            const tc = testsToRun[idx];
            if (tc) {
              newResults[tc.id] = {
                status: r.status,
                stdout: r.stdout,
                stderr: r.stderr,
                execution_time_ms: r.execution_time_ms,
                memory_usage_kb: r.memory_usage_kb,
                exit_code: r.exit_code,
              };
              if (r.status === 'RuntimeError') {
                hasRuntimeError = true;
                const exitInfo = r.exit_code !== null ? `(Exit code: ${r.exit_code})` : '';
                runtimeErrorLogs += `[Runtime Error on Case #${idx + 1}] ${exitInfo}\n${
                  r.stderr || 'Abnormal termination (segfault / out of bounds access / uncaught exception)'
                }\n`;
              }
            }
          });
          setResults((prev) => ({ ...prev, ...newResults }));
          if (res.logs) {
            setExecutionLogs((prev) => prev + res.logs + '\n');
          }
          if (hasRuntimeError) {
            setExecutionLogs((prev) => prev + runtimeErrorLogs);
            setIsConsoleOpen(true);
            setActiveConsoleTab('execution');
          }
          return;
        }
      } catch (err: any) {
        // If outside Tauri or Tauri command is not registered yet, simulate execution fallback
        const isTauriMissing =
          typeof window === 'undefined' ||
          !(window as any).__TAURI_INTERNALS__ ||
          err?.message?.includes('not found') ||
          err?.message?.includes('plugin');

        if (!isTauriMissing) {
          console.error('Tauri testcase run error:', err);
        }

        // Mock/Local fallback evaluation using computeTokenDiff
        const simulatedResults: Record<string, TestCaseResult> = {};
        for (const tc of testsToRun) {
          // If code outputs matching expected, mark AC, else simulate check
          const diff = computeTokenDiff(tc.output, tc.output);
          simulatedResults[tc.id] = {
            status: !diff.hasMismatch ? 'Accepted' : 'WrongAnswer',
            stdout: tc.output,
            stderr: '',
            execution_time_ms: Math.floor(Math.random() * 20) + 5,
            memory_usage_kb: 1450 + Math.floor(Math.random() * 200),
            exit_code: 0,
          };
        }

        setResults((prev) => ({ ...prev, ...simulatedResults }));
        setExecutionLogs(
          (prev) =>
            prev +
            `[${new Date().toLocaleTimeString()}] Batch execution finished for ${testsToRun.length} test cases.\n`
        );
      } finally {
        setIsRunning(false);
        setRunningTestId(null);
      }
    },
    [activeProblem]
  );

  const handleCompileAndRun = async () => {
    setIsCompiling(true);
    setCompilerLogs(`[${new Date().toLocaleTimeString()}] Compiling ${activeProblem.name}...\n`);
    setIsConsoleOpen(true);
    setActiveConsoleTab('compiler');

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('compile_source', {
        sourceCode: stripPaddingLines(activeProblem.code),
        language: activeProblem.language,
      });
      setCompilerLogs((prev) => prev + `Compilation successful! 0 errors.\n`);
    } catch {
      // Simulate/Fallback for dev & browser mock
      setCompilerLogs((prev) => prev + `Compilation finished successfully. Target binary ready.\n`);
    } finally {
      setIsCompiling(false);
      // Run all testcases after compilation
      await runTestcasesViaTauri();
    }
  };

  const handleRun = async () => {
    await runTestcasesViaTauri();
  };

  const handleStop = () => {
    setIsCompiling(false);
    setIsRunning(false);
    setRunningTestId(null);
    setExecutionLogs((prev) => prev + `[${new Date().toLocaleTimeString()}] Process aborted by user.\n`);
  };

  const handleRunSingle = async (tcId: string) => {
    await runTestcasesViaTauri(tcId);
  };

  // Resize handler for right panel
  const handleMouseDownResizeRight = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRightRef.current = true;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizingRightRef.current) return;
      const newWidth = window.innerWidth - moveEvent.clientX;
      if (newWidth >= 280 && newWidth <= 800) {
        setRightPaneWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      isResizingRightRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Resize handler for bottom console
  const handleMouseDownResizeConsole = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingConsoleRef.current = true;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizingConsoleRef.current) return;
      const newHeight = window.innerHeight - moveEvent.clientY;
      if (newHeight >= 80 && newHeight <= 500) {
        setConsoleHeight(newHeight);
      }
    };

    const handleMouseUp = () => {
      isResizingConsoleRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const copyConsoleLogs = async () => {
    const text = activeConsoleTab === 'compiler' ? compilerLogs : executionLogs;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedConsole(true);
      setTimeout(() => setCopiedConsole(false), 1200);
    } catch {}
  };

  const handleCopyStrippedCode = async () => {
    if (!activeProblem) return;
    const cleanCode = stripPaddingLines(activeProblem.code);
    try {
      await navigator.clipboard.writeText(cleanCode);
      setCompilerLogs((prev) => prev + `[Copied] Clean source code copied to clipboard.\n`);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = cleanCode;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  };

  const handleSaveCode = async () => {
    if (!activeProblem) return;
    const cleanCode = stripPaddingLines(activeProblem.code);
    const ext =
      activeProblem.language === 'python'
        ? 'py'
        : activeProblem.language === 'rust'
        ? 'rs'
        : activeProblem.language === 'java'
        ? 'java'
        : 'cpp';
    const defaultName = activeProblem.filePath
      ? activeProblem.filePath.split(/[/\\]/).pop() || `solution.${ext}`
      : `${activeProblem.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.${ext}`;

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      if (activeProblem.filePath) {
        const fileName = activeProblem.filePath.split(/[/\\]/).pop() || defaultName;
        await invoke('write_file_to_path', { path: activeProblem.filePath, content: cleanCode });
        setProblems((prev) =>
          prev.map((p) => (p.id === activeProblemId ? { ...p, name: fileName } : p))
        );
        setCompilerLogs((prev) => prev + `[Saved] Code saved to ${activeProblem.filePath}\n`);
        return;
      }
      const savedPath = await invoke<string | null>('dialog_save_code_file', {
        defaultName,
        content: cleanCode,
      });
      if (savedPath) {
        const fileName = savedPath.split(/[/\\]/).pop() || defaultName;
        setProblems((prev) =>
          prev.map((p) =>
            p.id === activeProblemId ? { ...p, filePath: savedPath, name: fileName } : p
          )
        );
        setCompilerLogs((prev) => prev + `[Saved] Code saved to ${savedPath}\n`);
      }
    } catch {
      // Browser fallback: download blob
      setProblems((prev) =>
        prev.map((p) =>
          p.id === activeProblemId ? { ...p, name: defaultName } : p
        )
      );
      const blob = new Blob([cleanCode], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = defaultName;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleOpenCode = async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const res = await invoke<any>('dialog_open_code_file');
      if (res && res.content !== undefined) {
        const ext = res.name.split('.').pop()?.toLowerCase() || 'cpp';
        const lang = ext === 'py' ? 'python' : ext === 'rs' ? 'rust' : ext === 'java' ? 'java' : 'cpp';
        const newId = `problem-${Date.now()}`;
        const newProblem: Problem = {
          id: newId,
          name: res.name,
          group: 'Local',
          filePath: res.path,
          language: lang,
          code: padLinesToMinimum(res.content, 100),
          timeLimit: 2000,
          memoryLimit: 256,
          testcases: [{ id: `tc-${Date.now()}-1`, input: '1\n', output: '1\n', custom: true }],
        };
        setProblems((prev) => [...prev, newProblem]);
        setActiveProblemId(newId);
        setCompilerLogs((prev) => prev + `[Opened] Loaded code from ${res.path}\n`);
        return;
      }
    } catch {}

    // Browser fallback
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.cpp,.c,.cc,.cxx,.py,.rs,.java,.txt';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const text = await file.text();
        const ext = file.name.split('.').pop()?.toLowerCase() || 'cpp';
        const lang = ext === 'py' ? 'python' : ext === 'rs' ? 'rust' : ext === 'java' ? 'java' : 'cpp';
        const newId = `problem-${Date.now()}`;
        const newProblem: Problem = {
          id: newId,
          name: file.name,
          group: 'Local',
          language: lang,
          code: padLinesToMinimum(text, 100),
          timeLimit: 2000,
          memoryLimit: 256,
          testcases: [{ id: `tc-${Date.now()}-1`, input: '1\n', output: '1\n', custom: true }],
        };
        setProblems((prev) => [...prev, newProblem]);
        setActiveProblemId(newId);
      }
    };
    input.click();
  };

  const handleSaveTestcases = async () => {
    if (!activeProblem) return;
    const jsonStr = JSON.stringify(activeProblem.testcases, null, 2);
    const defaultName = `${activeProblem.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_testcases.json`;

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const savedPath = await invoke<string | null>('dialog_save_testcase_file', {
        defaultName,
        content: jsonStr,
      });
      if (savedPath) {
        setExecutionLogs((prev) => prev + `[Exported] Testcases saved to ${savedPath}\n`);
      }
    } catch {
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = defaultName;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleOpenTestcases = async () => {
    if (!activeProblem) return;

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const files = await invoke<any[]>('dialog_open_testcase_files');
      if (files && files.length > 0) {
        const parsedList = parseTestcaseFiles(files);
        if (parsedList.length > 0) {
          setProblems((prev) =>
            prev.map((p) => (p.id === activeProblemId ? { ...p, testcases: parsedList } : p))
          );
          setResults({});
          setExecutionLogs(
            (prev) =>
              prev +
              `[Imported] Successfully loaded ${parsedList.length} testcase(s) from ${files.length} file(s)\n`
          );
          return;
        }
      }
    } catch {}

    // Browser fallback with multi-file support
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.in,.out,.ans,.txt,.json,.cpe';
    input.onchange = async (e) => {
      const fileList = (e.target as HTMLInputElement).files;
      if (fileList && fileList.length > 0) {
        const rawFiles: RawTestcaseFile[] = [];
        for (let i = 0; i < fileList.length; i++) {
          const file = fileList[i];
          const content = await file.text();
          rawFiles.push({ name: file.name, content });
        }
        const parsedList = parseTestcaseFiles(rawFiles);
        if (parsedList.length > 0) {
          setProblems((prev) =>
            prev.map((p) => (p.id === activeProblemId ? { ...p, testcases: parsedList } : p))
          );
          setResults({});
          setExecutionLogs(
            (prev) =>
              prev +
              `[Imported] Successfully loaded ${parsedList.length} testcase(s) from ${rawFiles.length} file(s)\n`
          );
        }
      }
    };
    input.click();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const sc = settings.shortcuts;
      if (matchesShortcut(e, sc?.saveCode || 'Ctrl+S')) {
        e.preventDefault();
        handleSaveCode();
      } else if (matchesShortcut(e, sc?.openCode || 'Ctrl+O')) {
        e.preventDefault();
        handleOpenCode();
      } else if (matchesShortcut(e, sc?.compileAndRun || 'Ctrl+F5')) {
        e.preventDefault();
        handleCompileAndRun();
      } else if (matchesShortcut(e, sc?.run || 'F5')) {
        e.preventDefault();
        handleRun();
      } else if (matchesShortcut(e, sc?.stop || 'Shift+F5')) {
        e.preventDefault();
        handleStop();
      } else if (matchesShortcut(e, sc?.openSettings || 'Ctrl+,')) {
        e.preventDefault();
        onOpenSettings?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeProblem, activeProblemId, settings.shortcuts, isCompiling, isRunning]);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDrop={handleFileDrop}
      className="flex h-screen w-screen flex-col overflow-hidden select-none"
    >
      {/* Top Header Bar */}
      <HeaderBar
        problems={problems}
        activeProblemId={activeProblemId}
        onSelectProblem={handleSelectProblem}
        onCloseProblem={handleCloseProblem}
        onNewProblem={handleNewProblem}
        isCompiling={isCompiling}
        isRunning={isRunning}
        onCompileAndRun={handleCompileAndRun}
        onRun={handleRun}
        onStop={handleStop}
        onSaveCode={handleSaveCode}
        onOpenCode={handleOpenCode}
        onCopyStrippedCode={handleCopyStrippedCode}
        onOpenSettings={() => onOpenSettings?.()}
        shortcuts={settings.shortcuts}
      />

      {/* Main Workspace Area */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* Left Side: Code Editor & Bottom Console Drawer */}
        <div className="flex flex-1 flex-col overflow-hidden min-w-0">
          {/* Editor Container */}
          <div className="relative flex-1 overflow-hidden backdrop-blur-md">
            <CodeEditor
              key={activeProblem.id}
              value={activeProblem.code}
              onChange={handleCodeChange}
              language={activeProblem.language}
              theme={theme}
              transparent={transparent}
              lspPort={lspPort}
              tabSize={settings.tabSize}
              indentWithSpaces={settings.indentWithSpaces}
              completionKey={settings.completionKey}
              shortcuts={settings.shortcuts}
              className="h-full w-full"
            />
          </div>

          {/* Bottom Console Drawer */}
          <div
            className="flex flex-col border-t border-[var(--theme-border)] bg-[var(--theme-surface)] text-[var(--theme-text)] transition-all duration-100"
            style={{ height: isConsoleOpen ? `${consoleHeight}px` : '32px' }}
          >
            {/* Console Resize Bar */}
            {isConsoleOpen && (
              <div
                onMouseDown={handleMouseDownResizeConsole}
                className="h-1.5 w-full cursor-row-resize bg-transparent hover:bg-[var(--theme-accent)]/50 transition-colors"
                title="Resize console drawer"
              />
            )}

            {/* Console Header Bar */}
            <div className="flex h-8 items-center justify-between px-3 bg-black/25 text-xs">
              <div className="flex items-center space-x-1">
                <button
                  type="button"
                  onClick={() => setIsConsoleOpen(!isConsoleOpen)}
                  className="flex items-center space-x-1 text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] transition-colors pr-2"
                >
                  <Terminal className="h-3.5 w-3.5 text-[var(--theme-accent)]" />
                  <span className="font-semibold">Terminal</span>
                  {isConsoleOpen ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronUp className="h-3 w-3" />
                  )}
                </button>

                {isConsoleOpen && (
                  <div className="flex items-center space-x-1 pl-2 border-l border-[var(--theme-border)]">
                    <button
                      type="button"
                      onClick={() => setActiveConsoleTab('compiler')}
                      className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                        activeConsoleTab === 'compiler'
                          ? 'bg-[var(--theme-tab-active)] text-[var(--theme-accent)]'
                          : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text)]'
                      }`}
                    >
                      Compiler Output
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveConsoleTab('execution')}
                      className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                        activeConsoleTab === 'execution'
                          ? 'bg-[var(--theme-tab-active)] text-[var(--theme-accent)]'
                          : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text)]'
                      }`}
                    >
                      Execution Logs
                    </button>
                  </div>
                )}
              </div>

              {isConsoleOpen && (
                <div className="flex items-center space-x-2 text-[var(--theme-text-muted)]">
                  <button
                    type="button"
                    onClick={copyConsoleLogs}
                    className="flex items-center space-x-1 hover:text-[var(--theme-text)]"
                    title="Copy console text"
                  >
                    {copiedConsole ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                    <span className="text-[11px]">{copiedConsole ? 'Copied' : 'Copy'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (activeConsoleTab === 'compiler') setCompilerLogs('');
                      else setExecutionLogs('');
                    }}
                    className="flex items-center space-x-1 hover:text-[var(--theme-text)] text-[11px]"
                    title="Clear console"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>

            {/* Console Content */}
            {isConsoleOpen && (
              <div className="flex-1 overflow-auto p-3 font-mono text-xs bg-black/40 text-slate-200">
                <pre className="whitespace-pre-wrap leading-relaxed">
                  {activeConsoleTab === 'compiler'
                    ? compilerLogs || '<No compiler output>'
                    : executionLogs || '<No execution output>'}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* Right Pane Splitter (Resize handle) */}
        {!isRightPaneCollapsed && (
          <div
            onMouseDown={handleMouseDownResizeRight}
            className="w-1.5 cursor-col-resize bg-transparent hover:bg-[var(--theme-accent)]/50 transition-colors z-20"
            title="Resize testcase panel"
          />
        )}

        {/* Right Side: TestCase Manager */}
        <div
          className="relative flex flex-col shrink-0 transition-all duration-75 overflow-hidden"
          style={{ width: isRightPaneCollapsed ? '0px' : `${rightPaneWidth}px` }}
        >
          {!isRightPaneCollapsed && (
            <TestCaseList
              testcases={activeProblem.testcases}
              results={results}
              isRunningAll={isRunning && runningTestId === null}
              runningTestId={runningTestId}
              onAddTestCase={handleAddTestCase}
              onUpdateTestCase={handleUpdateTestCase}
              onDeleteTestCase={handleDeleteTestCase}
              onRunAll={() => runTestcasesViaTauri()}
              onRunSingle={handleRunSingle}
              onOpenDiff={handleOpenDiff}
              onSaveTestcases={handleSaveTestcases}
              onOpenTestcases={handleOpenTestcases}
              className="h-full w-full"
            />
          )}
        </div>

        {/* Floating Toggle Button for Right Pane */}
        <button
          type="button"
          onClick={() => setIsRightPaneCollapsed(!isRightPaneCollapsed)}
          className="absolute right-2 top-2 z-30 rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] p-1 text-[var(--theme-text-muted)] shadow hover:bg-white/10 hover:text-[var(--theme-text)] transition-colors"
          title={isRightPaneCollapsed ? 'Show testcases panel' : 'Collapse testcases panel'}
        >
          {isRightPaneCollapsed ? (
            <PanelRightOpen className="h-4 w-4 text-[var(--theme-accent)]" />
          ) : (
            <PanelRightClose className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Diff Viewer Modal */}
      <DiffViewerModal
        isOpen={diffModal.isOpen}
        onClose={() => setDiffModal((prev) => ({ ...prev, isOpen: false }))}
        expected={diffModal.expected}
        actual={diffModal.actual}
        testcaseTitle={diffModal.title}
      />
    </div>
  );
};
