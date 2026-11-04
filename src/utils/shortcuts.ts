export type ShortcutAction =
  | 'saveCode'
  | 'openCode'
  | 'compileAndRun'
  | 'run'
  | 'stop'
  | 'selectNext'
  | 'find'
  | 'replace'
  | 'openSettings';

export type ShortcutMap = Record<ShortcutAction, string>;

export const DEFAULT_SHORTCUTS: ShortcutMap = {
  saveCode: 'Ctrl+S',
  openCode: 'Ctrl+O',
  compileAndRun: 'Ctrl+F5',
  run: 'F5',
  stop: 'Shift+F5',
  selectNext: 'Ctrl+E',
  find: 'Ctrl+F',
  replace: 'Ctrl+H',
  openSettings: 'Ctrl+,',
};

export const SHORTCUT_DEFINITIONS: {
  action: ShortcutAction;
  label: string;
  category: 'Editor' | 'File' | 'Execution' | 'General';
  description: string;
}[] = [
  {
    action: 'saveCode',
    label: 'Save Source Code',
    category: 'File',
    description: 'Saves the current code and strips temporary trailing lines',
  },
  {
    action: 'openCode',
    label: 'Open Source Code',
    category: 'File',
    description: 'Opens a source code file from disk',
  },
  {
    action: 'compileAndRun',
    label: 'Compile & Run All Testcases',
    category: 'Execution',
    description: 'Compiles the solution and executes all test cases',
  },
  {
    action: 'run',
    label: 'Run All Testcases',
    category: 'Execution',
    description: 'Runs test cases with existing compiled binary',
  },
  {
    action: 'stop',
    label: 'Stop Execution',
    category: 'Execution',
    description: 'Forcefully terminates the currently running process',
  },
  {
    action: 'selectNext',
    label: 'Select Next Matching Pattern',
    category: 'Editor',
    description: 'CodeBlocks/VSCode multi-cursor selection of next identical token',
  },
  {
    action: 'find',
    label: 'Find in Code',
    category: 'Editor',
    description: 'Opens in-editor search panel',
  },
  {
    action: 'replace',
    label: 'Replace in Code',
    category: 'Editor',
    description: 'Opens in-editor search and replace panel',
  },
  {
    action: 'openSettings',
    label: 'Open Settings',
    category: 'General',
    description: 'Opens preferences dialog',
  },
];

/**
 * Normalizes and checks if a KeyboardEvent matches a shortcut configuration string.
 * Supports combinations like "Ctrl+S", "Ctrl+Shift+F5", "Cmd+O", "F5", "Ctrl+,".
 */
export function matchesShortcut(e: KeyboardEvent, shortcut: string): boolean {
  if (!shortcut) return false;

  const parts = shortcut.split('+').map((p) => p.trim());
  const needsCtrl = parts.some((p) => p.toLowerCase() === 'ctrl' || p.toLowerCase() === 'mod');
  const needsMeta = parts.some((p) => p.toLowerCase() === 'cmd' || p.toLowerCase() === 'meta');
  const needsAlt = parts.some((p) => p.toLowerCase() === 'alt');
  const needsShift = parts.some((p) => p.toLowerCase() === 'shift');

  // Find the primary non-modifier key
  const mainKeyPart = parts.find(
    (p) => !['ctrl', 'mod', 'cmd', 'meta', 'alt', 'shift'].includes(p.toLowerCase())
  );
  if (!mainKeyPart) return false;

  // Check Ctrl or Meta (Command on Mac, Ctrl on Win/Linux)
  if (needsCtrl || needsMeta) {
    if (!e.ctrlKey && !e.metaKey) return false;
  } else {
    if (e.ctrlKey || e.metaKey) return false;
  }

  // Check Alt
  if (needsAlt !== e.altKey) return false;

  // Check Shift
  if (needsShift !== e.shiftKey) return false;

  // Check primary key
  const expectedKey = mainKeyPart.toLowerCase();
  const actualKey = e.key.toLowerCase();

  return actualKey === expectedKey;
}

/**
 * Converts a KeyboardEvent during recording into a standardized shortcut string.
 * Returns null if only modifier keys were pressed.
 */
export function eventToShortcutString(e: KeyboardEvent): string | null {
  const isModifier = ['Control', 'Shift', 'Alt', 'Meta'].includes(e.key);
  if (isModifier) return null;

  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.metaKey) parts.push('Cmd');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');

  const key = e.key;
  if (key.length === 1) {
    parts.push(key.toUpperCase());
  } else {
    // Function keys (F1-F12), Enter, Escape, Space, etc.
    parts.push(key);
  }

  return parts.join('+');
}

/**
 * Converts standard shortcut notation (e.g. "Ctrl+E", "Ctrl+Shift+F5") to CodeMirror 6 keymap format ("Mod-e", "Ctrl-Shift-F5").
 */
export function toCodeMirrorKey(shortcut: string): string {
  if (!shortcut) return '';
  return shortcut
    .replace(/\bCtrl\b/gi, 'Mod')
    .replace(/\bCmd\b/gi, 'Mod')
    .replace(/\+/g, '-')
    .toLowerCase()
    .replace(/\bmod\b/g, 'Mod');
}
