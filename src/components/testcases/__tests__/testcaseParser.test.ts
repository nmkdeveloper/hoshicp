import { describe, it, expect } from 'vitest';
import { parseTestcaseFiles } from '../testcaseParser';

describe('Testcase Parser', () => {
  it('parses single .in file without error and sets input', () => {
    const files = [{ name: 'sample.in', content: '5\n1 2 3 4 5\n' }];
    const parsed = parseTestcaseFiles(files);
    expect(parsed.length).toBe(1);
    expect(parsed[0].input).toBe('5\n1 2 3 4 5\n');
    expect(parsed[0].output).toBe('');
  });

  it('pairs multiple .in and .out files by stem', () => {
    const files = [
      { name: '1.in', content: '10' },
      { name: '2.out', content: 'YES' },
      { name: '1.out', content: 'NO' },
      { name: '2.in', content: '20' },
    ];
    const parsed = parseTestcaseFiles(files);
    expect(parsed.length).toBe(2);
    expect(parsed[0].input).toBe('10');
    expect(parsed[0].output).toBe('NO');
    expect(parsed[1].input).toBe('20');
    expect(parsed[1].output).toBe('YES');
  });

  it('pairs input_01.txt and output_01.txt files', () => {
    const files = [
      { name: 'input_01.txt', content: '3 5' },
      { name: 'output_01.txt', content: '8' },
    ];
    const parsed = parseTestcaseFiles(files);
    expect(parsed.length).toBe(1);
    expect(parsed[0].input).toBe('3 5');
    expect(parsed[0].output).toBe('8');
  });

  it('extracts testcases from JSON and CPE arrays', () => {
    const files = [
      {
        name: 'problem.json',
        content: JSON.stringify([
          { input: '4', output: 'YES' },
          { input: '5', output: 'NO' },
        ]),
      },
    ];
    const parsed = parseTestcaseFiles(files);
    expect(parsed.length).toBe(2);
    expect(parsed[0].input).toBe('4');
    expect(parsed[1].output).toBe('NO');
  });
});
