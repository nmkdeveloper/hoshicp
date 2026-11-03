import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { StressTestingPanel } from '../StressTestingPanel';

describe('StressTestingPanel Component', () => {
  it('does not render anything when isOpen is false', () => {
    const html = renderToString(
      <StressTestingPanel
        isOpen={false}
        onClose={() => {}}
      />
    );
    expect(html).toBe('');
  });

  it('renders modal dialog with form inputs when isOpen is true', () => {
    const html = renderToString(
      <StressTestingPanel
        isOpen={true}
        onClose={() => {}}
        activeProblem={{
          id: 'p-1',
          name: 'Watermelon',
          group: 'CF',
          filePath: 'Codeforces/Watermelon.cpp',
          language: 'cpp',
          code: '',
          timeLimit: 1500,
          memoryLimit: 128,
          testcases: [],
        }}
      />
    );

    expect(html).toContain('Stress Testing Engine');
    expect(html).toContain('Testcase Generator');
    expect(html).toContain('Model / Brute Force Solution');
    expect(html).toContain('Candidate / Target Solution');
    expect(html).toContain('Max Iterations');
    expect(html).toContain('Time Limit');
    expect(html).toContain('Memory Limit');
    expect(html).toContain('Start Stress Test');
    expect(html).toContain('Codeforces/Watermelon.cpp');
  });
});
