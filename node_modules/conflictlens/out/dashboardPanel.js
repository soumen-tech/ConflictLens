"use strict";
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
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardPanel = void 0;
const vscode = __importStar(require("vscode"));
class DashboardPanel {
    // ── Public static API ──────────────────────────────────────────────────────
    static createOrShow(extensionUri) {
        const column = vscode.window.activeTextEditor
            ? vscode.ViewColumn.Beside
            : vscode.ViewColumn.One;
        if (DashboardPanel.currentPanel) {
            DashboardPanel.currentPanel._panel.reveal(column);
            return DashboardPanel.currentPanel;
        }
        const panel = vscode.window.createWebviewPanel(DashboardPanel.viewType, 'ConflictLens', column, {
            enableScripts: true,
            retainContextWhenHidden: true, // keep React state when panel is hidden
            localResourceRoots: [
                vscode.Uri.joinPath(extensionUri, 'out', 'webview'),
                vscode.Uri.joinPath(extensionUri, 'media'),
            ],
        });
        DashboardPanel.currentPanel = new DashboardPanel(panel, extensionUri);
        return DashboardPanel.currentPanel;
    }
    /** Push a new AnalysisResult to the open dashboard (no-op if none is open). */
    static update(result) {
        DashboardPanel.currentPanel?._sendMessage({ type: 'updateRisks', data: result });
    }
    // ── Constructor ────────────────────────────────────────────────────────────
    constructor(panel, extensionUri) {
        this._disposables = [];
        this._panel = panel;
        this._extensionUri = extensionUri;
        // Set the panel icon
        this._panel.iconPath = vscode.Uri.joinPath(extensionUri, 'media', 'icon.png');
        // Load the React app HTML
        this._panel.webview.html = this._buildHtml();
        // Handle messages sent from the React app (e.g. clicking a file link)
        this._panel.webview.onDidReceiveMessage((msg) => this._handleWebviewMessage(msg), null, this._disposables);
        // Clean up when the panel is closed by the user
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }
    // ── Internal helpers ───────────────────────────────────────────────────────
    _sendMessage(message) {
        this._panel.webview.postMessage(message);
    }
    async _handleWebviewMessage(msg) {
        if (msg.type === 'openFile' && msg.file) {
            const folders = vscode.workspace.workspaceFolders;
            if (!folders || folders.length === 0) {
                return;
            }
            const fileUri = vscode.Uri.joinPath(folders[0].uri, msg.file);
            try {
                const doc = await vscode.workspace.openTextDocument(fileUri);
                const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
                if (typeof msg.line === 'number' && msg.line > 0) {
                    const zeroLine = msg.line - 1;
                    const range = new vscode.Range(zeroLine, 0, zeroLine, 0);
                    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
                    editor.selection = new vscode.Selection(range.start, range.start);
                }
            }
            catch {
                console.warn(`[ConflictLens] Dashboard: could not open file "${msg.file}"`);
            }
        }
    }
    _buildHtml() {
        const { webview } = this._panel;
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'assets', 'index.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'assets', 'index.css'));
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
    dispose() {
        DashboardPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            this._disposables.pop()?.dispose();
        }
    }
}
exports.DashboardPanel = DashboardPanel;
DashboardPanel.viewType = 'conflictlensDashboard';
// ── Helpers ────────────────────────────────────────────────────────────────────
function generateNonce() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
//# sourceMappingURL=dashboardPanel.js.map