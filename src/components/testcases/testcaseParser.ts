import type { TestCase } from '../../types';

export interface RawTestcaseFile {
  name: string;
  content: string;
  path?: string;
}

/**
 * Parses raw files (.json, .cpe, .in, .out, .ans, .txt) into structured TestCase objects.
 * Supports multi-file pairing (e.g. 1.in with 1.out, test.in with test.ans).
 */
export function parseTestcaseFiles(files: RawTestcaseFile[]): TestCase[] {
  if (!files || files.length === 0) return [];

  const results: TestCase[] = [];
  const inMap: Map<string, string> = new Map();
  const outMap: Map<string, string> = new Map();
  const otherFiles: RawTestcaseFile[] = [];

  for (const file of files) {
    const trimmed = file.content;
    const lowerName = file.name.toLowerCase();

    // 1. JSON / CPE structured files
    if (lowerName.endsWith('.json') || lowerName.endsWith('.cpe')) {
      try {
        const parsed = JSON.parse(trimmed);
        const extracted = extractTestcasesFromJson(parsed);
        if (extracted.length > 0) {
          results.push(...extracted);
          continue;
        }
      } catch {
        // If JSON parse fails, treat as raw text
      }
    }

    // 2. Classify by extension or prefix (.in, .out, .ans, .txt)
    const dotIdx = file.name.lastIndexOf('.');
    const ext = dotIdx !== -1 ? file.name.slice(dotIdx + 1).toLowerCase() : '';
    const baseStem = dotIdx !== -1 ? file.name.slice(0, dotIdx) : file.name;

    // Check if input
    if (ext === 'in' || baseStem.toLowerCase().startsWith('input') || baseStem.toLowerCase().startsWith('in_')) {
      const stem = normalizeStem(baseStem, 'input');
      inMap.set(stem, trimmed);
    } else if (
      ext === 'out' ||
      ext === 'ans' ||
      baseStem.toLowerCase().startsWith('output') ||
      baseStem.toLowerCase().startsWith('out_') ||
      baseStem.toLowerCase().startsWith('ans_')
    ) {
      const stem = normalizeStem(baseStem, 'output');
      outMap.set(stem, trimmed);
    } else {
      otherFiles.push(file);
    }
  }

  // Pair up inputs and outputs by stem
  const allStems = new Set([...inMap.keys(), ...outMap.keys()]);
  const sortedStems = Array.from(allStems).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  );

  for (const stem of sortedStems) {
    const input = inMap.get(stem) ?? '';
    const output = outMap.get(stem) ?? '';
    results.push({
      id: `tc-imported-${Date.now()}-${results.length + 1}`,
      input,
      output,
      custom: true,
    });
  }

  // Handle any other unstructured files (e.g. single .txt or raw text input)
  for (const other of otherFiles) {
    results.push({
      id: `tc-imported-${Date.now()}-${results.length + 1}`,
      input: other.content,
      output: '',
      custom: true,
    });
  }

  return results;
}

function normalizeStem(rawStem: string, kind: 'input' | 'output'): string {
  let s = rawStem;
  if (kind === 'input') {
    s = s.replace(/^(input|in)[-_]?/i, '');
  } else {
    s = s.replace(/^(output|out|ans)[-_]?/i, '');
  }
  return s.trim() || rawStem;
}

function extractTestcasesFromJson(parsed: any): TestCase[] {
  const list: TestCase[] = [];
  if (Array.isArray(parsed)) {
    parsed.forEach((item, idx) => {
      if (item && (item.input !== undefined || item.output !== undefined)) {
        list.push({
          id: item.id || `tc-json-${Date.now()}-${idx + 1}`,
          input: String(item.input ?? ''),
          output: String(item.output ?? ''),
          custom: true,
        });
      }
    });
  } else if (parsed && typeof parsed === 'object') {
    const candidateArray = parsed.testcases || parsed.tests || parsed.cases;
    if (Array.isArray(candidateArray)) {
      candidateArray.forEach((item: any, idx: number) => {
        if (item && (item.input !== undefined || item.output !== undefined)) {
          list.push({
            id: item.id || `tc-json-${Date.now()}-${idx + 1}`,
            input: String(item.input ?? ''),
            output: String(item.output ?? ''),
            custom: true,
          });
        }
      });
    }
  }
  return list;
}
