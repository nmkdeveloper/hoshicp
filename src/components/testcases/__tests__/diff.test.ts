import { describe, it, expect } from 'vitest';
import { computeTokenDiff } from '../diffHelper';

describe('Token Diff Computations', () => {
  it('flags mismatches between actual and expected tokens', () => {
    const diff = computeTokenDiff('42\n100', '42\n101');
    expect(diff.hasMismatch).toBe(true);
    expect(diff.mismatchLine).toBe(2);
  });

  it('detects matching outputs with different whitespace formatting', () => {
    const diff = computeTokenDiff('  42   \n 100 \n', '42 100');
    expect(diff.hasMismatch).toBe(false);
    expect(diff.mismatchLine).toBeUndefined();
  });

  it('detects missing tokens when actual is shorter than expected', () => {
    const diff = computeTokenDiff('42', '42\n99');
    expect(diff.hasMismatch).toBe(true);
    expect(diff.mismatchLine).toBe(2);
    expect(diff.actualToken).toBe('<EOF>');
    expect(diff.expectedToken).toBe('99');
  });

  it('detects extra tokens when actual is longer than expected', () => {
    const diff = computeTokenDiff('42\n99\n100', '42\n99');
    expect(diff.hasMismatch).toBe(true);
    expect(diff.mismatchLine).toBe(3);
    expect(diff.actualToken).toBe('100');
    expect(diff.expectedToken).toBe('<EOF>');
  });

  it('provides line-by-line diff structures for side-by-side display', () => {
    const diff = computeTokenDiff('apple\nbanana\ncherry', 'apple\nberry\ncherry');
    expect(diff.hasMismatch).toBe(true);
    expect(diff.lines.length).toBe(3);
    expect(diff.lines[0].status).toBe('match');
    expect(diff.lines[1].status).toBe('mismatch');
    expect(diff.lines[2].status).toBe('match');
  });
});
