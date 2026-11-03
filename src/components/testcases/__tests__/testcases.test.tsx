import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { TestCaseItem, StatusPill } from '../TestCaseItem';
import { TestCaseList } from '../TestCaseList';
import { DiffViewerModal } from '../DiffViewerModal';

describe('TestCaseItem & StatusPill Components', () => {
  it('renders status pills correctly for each verdict', () => {
    const ac = renderToString(<StatusPill status="Accepted" />);
    expect(ac).toContain('AC');
    expect(ac).toContain('emerald');

    const wa = renderToString(<StatusPill status="WrongAnswer" />);
    expect(wa).toContain('WA');
    expect(wa).toContain('rose');

    const tle = renderToString(<StatusPill status="TimeLimitExceeded" />);
    expect(tle).toContain('TLE');
    expect(tle).toContain('amber');

    const mle = renderToString(<StatusPill status="MemoryLimitExceeded" />);
    expect(mle).toContain('MLE');
    expect(mle).toContain('orange');

    const ce = renderToString(<StatusPill status="CompilationError" />);
    expect(ce).toContain('CE');
    expect(ce).toContain('purple');

    const re = renderToString(<StatusPill status="RuntimeError" />);
    expect(re).toContain('RE');
    expect(re).toContain('red');

    const running = renderToString(<StatusPill status="Running" />);
    expect(running).toContain('Running');
    expect(running).toContain('animate-spin');

    const pending = renderToString(<StatusPill status="Pending" />);
    expect(pending).toContain('Pending');
  });

  it('renders testcase item with inputs and outputs', () => {
    const html = renderToString(
      <TestCaseItem
        testcase={{ id: 'tc-1', input: '8\n', output: 'YES\n', custom: true }}
        index={0}
        result={{
          status: 'Accepted',
          stdout: 'YES\n',
          execution_time_ms: 15,
          memory_usage_kb: 1200,
        }}
        onUpdate={() => {}}
        onDelete={() => {}}
        onRunSingle={() => {}}
        onOpenDiff={() => {}}
      />
    );

    expect(html).toContain('Case #1');
    expect(html).toContain('Custom');
    expect(html).toContain('15ms');
    expect(html).toContain('1200KB');
    expect(html).toContain('8\n');
    expect(html).toContain('YES\n');
  });
});

describe('TestCaseList Component', () => {
  it('renders empty state when no test cases', () => {
    const html = renderToString(
      <TestCaseList
        testcases={[]}
        onAddTestCase={() => {}}
        onUpdateTestCase={() => {}}
        onDeleteTestCase={() => {}}
        onRunAll={() => {}}
        onRunSingle={() => {}}
        onOpenDiff={() => {}}
      />
    );

    expect(html).toContain('No test cases available');
  });

  it('renders list with pass/fail summary badge', () => {
    const html = renderToString(
      <TestCaseList
        testcases={[
          { id: '1', input: '1', output: '1' },
          { id: '2', input: '2', output: '2' },
        ]}
        results={{
          '1': { status: 'Accepted' },
          '2': { status: 'WrongAnswer' },
        }}
        onAddTestCase={() => {}}
        onUpdateTestCase={() => {}}
        onDeleteTestCase={() => {}}
        onRunAll={() => {}}
        onRunSingle={() => {}}
        onOpenDiff={() => {}}
      />
    );

    expect(html).toContain('Test Cases');
    expect(html).toContain('1/2 Passed');
    expect(html).toContain('Case #1');
    expect(html).toContain('Case #2');
  });
});

describe('DiffViewerModal Component', () => {
  it('does not render when isOpen is false', () => {
    const html = renderToString(
      <DiffViewerModal
        isOpen={false}
        onClose={() => {}}
        expected="42"
        actual="42"
      />
    );
    expect(html).toBe('');
  });

  it('renders diff comparison when isOpen is true', () => {
    const html = renderToString(
      <DiffViewerModal
        isOpen={true}
        onClose={() => {}}
        expected={'42\n100'}
        actual={'42\n101'}
        testcaseTitle="Case #1"
      />
    );

    expect(html).toContain('Case #1 Diff');
    expect(html).toContain('Wrong Answer (Mismatch on line 2)');
    expect(html).toContain('expected');
    expect(html).toContain('100');
    expect(html).toContain('101');
    expect(html).toContain('Side by Side');
  });
});
