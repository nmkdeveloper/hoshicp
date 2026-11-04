import React, { useEffect, useRef, useState } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
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
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { linter, lintGutter, lintKeymap, setDiagnostics } from '@codemirror/lint';
import { bracketMatching, foldGutter, foldKeymap, indentOnInput } from '@codemirror/language';
import { cpp } from '@codemirror/lang-cpp';
import { rust } from '@codemirror/lang-rust';
import { python } from '@codemirror/lang-python';
import { java } from '@codemirror/lang-java';
import { vim, getCM } from '@replit/codemirror-vim';

import { getThemeExtensions, type ThemeName } from './themes';
import { VimStatus } from './vimStatus';
import { LspClient } from './lspClient';
import { padLinesToMinimum, stripPaddingLines } from '../../types';

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
  const byHeight = height && height > 0 ? Math.ceil(height / 20) + 20 : 100;
  return Math.max(byHeight, 100);
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

    const baseExtensions: Extension[] = [
      lineNumbers(),
      highlightActiveLineGutter(),
      lintGutter(),
      highlightSpecialChars(),
      history(),
      foldGutter(),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),
      keymap.of([
        indentWithTab,
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...completionKeymap,
        ...lintKeymap,
      ]),
      // Compartments
      langCompartment.of(getLanguageExtension(language)),
      themeCompartment.of(getThemeExtensions(theme, { transparent })),
      vimCompartment.of(vimMode ? vim() : []),
      lspCompartment.of(autocompletion()),
      readOnlyCompartment.of(EditorState.readOnly.of(readOnly)),
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
