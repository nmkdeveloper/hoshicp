import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import type { Extension } from '@codemirror/state';

export type ThemeName =
  | 'cute-hoshino'
  | 'classic-dark'
  | 'classic-light'
  | 'dracula'
  | 'one-dark'
  | 'catppuccin';

export interface ThemeOptions {
  transparent?: boolean;
  fontSize?: number;
  fontFamily?: string;
  surfaceOpacity?: number;
}

interface ThemeDefinition {
  dark: boolean;
  background: string;
  foreground: string;
  caret: string;
  selection: string;
  activeLine: string;
  gutterBackground: string;
  gutterForeground: string;
  gutterActiveForeground: string;
  border?: string;
  styles: { tag: any; color?: string; fontStyle?: string }[];
}

const THEME_SPECS: Record<ThemeName, ThemeDefinition> = {
  'cute-hoshino': {
    dark: false,
    background: '#fffbfd',
    foreground: '#231e32',
    caret: '#ff3377',
    selection: 'rgba(255, 112, 160, 0.28)',
    activeLine: 'rgba(255, 182, 193, 0.2)',
    gutterBackground: 'rgba(255, 245, 249, 0.92)',
    gutterForeground: '#9d7c92',
    gutterActiveForeground: '#ff2d78',
    border: 'rgba(255, 182, 193, 0.35)',
    styles: [
      { tag: t.keyword, color: '#e11d48', fontStyle: 'bold' },
      { tag: [t.definitionKeyword, t.moduleKeyword, t.controlKeyword], color: '#d91b5c', fontStyle: 'bold' },
      { tag: [t.name, t.deleted, t.character, t.macroName], color: '#231e32' },
      { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#2563eb' },
      { tag: [t.typeName, t.className, t.namespace], color: '#7c3aed' },
      { tag: [t.string, t.special(t.string)], color: '#059669' },
      { tag: [t.number, t.integer, t.float, t.bool, t.atom], color: '#d97706' },
      { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: '#78716c', fontStyle: 'italic' },
      { tag: [t.operator, t.punctuation, t.bracket], color: '#0284c7' },
      { tag: [t.variableName, t.attributeName], color: '#475569' },
    ],
  },
  'classic-dark': {
    dark: true,
    background: '#1e1e1e',
    foreground: '#d4d4d4',
    caret: '#aeafad',
    selection: '#264f78',
    activeLine: '#282828',
    gutterBackground: '#1e1e1e',
    gutterForeground: '#858585',
    gutterActiveForeground: '#c6c6c6',
    border: '#333333',
    styles: [
      { tag: t.keyword, color: '#569cd6' },
      { tag: [t.name, t.deleted, t.character], color: '#d4d4d4' },
      { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#dcdcaa' },
      { tag: [t.typeName, t.className], color: '#4ec9b0' },
      { tag: [t.string, t.special(t.string)], color: '#ce9178' },
      { tag: [t.number, t.bool], color: '#b5cea8' },
      { tag: [t.comment, t.lineComment, t.blockComment], color: '#6a9955', fontStyle: 'italic' },
      { tag: [t.operator, t.punctuation], color: '#d4d4d4' },
      { tag: t.variableName, color: '#9cdcfe' },
    ],
  },
  'classic-light': {
    dark: false,
    background: '#ffffff',
    foreground: '#000000',
    caret: '#000000',
    selection: '#add6ff',
    activeLine: '#f5f5f5',
    gutterBackground: '#f7f7f7',
    gutterForeground: '#6e7681',
    gutterActiveForeground: '#000000',
    border: '#e1e4e8',
    styles: [
      { tag: t.keyword, color: '#0000ff' },
      { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#795e26' },
      { tag: [t.typeName, t.className], color: '#267f99' },
      { tag: [t.string, t.special(t.string)], color: '#a31515' },
      { tag: [t.number, t.bool], color: '#098658' },
      { tag: [t.comment, t.lineComment, t.blockComment], color: '#008000', fontStyle: 'italic' },
      { tag: [t.operator, t.punctuation], color: '#000000' },
      { tag: t.variableName, color: '#001080' },
    ],
  },
  dracula: {
    dark: true,
    background: '#282a36',
    foreground: '#f8f8f2',
    caret: '#f8f8f0',
    selection: '#44475a',
    activeLine: 'rgba(255, 255, 255, 0.05)',
    gutterBackground: '#282a36',
    gutterForeground: '#6272a4',
    gutterActiveForeground: '#f8f8f2',
    border: '#44475a',
    styles: [
      { tag: t.keyword, color: '#ff79c6' },
      { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#50fa7b' },
      { tag: [t.typeName, t.className], color: '#8be9fd' },
      { tag: [t.string, t.special(t.string)], color: '#f1fa8c' },
      { tag: [t.number, t.bool], color: '#bd93f9' },
      { tag: [t.comment, t.lineComment, t.blockComment], color: '#6272a4', fontStyle: 'italic' },
      { tag: [t.operator, t.punctuation], color: '#ff79c6' },
      { tag: t.variableName, color: '#f8f8f2' },
    ],
  },
  'one-dark': {
    dark: true,
    background: '#282c34',
    foreground: '#abb2bf',
    caret: '#528bff',
    selection: '#3e4451',
    activeLine: 'rgba(255, 255, 255, 0.04)',
    gutterBackground: '#282c34',
    gutterForeground: '#5c6370',
    gutterActiveForeground: '#abb2bf',
    border: '#3e4451',
    styles: [
      { tag: t.keyword, color: '#c678dd' },
      { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#61afef' },
      { tag: [t.typeName, t.className], color: '#e5c07b' },
      { tag: [t.string, t.special(t.string)], color: '#98c379' },
      { tag: [t.number, t.bool], color: '#d19a66' },
      { tag: [t.comment, t.lineComment, t.blockComment], color: '#5c6370', fontStyle: 'italic' },
      { tag: [t.operator, t.punctuation], color: '#56b6c2' },
      { tag: t.variableName, color: '#e06c75' },
    ],
  },
  catppuccin: {
    dark: true,
    background: '#1e1e2e',
    foreground: '#cdd6f4',
    caret: '#f5e0dc',
    selection: '#45475a',
    activeLine: 'rgba(255, 255, 255, 0.04)',
    gutterBackground: '#1e1e2e',
    gutterForeground: '#6c7086',
    gutterActiveForeground: '#cdd6f4',
    border: '#313244',
    styles: [
      { tag: t.keyword, color: '#cba6f7' },
      { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#89b4fa' },
      { tag: [t.typeName, t.className], color: '#f9e2af' },
      { tag: [t.string, t.special(t.string)], color: '#a6e3a1' },
      { tag: [t.number, t.bool], color: '#fab387' },
      { tag: [t.comment, t.lineComment, t.blockComment], color: '#6c7086', fontStyle: 'italic' },
      { tag: [t.operator, t.punctuation], color: '#89dceb' },
      { tag: t.variableName, color: '#f5c2e7' },
    ],
  },
};

export function getThemeExtensions(
  theme: ThemeName = 'cute-hoshino',
  options: ThemeOptions = {}
): Extension[] {
  const spec = THEME_SPECS[theme] ?? THEME_SPECS['cute-hoshino'];
  // Transparent is default enabled for cute-hoshino, or when options.transparent is explicitly true
  const isTransparent = options.transparent !== undefined ? options.transparent : theme === 'cute-hoshino';

  const editorTheme = EditorView.theme(
    {
      '&': {
        height: '100% !important',
        maxHeight: '100% !important',
        color: spec.foreground,
        backgroundColor: isTransparent
          ? (spec.dark
              ? `rgba(22, 20, 31, ${options.surfaceOpacity ?? 0.88}) !important`
              : `rgba(255, 255, 255, ${options.surfaceOpacity ?? 0.92}) !important`)
          : spec.background,
        fontSize: options.fontSize ? `${options.fontSize}px` : '14px',
        fontFamily: options.fontFamily || "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
      },
      '.cm-content': {
        caretColor: spec.caret,
        backgroundColor: 'transparent',
      },
      '.cm-cursor, .cm-dropCursor': {
        borderLeftColor: spec.caret,
        borderLeftWidth: '2px',
      },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
        backgroundColor: spec.selection,
      },
      '.cm-panels': {
        backgroundColor: isTransparent
          ? (spec.dark ? 'rgba(20, 20, 30, 0.88)' : 'rgba(250, 250, 250, 0.92)')
          : spec.background,
        color: spec.foreground,
      },
      '.cm-gutters': {
        backgroundColor: isTransparent
          ? (spec.dark
              ? `rgba(18, 16, 26, ${Math.min((options.surfaceOpacity ?? 0.88) * 1.05, 0.98)}) !important`
              : `rgba(255, 245, 249, ${Math.min((options.surfaceOpacity ?? 0.92) * 1.05, 0.98)}) !important`)
          : spec.gutterBackground,
        color: spec.gutterForeground,
        borderRight: isTransparent
          ? '1px solid rgba(255, 255, 255, 0.08)'
          : `1px solid ${spec.border ?? 'transparent'}`,
      },
      '.cm-activeLine': {
        backgroundColor: spec.activeLine,
      },
      '.cm-activeLineGutter': {
        backgroundColor: isTransparent ? 'rgba(255, 255, 255, 0.05)' : spec.activeLine,
        color: spec.gutterActiveForeground,
      },
      '.cm-scroller': {
        overflow: 'auto',
      },
    },
    { dark: spec.dark }
  );

  const highlightStyle = HighlightStyle.define(spec.styles);

  return [editorTheme, syntaxHighlighting(highlightStyle)];
}
