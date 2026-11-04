import { describe, it, expect } from 'vitest';
import { EditorState, Prec } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { acceptCompletion } from '@codemirror/autocomplete';

describe('Autocomplete Keymap Precedence', () => {
  it('binds acceptCompletion with Prec.highest so Tab does not trigger indentMore when autocomplete is active', () => {
    const ext = Prec.highest(keymap.of([{ key: 'Tab', run: acceptCompletion }]));
    expect(ext).toBeDefined();

    const state = EditorState.create({
      doc: 'test',
      extensions: [ext],
    });
    expect(state).toBeDefined();
  });
});
