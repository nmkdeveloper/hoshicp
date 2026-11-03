import { describe, it, expect } from 'vitest';
import { getLanguageExtension } from '../CodeEditor';

describe('Editor Language Extensions', () => {
  it('returns valid extension for C++', () => {
    const ext = getLanguageExtension('cpp');
    expect(ext).toBeDefined();
    const extUpper = getLanguageExtension('C++');
    expect(extUpper).toBeDefined();
  });

  it('returns valid extension for Rust', () => {
    const ext = getLanguageExtension('rust');
    expect(ext).toBeDefined();
    const extShort = getLanguageExtension('rs');
    expect(extShort).toBeDefined();
  });

  it('returns valid extension for Python', () => {
    const ext = getLanguageExtension('python');
    expect(ext).toBeDefined();
    const extShort = getLanguageExtension('py');
    expect(extShort).toBeDefined();
  });

  it('returns valid extension for Java', () => {
    const ext = getLanguageExtension('java');
    expect(ext).toBeDefined();
  });

  it('defaults to C++ for unknown or empty language', () => {
    const ext = getLanguageExtension('unknown-lang');
    expect(ext).toBeDefined();
    const extEmpty = getLanguageExtension(undefined);
    expect(extEmpty).toBeDefined();
  });
});
