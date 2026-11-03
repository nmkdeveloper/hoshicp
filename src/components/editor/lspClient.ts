import type { Diagnostic, LintSource } from '@codemirror/lint';
import type { Completion, CompletionContext, CompletionResult, CompletionSource } from '@codemirror/autocomplete';
import type { EditorView } from '@codemirror/view';

export interface LspClientOptions {
  port: number;
  languageId: string;
  documentUri?: string;
  rootUri?: string;
  onDiagnostics?: (diagnostics: Diagnostic[]) => void;
  onError?: (error: Error | Event) => void;
  onStatusChange?: (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void;
}

export interface LspPosition {
  line: number;
  character: number;
}

export interface LspRange {
  start: LspPosition;
  end: LspPosition;
}

export interface LspDiagnostic {
  range: LspRange;
  severity?: number;
  code?: number | string;
  source?: string;
  message: string;
}

export interface LspCompletionItem {
  label: string;
  kind?: number;
  detail?: string;
  documentation?: string | { kind: string; value: string };
  insertText?: string;
  sortText?: string;
  filterText?: string;
}

const LSP_SEVERITY_MAP: Record<number, 'error' | 'warning' | 'info' | 'hint'> = {
  1: 'error',
  2: 'warning',
  3: 'info',
  4: 'hint',
};

const LSP_COMPLETION_KIND_MAP: Record<number, string> = {
  1: 'text',
  2: 'method',
  3: 'function',
  4: 'constructor',
  5: 'field',
  6: 'variable',
  7: 'class',
  8: 'interface',
  9: 'module',
  10: 'property',
  11: 'unit',
  12: 'value',
  13: 'enum',
  14: 'keyword',
  15: 'snippet',
  16: 'color',
  17: 'file',
  18: 'reference',
  19: 'folder',
  20: 'enumMember',
  21: 'constant',
  22: 'struct',
  23: 'event',
  24: 'operator',
  25: 'typeParameter',
};

export class LspClient {
  private ws: WebSocket | null = null;
  private requestId = 1;
  private pendingRequests = new Map<number, { resolve: (val: any) => void; reject: (err: any) => void }>();
  private rawDiagnostics: LspDiagnostic[] = [];
  private currentVersion = 1;
  private isConnected = false;
  private currentView: EditorView | null = null;

  public readonly port: number;
  public readonly languageId: string;
  public readonly documentUri: string;
  public readonly rootUri: string;
  private options: LspClientOptions;

  constructor(options: LspClientOptions) {
    this.options = options;
    this.port = options.port;
    this.languageId = options.languageId;
    this.documentUri = options.documentUri ?? `file:///workspace/solution.${this.getFileExtension(options.languageId)}`;
    this.rootUri = options.rootUri ?? 'file:///workspace';
  }

  private getFileExtension(lang: string): string {
    switch (lang.toLowerCase()) {
      case 'cpp':
      case 'c++':
        return 'cpp';
      case 'rust':
      case 'rs':
        return 'rs';
      case 'python':
      case 'py':
        return 'py';
      case 'java':
        return 'java';
      default:
        return 'txt';
    }
  }

  public connect(initialText = ''): Promise<void> {
    return new Promise((resolve) => {
      if (typeof WebSocket === 'undefined') {
        this.options.onStatusChange?.('error');
        resolve();
        return;
      }

      this.options.onStatusChange?.('connecting');
      const url = `ws://127.0.0.1:${this.port}`;

      try {
        const ws = new WebSocket(url);
        this.ws = ws;

        ws.onopen = async () => {
          this.isConnected = true;
          this.options.onStatusChange?.('connected');

          try {
            await this.sendRequest('initialize', {
              processId: null,
              rootUri: this.rootUri,
              capabilities: {
                textDocument: {
                  completion: {
                    completionItem: {
                      snippetSupport: true,
                      documentationFormat: ['markdown', 'plaintext'],
                    },
                  },
                  publishDiagnostics: {
                    relatedInformation: true,
                  },
                },
              },
            });

            this.sendNotification('initialized', {});
            this.sendNotification('textDocument/didOpen', {
              textDocument: {
                uri: this.documentUri,
                languageId: this.languageId,
                version: this.currentVersion,
                text: initialText,
              },
            });
          } catch {
            // Non-fatal handshake failure
          }
          resolve();
        };

        ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        ws.onerror = (event) => {
          this.options.onError?.(event);
          this.options.onStatusChange?.('error');
          resolve();
        };

        ws.onclose = () => {
          this.isConnected = false;
          this.options.onStatusChange?.('disconnected');
          this.rejectAllPending(new Error('WebSocket closed'));
        };
      } catch (err) {
        this.options.onError?.(err as Error);
        this.options.onStatusChange?.('error');
        resolve();
      }
    });
  }

  public notifyChange(text: string): void {
    if (!this.isConnected || !this.ws) return;
    this.currentVersion += 1;
    this.sendNotification('textDocument/didChange', {
      textDocument: {
        uri: this.documentUri,
        version: this.currentVersion,
      },
      contentChanges: [{ text }],
    });
  }

  public sendRequest<T = any>(method: string, params: any): Promise<T> {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('LSP WebSocket is not connected'));
    }

    const id = this.requestId++;
    const payload = JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params,
    });

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.ws?.send(payload);
    });
  }

  public sendNotification(method: string, params: any): void {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const payload = JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
    });
    this.ws.send(payload);
  }

  private handleMessage(data: any): void {
    try {
      const text = typeof data === 'string' ? data : new TextDecoder().decode(data);
      const msg = JSON.parse(text);

      if (msg.id !== undefined && this.pendingRequests.has(msg.id)) {
        const { resolve, reject } = this.pendingRequests.get(msg.id)!;
        this.pendingRequests.delete(msg.id);
        if (msg.error) {
          reject(new Error(msg.error.message || 'LSP error'));
        } else {
          resolve(msg.result);
        }
        return;
      }

      if (msg.method === 'textDocument/publishDiagnostics') {
        const params = msg.params;
        if (params && params.uri === this.documentUri) {
          this.rawDiagnostics = params.diagnostics || [];
          if (this.currentView) {
            const mapped = this.mapDiagnostics(this.currentView);
            this.options.onDiagnostics?.(mapped);
          }
        }
      }
    } catch {
      // Ignore invalid JSON frames
    }
  }

  public setView(view: EditorView | null): void {
    this.currentView = view;
  }

  public mapDiagnostics(view: EditorView): Diagnostic[] {
    const doc = view.state.doc;
    const diagnostics: Diagnostic[] = [];

    for (const diag of this.rawDiagnostics) {
      const startLine = Math.min(Math.max(diag.range.start.line + 1, 1), doc.lines);
      const endLine = Math.min(Math.max(diag.range.end.line + 1, 1), doc.lines);

      const startLineObj = doc.line(startLine);
      const endLineObj = doc.line(endLine);

      const from = Math.min(startLineObj.from + diag.range.start.character, startLineObj.to);
      let to = Math.min(endLineObj.from + diag.range.end.character, endLineObj.to);

      if (from >= to) {
        to = Math.min(from + 1, doc.length);
      }

      diagnostics.push({
        from,
        to,
        severity: (diag.severity && LSP_SEVERITY_MAP[diag.severity]) || 'error',
        message: diag.message,
        source: diag.source ?? 'lsp',
      });
    }

    return diagnostics;
  }

  public getLintSource(): LintSource {
    return (view: EditorView) => {
      this.currentView = view;
      return this.mapDiagnostics(view);
    };
  }

  public getCompletionSource(): CompletionSource {
    return async (context: CompletionContext): Promise<CompletionResult | null> => {
      if (!this.isConnected) return null;

      const word = context.matchBefore(/[\w$]+/) ?? { from: context.pos, to: context.pos, text: '' };
      if (!context.explicit && word.from === word.to) {
        return null;
      }

      const doc = context.state.doc;
      const lineObj = doc.lineAt(context.pos);
      const line = lineObj.number - 1;
      const character = context.pos - lineObj.from;

      try {
        const result = await this.sendRequest('textDocument/completion', {
          textDocument: { uri: this.documentUri },
          position: { line, character },
        });

        if (!result) return null;

        const items: LspCompletionItem[] = Array.isArray(result) ? result : result.items || [];
        const options: Completion[] = items.map((item) => {
          const detail = item.detail;
          const info =
            typeof item.documentation === 'string'
              ? item.documentation
              : item.documentation?.value;

          return {
            label: item.label,
            detail,
            info,
            apply: item.insertText || item.label,
            type: item.kind ? LSP_COMPLETION_KIND_MAP[item.kind] : undefined,
          };
        });

        return {
          from: word.from,
          options,
          filter: true,
        };
      } catch {
        return null;
      }
    };
  }

  private rejectAllPending(err: Error): void {
    for (const [, { reject }] of this.pendingRequests) {
      reject(err);
    }
    this.pendingRequests.clear();
  }

  public disconnect(): void {
    this.isConnected = false;
    this.rejectAllPending(new Error('LSP client disconnected'));
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Safe ignore
      }
      this.ws = null;
    }
  }
}
