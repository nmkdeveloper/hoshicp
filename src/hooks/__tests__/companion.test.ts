import { describe, it, expect } from 'vitest';
import { formatProblemFileName } from '../useCompanion';

describe('Companion File Path Generator', () => {
  it('formats problem file path according to template', () => {
    const path = formatProblemFileName('Watermelon', 'Codeforces', 'cpp', '{group}/{name}.{ext}');
    expect(path).toBe('Codeforces/Watermelon.cpp');
  });

  it('handles custom templates with sanitized characters', () => {
    const path = formatProblemFileName('1234A: Good / Bad ?', 'Codeforces Round #800 (Div. 2)', 'cpp', '{group}/{name}.{ext}');
    expect(path).not.toContain('?');
    expect(path).toContain('cpp');
  });

  it('substitutes problem name and group case-insensitively', () => {
    expect(formatProblemFileName('A', 'CF', 'cpp', '{group}/{name}.{ext}')).toBe('CF/A.cpp');
    expect(formatProblemFileName('B', 'AtCoder', 'rs', '${GROUP}/${PROBLEM_NAME}.${EXT}')).toBe('AtCoder/B.rs');
  });
});
