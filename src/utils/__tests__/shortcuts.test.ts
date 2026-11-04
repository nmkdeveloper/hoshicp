import { describe, it, expect } from 'vitest';
import {
  matchesShortcut,
  eventToShortcutString,
  toCodeMirrorKey,
} from '../shortcuts';

function mockKeyEvent(init: {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}): KeyboardEvent {
  return {
    key: init.key,
    ctrlKey: !!init.ctrlKey,
    metaKey: !!init.metaKey,
    altKey: !!init.altKey,
    shiftKey: !!init.shiftKey,
  } as unknown as KeyboardEvent;
}

describe('Shortcut Utility Functions', () => {
  it('correctly matches Ctrl+S key combination', () => {
    const e = mockKeyEvent({ key: 's', ctrlKey: true });
    expect(matchesShortcut(e, 'Ctrl+S')).toBe(true);
    expect(matchesShortcut(e, 'Ctrl+O')).toBe(false);
  });

  it('correctly matches F5 function key', () => {
    const e = mockKeyEvent({ key: 'F5' });
    expect(matchesShortcut(e, 'F5')).toBe(true);
    expect(matchesShortcut(e, 'Ctrl+F5')).toBe(false);
  });

  it('correctly matches Shift+F5 function key', () => {
    const e = mockKeyEvent({ key: 'F5', shiftKey: true });
    expect(matchesShortcut(e, 'Shift+F5')).toBe(true);
    expect(matchesShortcut(e, 'F5')).toBe(false);
  });

  it('converts event to shortcut string', () => {
    const e = mockKeyEvent({ key: 'r', ctrlKey: true, altKey: true });
    expect(eventToShortcutString(e)).toBe('Ctrl+Alt+R');
  });

  it('ignores standalone modifier key presses during recording', () => {
    const e = mockKeyEvent({ key: 'Control', ctrlKey: true });
    expect(eventToShortcutString(e)).toBeNull();
  });

  it('converts shortcut string to CodeMirror 6 keymap format', () => {
    expect(toCodeMirrorKey('Ctrl+E')).toBe('Mod-e');
    expect(toCodeMirrorKey('Ctrl+Shift+F5')).toBe('Mod-shift-f5');
    expect(toCodeMirrorKey('F5')).toBe('f5');
  });
});
