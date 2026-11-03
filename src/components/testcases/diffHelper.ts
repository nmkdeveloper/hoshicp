export interface DiffSpan {
  line: number;
  col: number;
  actual: string;
  expected: string;
}

export interface DiffLine {
  lineNumber: number;
  expected: string;
  actual: string;
  status: 'match' | 'mismatch' | 'missing' | 'extra';
}

export interface UnifiedDiffLine {
  lineNumExpected?: number;
  lineNumActual?: number;
  type: 'same' | 'added' | 'deleted';
  text: string;
}

export interface TokenDiffResult {
  hasMismatch: boolean;
  mismatchLine?: number;
  mismatchCol?: number;
  actualToken?: string;
  expectedToken?: string;
  lines: DiffLine[];
  unified: UnifiedDiffLine[];
}

interface Token {
  text: string;
  line: number;
  col: number;
}

function tokenize(input: string): { tokens: Token[]; endLine: number; endCol: number } {
  const normalized = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const tokens: Token[] = [];
  let line = 1;
  let col = 1;
  let currentStart: { text: string; line: number; col: number } | null = null;

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    const isWhitespace = /\s/.test(ch);

    if (isWhitespace) {
      if (currentStart) {
        tokens.push(currentStart);
        currentStart = null;
      }
      if (ch === '\n') {
        line += 1;
        col = 1;
      } else {
        col += 1;
      }
    } else {
      if (!currentStart) {
        currentStart = { text: ch, line, col };
      } else {
        currentStart.text += ch;
      }
      col += 1;
    }
  }

  if (currentStart) {
    tokens.push(currentStart);
  }

  return { tokens, endLine: line, endCol: col };
}

/**
 * Computes token-level and line-level diff between actual and expected strings.
 */
export function computeTokenDiff(actual: string, expected: string): TokenDiffResult {
  const normActual = (actual ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const normExpected = (expected ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const act = tokenize(normActual);
  const exp = tokenize(normExpected);

  let hasMismatch = false;
  let mismatchLine: number | undefined;
  let mismatchCol: number | undefined;
  let actualToken: string | undefined;
  let expectedToken: string | undefined;

  const minTokens = Math.min(act.tokens.length, exp.tokens.length);

  for (let i = 0; i < minTokens; i++) {
    const tAct = act.tokens[i];
    const tExp = exp.tokens[i];
    if (tAct.text !== tExp.text) {
      hasMismatch = true;
      mismatchLine = tAct.line;
      mismatchCol = tAct.col;
      actualToken = tAct.text;
      expectedToken = tExp.text;
      break;
    }
  }

  if (!hasMismatch) {
    if (act.tokens.length < exp.tokens.length) {
      const nextExp = exp.tokens[act.tokens.length];
      hasMismatch = true;
      mismatchLine = nextExp.line;
      mismatchCol = nextExp.col;
      actualToken = '<EOF>';
      expectedToken = nextExp.text;
    } else if (act.tokens.length > exp.tokens.length) {
      const nextAct = act.tokens[exp.tokens.length];
      hasMismatch = true;
      mismatchLine = nextAct.line;
      mismatchCol = nextAct.col;
      actualToken = nextAct.text;
      expectedToken = '<EOF>';
    }
  }

  // Compute side-by-side lines
  const actLines = normActual.length === 0 ? [] : normActual.split('\n');
  const expLines = normExpected.length === 0 ? [] : normExpected.split('\n');
  const maxLines = Math.max(actLines.length, expLines.length);

  const lines: DiffLine[] = [];
  const unified: UnifiedDiffLine[] = [];

  let expLineIdx = 1;
  let actLineIdx = 1;

  for (let i = 0; i < maxLines; i++) {
    const a = actLines[i];
    const e = expLines[i];

    if (a !== undefined && e !== undefined) {
      if (a === e) {
        lines.push({ lineNumber: i + 1, expected: e, actual: a, status: 'match' });
        unified.push({
          lineNumExpected: expLineIdx++,
          lineNumActual: actLineIdx++,
          type: 'same',
          text: a,
        });
      } else {
        lines.push({ lineNumber: i + 1, expected: e, actual: a, status: 'mismatch' });
        unified.push({
          lineNumExpected: expLineIdx++,
          type: 'deleted',
          text: e,
        });
        unified.push({
          lineNumActual: actLineIdx++,
          type: 'added',
          text: a,
        });
      }
    } else if (e !== undefined) {
      lines.push({ lineNumber: i + 1, expected: e, actual: '', status: 'missing' });
      unified.push({
        lineNumExpected: expLineIdx++,
        type: 'deleted',
        text: e,
      });
    } else if (a !== undefined) {
      lines.push({ lineNumber: i + 1, expected: '', actual: a, status: 'extra' });
      unified.push({
        lineNumActual: actLineIdx++,
        type: 'added',
        text: a,
      });
    }
  }

  return {
    hasMismatch,
    mismatchLine,
    mismatchCol,
    actualToken,
    expectedToken,
    lines,
    unified,
  };
}
