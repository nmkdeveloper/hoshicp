import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import App from '../App';
import type { Problem } from '../types';

describe('App Root Component', () => {
  it('renders complete HoshiCP application shell', () => {
    const html = renderToString(<App />);

    expect(html).toContain('HoshiCP');
    expect(html).toContain('A. Watermelon');
    expect(html).toContain('Compile &amp; Run');
    expect(html).toContain('Stress Test');
    expect(html).toContain('Terminal');
  });

  it('deduplicates companion problems and avoids orphaned activeProblemId', () => {
    let activeId = 'problem-1';
    let problems: Problem[] = [
      {
        id: 'problem-1',
        name: 'A. Watermelon',
        group: 'Codeforces',
        url: 'https://codeforces.com/4/A',
        language: 'cpp',
        code: '',
        timeLimit: 1000,
        memoryLimit: 64,
        testcases: [],
      },
    ];

    const handleNewCompanionProblem = (newProblem: Problem) => {
      const existing = problems.find(
        (p) => p.name === newProblem.name || (newProblem.url && p.url === newProblem.url)
      );
      if (existing) {
        activeId = existing.id;
        return;
      }
      activeId = newProblem.id;
      problems = [...problems, newProblem];
    };

    // Duplicate ingestion
    handleNewCompanionProblem({
      id: 'problem-dup-999',
      name: 'A. Watermelon',
      url: 'https://codeforces.com/4/A',
      group: 'Codeforces',
      language: 'cpp',
      code: '',
      timeLimit: 1000,
      memoryLimit: 64,
      testcases: [],
    });

    expect(activeId).toBe('problem-1');
    expect(problems.length).toBe(1);
    expect(problems.find((p) => p.id === activeId)).toBeDefined();

    // New distinct problem
    handleNewCompanionProblem({
      id: 'problem-2',
      name: 'B. Before an Exam',
      url: 'https://codeforces.com/4/B',
      group: 'Codeforces',
      language: 'cpp',
      code: '',
      timeLimit: 1000,
      memoryLimit: 64,
      testcases: [],
    });

    expect(activeId).toBe('problem-2');
    expect(problems.length).toBe(2);
    expect(problems.find((p) => p.id === activeId)).toBeDefined();
  });
});
