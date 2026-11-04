import React, { useEffect, useRef, useState } from 'react';
import { EditorState, Compartment, Prec } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import {
  EditorView,
  lineNumbers,
  highlightActiveLineGutter,
  highlightSpecialChars,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  highlightActiveLine,
  keymap,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap, acceptCompletion } from '@codemirror/autocomplete';
import { linter, lintGutter, lintKeymap, setDiagnostics } from '@codemirror/lint';
import { bracketMatching, foldGutter, foldKeymap, indentOnInput, indentUnit } from '@codemirror/language';
import {
  search,
  highlightSelectionMatches,
  selectNextOccurrence,
  openSearchPanel,
  searchKeymap,
} from '@codemirror/search';
import { cpp } from '@codemirror/lang-cpp';
import { rust } from '@codemirror/lang-rust';
import { python } from '@codemirror/lang-python';
import { java } from '@codemirror/lang-java';
import { vim, getCM } from '@replit/codemirror-vim';

import { getThemeExtensions, type ThemeName } from './themes';
import { VimStatus } from './vimStatus';
import { LspClient } from './lspClient';
import { padLinesToMinimum, stripPaddingLines } from '../../types';
import { toCodeMirrorKey, DEFAULT_SHORTCUTS, type ShortcutMap } from '../../utils/shortcuts';

export interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  language?: 'cpp' | 'rust' | 'python' | 'java' | string;
  vimMode?: boolean;
  theme?: ThemeName;
  transparent?: boolean;
  lspPort?: number;
  className?: string;
  readOnly?: boolean;
  showStatusBar?: boolean;
  tabSize?: number;
  indentWithSpaces?: boolean;
  completionKey?: 'tab' | 'enter' | 'both';
  shortcuts?: ShortcutMap;
}

export function getLanguageExtension(lang?: string): Extension {
  switch (lang?.toLowerCase()) {
    case 'cpp':
    case 'c++':
    case 'c':
      return cpp();
    case 'rust':
    case 'rs':
      return rust();
    case 'python':
    case 'py':
      return python();
    case 'java':
      return java();
    default:
      return cpp();
  }
}

const calculateNeededLines = (height?: number): number => {
  const byHeight = height && height > 0 ? Math.ceil(height / 20) + 20 : 120;
  return Math.max(byHeight, 120);
};

export const CodeEditor: React.FC<CodeEditorProps> = ({
  value,
  onChange,
  language = 'cpp',
  vimMode = false,
  theme = 'cute-hoshino',
  transparent = true,
  lspPort,
  className = '',
  readOnly = false,
  showStatusBar = true,
  tabSize = 4,
  indentWithSpaces = true,
  completionKey = 'tab',
  shortcuts = DEFAULT_SHORTCUTS,
}) => {
  const editorContainerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const lspClientRef = useRef<LspClient | null>(null);

  // Compartments for dynamic runtime reconfiguration
  const langCompartment = useRef(new Compartment()).current;
  const themeCompartment = useRef(new Compartment()).current;
  const vimCompartment = useRef(new Compartment()).current;
  const lspCompartment = useRef(new Compartment()).current;
  const readOnlyCompartment = useRef(new Compartment()).current;
  const tabSizeCompartment = useRef(new Compartment()).current;
  const indentUnitCompartment = useRef(new Compartment()).current;
  const completionKeymapCompartment = useRef(new Compartment()).current;
  const shortcutsCompartment = useRef(new Compartment()).current;

  // Track Vim status
  const [vimState, setVimState] = useState<{
    mode: string;
    subMode?: string;
    keyBuffer?: string;
  }>({ mode: 'NORMAL' });

  // Keep latest onChange in a ref to avoid recreating extensions
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Track latest vimMode in ref to avoid stale closure in EditorView updateListener
  const vimModeRef = useRef(vimMode);
  vimModeRef.current = vimMode;

  // Setup CodeMirror instance
  useEffect(() => {
    if (!editorContainerRef.current) return;

    const getCustomKeybindings = (sc: ShortcutMap = DEFAULT_SHORTCUTS) => {
      const selectNextKey = toCodeMirrorKey(sc.selectNext || 'Ctrl+E');
      const findKey = toCodeMirrorKey(sc.find || 'Ctrl+F');
      const replaceKey = toCodeMirrorKey(sc.replace || 'Ctrl+H');

      return keymap.of([
        indentWithTab,
        {
          key: selectNextKey,
          run: selectNextOccurrence,
        },
        ...(selectNextKey !== 'Mod-d'
          ? [
              {
                key: 'Mod-d',
                run: selectNextOccurrence,
              },
            ]
          : []),
        {
          key: findKey,
          run: openSearchPanel,
        },
        {
          key: replaceKey,
          run: openSearchPanel,
        },
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...lintKeymap,
      ]);
    };

    const getCompletionKeys = (keyChoice: 'tab' | 'enter' | 'both') => {
      const keys = [];
      if (keyChoice === 'tab' || keyChoice === 'both') {
        keys.push({ key: 'Tab', run: acceptCompletion });
      }
      if (keyChoice === 'enter' || keyChoice === 'both') {
        keys.push({ key: 'Enter', run: acceptCompletion });
      }
      return Prec.highest(keymap.of(keys));
    };

    const indentString = indentWithSpaces ? ' '.repeat(tabSize) : '\t';

    const baseExtensions: Extension[] = [
      lineNumbers(),
      highlightActiveLineGutter(),
      lintGutter(),
      highlightSpecialChars(),
      history(),
      foldGutter(),
      drawSelection(),
      dropCursor(),
      search({ top: true }),
      highlightSelectionMatches(),
      EditorState.allowMultipleSelections.of(true),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),
      shortcutsCompartment.of(getCustomKeybindings(shortcuts)),
      // Compartments
      langCompartment.of(getLanguageExtension(language)),
      themeCompartment.of(getThemeExtensions(theme, { transparent })),
      vimCompartment.of(vimMode ? vim() : []),
      lspCompartment.of(autocompletion()),
      readOnlyCompartment.of(EditorState.readOnly.of(readOnly)),
      tabSizeCompartment.of(EditorState.tabSize.of(tabSize)),
      indentUnitCompartment.of(indentUnit.of(indentString)),
      completionKeymapCompartment.of(getCompletionKeys(completionKey)),
      // Change listener and Vim state tracker
      EditorView.updateListener.of((update) => {
        if (update.docChanged && onChangeRef.current) {
          const docString = update.state.doc.toString();
          const cleanDoc = stripPaddingLines(docString);
          onChangeRef.current(cleanDoc);
          if (lspClientRef.current) {
            lspClientRef.current.notifyChange(cleanDoc);
          }
        }

        // Query Vim mode if active
        if (vimModeRef.current) {
          try {
            const cm = getCM(update.view);
            if (cm?.state?.vim) {
              const v = cm.state.vim;
              let mode = 'NORMAL';
              if (v.visualBlock) mode = 'VISUAL BLOCK';
              else if (v.visualLine) mode = 'VISUAL LINE';
              else if (v.visualMode) mode = 'VISUAL';
              else if (v.insertMode) mode = 'INSERT';
              else if (v.mode) mode = v.mode.toUpperCase();

              setVimState({
                mode,
                subMode: v.insertModeReturn ? 'C-O' : undefined,
                keyBuffer: v.status || '',
              });
            }
          } catch {
            // Ignore vim state query errors
          }
        }
      }),
    ];

    const needed = calculateNeededLines(editorContainerRef.current?.clientHeight);
    const initialDoc = padLinesToMinimum(value, needed);

    const state = EditorState.create({
      doc: initialDoc,
      extensions: baseExtensions,
    });

    const view = new EditorView({
      state,
      parent: editorContainerRef.current,
    });

    viewRef.current = view;

    // Dynamically adjust lines when container size changes
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && editorContainerRef.current) {
      observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const height = entry.contentRect.height;
          if (height > 0 && viewRef.current) {
            const reqLines = calculateNeededLines(height);
            const currentLines = viewRef.current.state.doc.lines;
            if (currentLines < reqLines) {
              const addCount = reqLines - currentLines;
              viewRef.current.dispatch({
                changes: {
                  from: viewRef.current.state.doc.length,
                  insert: '\n'.repeat(addCount),
                },
              });
            }
          }
        }
      });
      observer.observe(editorContainerRef.current);
    }

    return () => {
      if (observer) {
        observer.disconnect();
      }
      view.destroy();
      viewRef.current = null;
    };
  }, []); // Mount only once

  // Synchronize external value changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view || value === undefined) return;

    const currentDoc = view.state.doc.toString();
    const currentClean = stripPaddingLines(currentDoc);
    const newClean = stripPaddingLines(value);

    if (currentClean !== newClean) {
      const needed = calculateNeededLines(editorContainerRef.current?.clientHeight);
      const paddedNew = padLinesToMinimum(value, needed);
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: paddedNew },
      });
    }
  }, [value]);

  // Dynamic language updates
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: langCompartment.reconfigure(getLanguageExtension(language)),
    });
  }, [language]);

  // Dynamic theme & transparency updates
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: themeCompartment.reconfigure(getThemeExtensions(theme, { transparent })),
    });
  }, [theme, transparent]);

  // Dynamic Vim mode toggle
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: vimCompartment.reconfigure(vimMode ? vim() : []),
    });
    if (!vimMode) {
      setVimState({ mode: 'NORMAL', subMode: undefined, keyBuffer: undefined });
    }
  }, [vimMode]);

  // Dynamic Tab Size & Indentation updates
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const indentString = indentWithSpaces ? ' '.repeat(tabSize) : '\t';
    view.dispatch({
      effects: [
        tabSizeCompartment.reconfigure(EditorState.tabSize.of(tabSize)),
        indentUnitCompartment.reconfigure(indentUnit.of(indentString)),
      ],
    });
  }, [tabSize, indentWithSpaces]);

  // Dynamic Autocomplete keymap updates
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const keys = [];
    if (completionKey === 'tab' || completionKey === 'both') {
      keys.push({ key: 'Tab', run: acceptCompletion });
    }
    if (completionKey === 'enter' || completionKey === 'both') {
      keys.push({ key: 'Enter', run: acceptCompletion });
    }
    view.dispatch({
      effects: completionKeymapCompartment.reconfigure(Prec.highest(keymap.of(keys))),
    });
  }, [completionKey]);

  // Dynamic Shortcuts updates
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const selectNextKey = toCodeMirrorKey(shortcuts.selectNext || 'Ctrl+E');
    const findKey = toCodeMirrorKey(shortcuts.find || 'Ctrl+F');
    const replaceKey = toCodeMirrorKey(shortcuts.replace || 'Ctrl+H');

    view.dispatch({
      effects: shortcutsCompartment.reconfigure(
        keymap.of([
          indentWithTab,
          {
            key: selectNextKey,
            run: selectNextOccurrence,
          },
          ...(selectNextKey !== 'Mod-d'
            ? [
                {
                  key: 'Mod-d',
                  run: selectNextOccurrence,
                },
              ]
            : []),
          {
            key: findKey,
            run: openSearchPanel,
          },
          {
            key: replaceKey,
            run: openSearchPanel,
          },
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...foldKeymap,
          ...lintKeymap,
        ])
      ),
    });
  }, [shortcuts]);

  // Dynamic readOnly toggle
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: readOnlyCompartment.reconfigure(EditorState.readOnly.of(readOnly)),
    });
  }, [readOnly]);

  // Dynamic LSP client connection
  useEffect(() => {
    if (!lspPort) {
      if (lspClientRef.current) {
        lspClientRef.current.disconnect();
        lspClientRef.current = null;
      }
      const view = viewRef.current;
      if (view) {
        view.dispatch({
          effects: lspCompartment.reconfigure(autocompletion()),
        });
      }
      return;
    }

    const client = new LspClient({
      port: lspPort,
      languageId: language,
      onDiagnostics: (diagnostics) => {
        if (viewRef.current) {
          viewRef.current.dispatch(setDiagnostics(viewRef.current.state, diagnostics));
        }
      },
    });

    lspClientRef.current = client;

    const view = viewRef.current;
    if (view) {
      client.setView(view);
      view.dispatch({
        effects: lspCompartment.reconfigure([
          linter(client.getLintSource()),
          autocompletion({ override: [client.getCompletionSource()] }),
        ]),
      });
    }

    client.connect(value);

    return () => {
      client.disconnect();
      if (lspClientRef.current === client) {
        lspClientRef.current = null;
      }
    };
  }, [lspPort, language]);

  return (
    <div
      data-testid="code-editor-root"
      className={`hoshicp-editor relative flex flex-col w-full h-full overflow-hidden ${
        transparent ? 'bg-transparent' : 'bg-slate-950'
      } ${className}`}
    >
      <div
        ref={editorContainerRef}
        data-testid="cm6-editor-container"
        className="flex-1 w-full h-full overflow-hidden"
      />

      {showStatusBar && (
        <div
          data-testid="editor-status-bar"
          className="flex items-center justify-between px-3 py-1 border-t border-white/5 bg-slate-900/60 backdrop-blur-md text-xs select-none"
        >
          <div className="flex items-center gap-2">
            {vimMode ? (
              <VimStatus
                mode={vimState.mode}
                subMode={vimState.subMode}
                keyBuffer={vimState.keyBuffer}
                active={true}
              />
            ) : (
              <span className="text-slate-400 font-mono text-[11px]">EDIT</span>
            )}
            {lspPort && (
              <span
                data-testid="lsp-indicator"
                className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-400"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                LSP:{lspPort}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-slate-400 font-mono text-[11px]">
            <span>{language.toUpperCase()}</span>
            <span>•</span>
            <span>{theme}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default CodeEditor;
