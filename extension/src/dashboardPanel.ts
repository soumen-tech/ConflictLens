/**
 * dashboardPanel.ts
 *
 * Manages the VS Code WebviewPanel that hosts the React dashboard.
 * Singleton pattern: only one panel exists at a time.
 *
 * Responsibilities:
 *   • Create or reveal the webview panel
 *   • Serve the Vite-built React bundle from out/webview/
 *   • Push AnalysisResult data to the webview via postMessage
 *   • Handle messages from the webview (e.g. "open file at line")
 *
 * Ready-handshake protocol:
 *   The webview sends { type: 'ready' } after React mounts.
 *   Until that signal arrives, update() buffers data without posting.
 *   On 'ready', the buffered result (if any) is flushed immediately.
 *   This prevents the race where postMessage fires before the React
 *   message listener is attached.
 */

import * as vscode from 'vscode';
import { AnalysisResult } from './analyzerClient';

export class DashboardPanel {
  public static readonly viewType = 'conflictlensDashboard';
  public static currentPanel: DashboardPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private readonly _disposables: vscode.Disposable[] = [];

  /** Buffered result — always holds the latest AnalysisResult. */
  private _bufferedResult: AnalysisResult | null = null;

  /** True once the webview has sent { type: 'ready' }. */
  private _webviewReady = false;

  // ── Public static API ──────────────────────────────────────────────────────

  public static createOrShow(extensionUri: vscode.Uri): DashboardPanel {
    const column = vscode.window.activeTextEditor
      ? vscode.ViewColumn.Beside
      : vscode.ViewColumn.One;

    if (DashboardPanel.currentPanel) {
      DashboardPanel.currentPanel._panel.reveal(column);
      return DashboardPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      DashboardPanel.viewType,
      'ConflictLens',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,  // keep React state when panel is hidden
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'out', 'webview'),
          vscode.Uri.joinPath(extensionUri, 'media'),
        ],
      }
    );

    DashboardPanel.currentPanel = new DashboardPanel(panel, extensionUri);
    return DashboardPanel.currentPanel;
  }

  /**
   * Push a new AnalysisResult to the open dashboard.
   * Always updates the buffer. If the webview is ready, also posts immediately.
   * No-op if no panel is open.
   */
  public static update(result: AnalysisResult): void {
    const panel = DashboardPanel.currentPanel;
    if (!panel) { return; }

    panel._bufferedResult = result;

    if (panel._webviewReady) {
      panel._postResult(result);
    }
  }

  // ── Constructor ────────────────────────────────────────────────────────────

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    // Set the panel icon
    this._panel.iconPath = vscode.Uri.joinPath(extensionUri, 'media', 'icon.png');

    // Load the React app HTML (resets _webviewReady since the webview is new)
    this._webviewReady = false;
    this._panel.webview.html = this._buildHtml();

    // Handle messages sent from the React app (e.g. clicking a file link)
    this._panel.webview.onDidReceiveMessage(
      (msg: WebviewMessage) => this._handleWebviewMessage(msg),
      null,
      this._disposables
    );

    // Clean up when the panel is closed by the user
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  /** Post the updateRisks message to the webview. */
  private _postResult(result: AnalysisResult): void {
    this._panel.webview.postMessage({ type: 'updateRisks', data: result });
  }

  /** Flush buffered result to the webview (called on 'ready'). */
  private _flushBuffer(): void {
    if (this._bufferedResult) {
      this._postResult(this._bufferedResult);
    }
  }

  private async _handleWebviewMessage(msg: WebviewMessage): Promise<void> {
    if (msg.type === 'ready') {
      this._webviewReady = true;
      this._flushBuffer();
      return;
    }

    if (msg.type === 'scanNow') {
      await vscode.commands.executeCommand('conflictlens.scanNow');
      return;
    }

    if (msg.type === 'openFile' && msg.file) {
      const folders = vscode.workspace.workspaceFolders;
      if (!folders || folders.length === 0) { return; }

      const fileUri = vscode.Uri.joinPath(folders[0].uri, msg.file);
      try {
        const doc    = await vscode.workspace.openTextDocument(fileUri);
        const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);

        if (typeof msg.line === 'number' && msg.line > 0) {
          const zeroLine = msg.line - 1;
          const range    = new vscode.Range(zeroLine, 0, zeroLine, 0);
          editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
          editor.selection = new vscode.Selection(range.start, range.start);
        }
      } catch {
        console.warn(`[ConflictLens] Dashboard: could not open file "${msg.file}"`);
      }
    }
  }

  private _buildHtml(): string {
    const { webview } = this._panel;

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'assets', 'index.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'assets', 'index.css')
    );

    const nonce = generateNonce();

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             style-src ${webview.cspSource} 'unsafe-inline';
             script-src 'nonce-${nonce}';
             img-src ${webview.cspSource} data:;">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${styleUri}">
  <title>ConflictLens</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  public dispose(): void {
    DashboardPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      this._disposables.pop()?.dispose();
    }
  }
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface WebviewMessage {
  type: string;
  file?: string;
  line?: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function generateNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('');
}
