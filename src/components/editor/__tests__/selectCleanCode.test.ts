import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { selectCleanCode } from '../CodeEditor';

describe('selectCleanCode StateCommand', () => {
  it('selects only the stripped code area and excludes trailing blank padding lines', () => {
    const raw = 'int main() {\n  return 0;\n}\n\n\n\n\n\n';
    const state = EditorState.create({
      doc: raw,
    });

    let updatedSelection: any = null;
    const dispatch = (tr: any) => {
      updatedSelection = tr.newSelection;
    };

    const res = selectCleanCode({ state, dispatch });
    expect(res).toBe(true);
    expect(updatedSelection).toBeDefined();

    const cleanLength = 'int main() {\n  return 0;\n}'.length;
    expect(updatedSelection.main.anchor).toBe(0);
    expect(updatedSelection.main.head).toBe(cleanLength);
  });
});
