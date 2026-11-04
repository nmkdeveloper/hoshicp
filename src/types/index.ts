export interface TestCase {
  id: string;
  input: string;
  output: string;
  custom?: boolean;
}

export type TestcaseStatus =
  | 'Accepted'
  | 'WrongAnswer'
  | 'TimeLimitExceeded'
  | 'MemoryLimitExceeded'
  | 'RuntimeError'
  | 'CompilationError'
  | 'Running'
  | 'Pending';

export interface TestCaseResult {
  stdout?: string;
  stderr?: string;
  exit_code?: number | null;
  execution_time_ms?: number;
  memory_usage_kb?: number;
  status: TestcaseStatus | string;
}

export interface Problem {
  id: string;
  name: string;
  group: string;
  url?: string;
  filePath?: string;
  language: 'cpp' | 'rust' | 'python' | 'java' | string;
  code: string;
  timeLimit: number; // in ms
  memoryLimit: number; // in MB
  testcases: TestCase[];
}

export function padLinesToMinimum(code: string, minLines = 100): string {
  const lineCount = code.split('\n').length;
  if (lineCount < minLines) {
    return code + '\n'.repeat(minLines - lineCount);
  }
  return code;
}

export function stripPaddingLines(code: string): string {
  const trimmed = code.replace(/[\r\n\s]+$/, '');
  return trimmed.length > 0 ? trimmed + '\n' : '';
}
