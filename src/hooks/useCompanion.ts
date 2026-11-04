import { useEffect } from 'react';
import { type Problem, type TestCase, padLinesToMinimum } from '../types';

export const DEFAULT_TEMPLATES: Record<string, string> = {
  cpp: `#include <iostream>
using namespace std;

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);

    // TODO: solution
    return 0;
}
`,
  rust: `use std::io::{self, Read};

fn main() {
    // TODO: solution
}
`,
  python: `import sys

def solve():
    pass

if __name__ == '__main__':
    solve()
`,
  java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        // TODO: solution
    }
}
`,
};

export function formatProblemFileName(
  name: string,
  group: string,
  ext: string,
  template = '{group}/{name}.{ext}'
): string {
  const sanitize = (str: string) => str.replace(/[<>:"|?*]/g, '_').trim();

  // Name should not introduce extra directory traversal
  const cleanName = sanitize(name).replace(/[\\/]/g, '_');
  const cleanGroup = sanitize(group);
  const cleanExt = ext.replace(/^\./, '').trim();

  return template
    .replace(/\{name\}|\$\{name\}|\$\{PROBLEM_NAME\}/gi, cleanName)
    .replace(/\{group\}|\$\{group\}|\$\{GROUP\}/gi, cleanGroup)
    .replace(/\{ext\}|\$\{ext\}|\$\{EXT\}/gi, cleanExt);
}

export interface UseCompanionOptions {
  onNewProblem: (problem: Problem) => void;
  pathTemplate?: string;
  defaultLanguage?: string;
  templates?: Record<string, string>;
}

export function useCompanion({
  onNewProblem,
  pathTemplate = '{group}/{name}.{ext}',
  defaultLanguage = 'cpp',
  templates = DEFAULT_TEMPLATES,
}: UseCompanionOptions): void {
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let isCancelled = false;

    const setupListener = async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        const unsub = await listen<any>('companion:new_problem', (event) => {
          if (isCancelled) return;
          const payload = event.payload;
          if (!payload) return;

          const pMeta = payload.problem || payload;
          const name = pMeta.name || 'Untitled Problem';
          const group = pMeta.group || 'Contest';
          const url = pMeta.url || '';
          const timeLimit = Number(pMeta.time_limit || pMeta.timeLimit || 2000);
          const memoryLimit = Number(pMeta.memory_limit || pMeta.memoryLimit || 256);

          const rawTests = payload.testcases || payload.tests || [];
          const testcases: TestCase[] = rawTests.map((t: any, idx: number) => ({
            id: t.id ? String(t.id) : `tc-${idx + 1}`,
            input: typeof t.input === 'string' ? t.input : '',
            output: typeof t.output === 'string' ? t.output : '',
            custom: false,
          }));

          const ext =
            defaultLanguage === 'rust'
              ? 'rs'
              : defaultLanguage === 'python'
                ? 'py'
                : defaultLanguage === 'java'
                  ? 'java'
                  : 'cpp';

          const filePath = formatProblemFileName(name, group, ext, pathTemplate);
          const baseTemplate = templates[defaultLanguage] || DEFAULT_TEMPLATES[defaultLanguage] || '';
          const rawCode = baseTemplate
            .replace(/\$\{PROBLEM_NAME\}/g, name)
            .replace(/\$\{DATE\}/g, new Date().toLocaleDateString());
          const code = padLinesToMinimum(rawCode, 40);

          const newProblem: Problem = {
            id: `problem-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            name,
            group,
            url,
            filePath,
            language: defaultLanguage,
            code,
            timeLimit,
            memoryLimit,
            testcases,
          };

          onNewProblem(newProblem);
        });

        if (isCancelled) {
          unsub();
        } else {
          unlisten = unsub;
        }
      } catch {
        // Outside Tauri runtime (e.g. web mock/vitest), ignore
      }
    };

    setupListener();

    return () => {
      isCancelled = true;
      if (unlisten) {
        unlisten();
      }
    };
  }, [onNewProblem, pathTemplate, defaultLanguage, templates]);
}
