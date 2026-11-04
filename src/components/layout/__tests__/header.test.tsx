import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { HeaderBar } from '../HeaderBar';
import { ThemeProvider } from '../../theme/ThemeManager';

describe('HeaderBar Component', () => {
  it('renders mascot, problem tabs, and action buttons', () => {
    const html = renderToString(
      <ThemeProvider>
        <HeaderBar
          problems={[
            {
              id: 'p-1',
              name: 'A. Watermelon',
              group: 'Codeforces',
              language: 'cpp',
              code: '',
              timeLimit: 1000,
              memoryLimit: 256,
              testcases: [],
            },
            {
              id: 'p-2',
              name: 'B. Before an Exam',
              group: 'Codeforces',
              language: 'cpp',
              code: '',
              timeLimit: 1000,
              memoryLimit: 256,
              testcases: [],
            },
          ]}
          activeProblemId="p-1"
          onSelectProblem={() => {}}
          onCloseProblem={() => {}}
          onNewProblem={() => {}}
          onCompileAndRun={() => {}}
          onRun={() => {}}
          onStop={() => {}}
          onOpenSettings={() => {}}
        />
      </ThemeProvider>
    );

    expect(html).toContain('HoshiCP');
    expect(html).toContain('icon.png');
    expect(html).toContain('A. Watermelon');
    expect(html).toContain('B. Before an Exam');
    expect(html).toContain('Compile &amp; Run');
    expect(html).toContain('Run');
    expect(html).toContain('Stop');
  });
});
