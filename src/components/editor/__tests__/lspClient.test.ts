import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { LspClient } from '../lspClient';

describe('LSP Client Protocol & Mapping', () => {
  it('initializes with proper default URIs and file extensions', () => {
    const cppClient = new LspClient({ port: 10043, languageId: 'cpp' });
    expect(cppClient.port).toBe(10043);
    expect(cppClient.languageId).toBe('cpp');
    expect(cppClient.documentUri).toBe('file:///workspace/solution.cpp');

    const rustClient = new LspClient({ port: 10043, languageId: 'rust' });
    expect(rustClient.documentUri).toBe('file:///workspace/solution.rs');

    const pyClient = new LspClient({ port: 10043, languageId: 'python' });
    expect(pyClient.documentUri).toBe('file:///workspace/solution.py');

    const javaClient = new LspClient({ port: 10043, languageId: 'java' });
    expect(javaClient.documentUri).toBe('file:///workspace/solution.java');
  });

  it('maps LSP 0-based line/col diagnostics to CodeMirror document offsets', () => {
    const client = new LspClient({ port: 12345, languageId: 'cpp' });
    const docText = 'int main() {\n    int x = "err";\n    return 0;\n}';
    const state = EditorState.create({ doc: docText });

    // Mock an EditorView-like object with state.doc
    const mockView: any = { state };

    // Inject raw LSP diagnostics
    (client as any).rawDiagnostics = [
      {
        range: {
          start: { line: 1, character: 4 },
          end: { line: 1, character: 17 },
        },
        severity: 1, // Error
        message: 'Cannot initialize int with const char*',
        source: 'clangd',
      },
      {
        range: {
          start: { line: 2, character: 4 },
          end: { line: 2, character: 12 },
        },
        severity: 2, // Warning
        message: 'Unused variable',
        source: 'clangd',
      },
    ];

    const mapped = client.mapDiagnostics(mockView);
    expect(mapped).toHaveLength(2);

    // Line 1 is "    int x = "err";" (from 13 to 31)
    // start character 4 -> 13 + 4 = 17
    // end character 17 -> 13 + 17 = 30
    expect(mapped[0].from).toBe(17);
    expect(mapped[0].to).toBe(30);
    expect(mapped[0].severity).toBe('error');
    expect(mapped[0].message).toBe('Cannot initialize int with const char*');
    expect(mapped[0].source).toBe('clangd');

    // Warning
    expect(mapped[1].severity).toBe('warning');
    expect(mapped[1].message).toBe('Unused variable');
  });

  it('gracefully handles empty or out-of-bounds diagnostic positions', () => {
    const client = new LspClient({ port: 12345, languageId: 'cpp' });
    const state = EditorState.create({ doc: 'short' });
    const mockView: any = { state };

    (client as any).rawDiagnostics = [
      {
        range: {
          start: { line: 100, character: 50 },
          end: { line: 100, character: 60 },
        },
        severity: 3, // Info
        message: 'End of file info',
      },
    ];

    const mapped = client.mapDiagnostics(mockView);
    expect(mapped).toHaveLength(1);
    expect(mapped[0].severity).toBe('info');
    expect(mapped[0].from).toBeLessThanOrEqual(5);
    expect(mapped[0].to).toBeLessThanOrEqual(5);
  });

  it('triggers onDiagnostics callback upon textDocument/publishDiagnostics notification', () => {
    let receivedDiagnostics: any[] = [];
    const client = new LspClient({
      port: 12345,
      languageId: 'cpp',
      onDiagnostics: (diags) => {
        receivedDiagnostics = diags;
      },
    });

    const state = EditorState.create({ doc: 'int a = 10;' });
    const mockView: any = { state };
    client.setView(mockView);

    // Simulate incoming publishDiagnostics message
    const notification = JSON.stringify({
      jsonrpc: '2.0',
      method: 'textDocument/publishDiagnostics',
      params: {
        uri: client.documentUri,
        diagnostics: [
          {
            range: {
              start: { line: 0, character: 4 },
              end: { line: 0, character: 5 },
            },
            severity: 1,
            message: 'Unused variable a',
          },
        ],
      },
    });

    (client as any).handleMessage(notification);

    expect(receivedDiagnostics).toHaveLength(1);
    expect(receivedDiagnostics[0].message).toBe('Unused variable a');
    expect(receivedDiagnostics[0].from).toBe(4);
    expect(receivedDiagnostics[0].to).toBe(5);
  });
});
