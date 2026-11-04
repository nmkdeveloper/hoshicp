import { describe, it, expect } from 'vitest';
import { getExitCodeDiagnosis } from '../errorDiagnostics';

describe('Error Diagnostics (CodeBlocks style)', () => {
  it('diagnoses 0xC0000005 as Access Violation / Segmentation Fault', () => {
    // -1073741819 is 0xC0000005 in signed 32-bit
    const diag = getExitCodeDiagnosis(-1073741819);
    expect(diag).toBeDefined();
    expect(diag?.name).toBe('STATUS_ACCESS_VIOLATION');
    expect(diag?.title).toContain('Segmentation Fault');
    expect(diag?.causes.some((c) => c.includes('Array index out of bounds'))).toBe(true);
  });

  it('diagnoses 0xC00000FD as Stack Overflow', () => {
    const diag = getExitCodeDiagnosis(-1073741571);
    expect(diag).toBeDefined();
    expect(diag?.name).toBe('STATUS_STACK_OVERFLOW');
    expect(diag?.causes.some((c) => c.includes('recursion'))).toBe(true);
  });

  it('diagnoses 0xC0000094 as Integer Division by Zero', () => {
    const diag = getExitCodeDiagnosis(-1073741676);
    expect(diag).toBeDefined();
    expect(diag?.name).toBe('STATUS_INTEGER_DIVIDE_BY_ZERO');
  });

  it('diagnoses POSIX signal 11 / 139 as SIGSEGV', () => {
    const diag = getExitCodeDiagnosis(139);
    expect(diag).toBeDefined();
    expect(diag?.name).toBe('SIGSEGV');
  });

  it('returns null for exit code 0 or null', () => {
    expect(getExitCodeDiagnosis(0)).toBeNull();
    expect(getExitCodeDiagnosis(null)).toBeNull();
    expect(getExitCodeDiagnosis(undefined)).toBeNull();
  });
});
