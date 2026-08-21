/**
 * dashboardPanel.test.ts
 *
 * Unit tests for the ready-handshake protocol in DashboardPanel.
 *
 * Tests cover:
 *   1. update() called before 'ready' → data buffered, sent after ready
 *   2. update() called after 'ready' → data posted immediately
 *   3. Panel reload → re-sends last buffered result on new 'ready'
 *   4. Multiple updates before 'ready' → only latest result sent
 *   5. runScan-like sequence (createOrShow → update → enriched update)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Minimal vscode mock ──────────────────────────────────────────────────────

type MessageHandler = (msg: Record<string, unknown>) => void;

function createMockWebviewPanel() {
  let messageHandler: MessageHandler | undefined;

  const webview = {
    postMessage: vi.fn(),
    html: '',
    asWebviewUri: vi.fn((_uri: unknown) => 'mock-uri'),
    cspSource: 'mock-csp',
    onDidReceiveMessage: vi.fn(
      (handler: MessageHandler, _thisArg: unknown, disposables: unknown[]) => {
        messageHandler = handler;
        const disposable = { dispose: vi.fn() };
        if (Array.isArray(disposables)) { disposables.push(disposable); }
        return disposable;
      }
    ),
  };

  const panel = {
    webview,
    reveal: vi.fn(),
    dispose: vi.fn(),
    iconPath: undefined as unknown,
    onDidDispose: vi.fn(
      (_handler: () => void, _thisArg: unknown, disposables: unknown[]) => {
        const disposable = { dispose: vi.fn() };
        if (Array.isArray(disposables)) { disposables.push(disposable); }
        return disposable;
      }
    ),
  };

  return {
    panel,
    webview,
    /** Simulate the webview sending a message to the extension */
    simulateMessage(msg: Record<string, unknown>) {
      if (!messageHandler) { throw new Error('No message handler registered'); }
      messageHandler(msg);
    },
  };
}

// Mock the entire vscode module
let mockPanelInstance: ReturnType<typeof createMockWebviewPanel>;

vi.mock('vscode', () => {
  return {
    window: {
      activeTextEditor: undefined,
      createWebviewPanel: vi.fn(),
      showTextDocument: vi.fn(),
    },
    workspace: {
      workspaceFolders: [],
      openTextDocument: vi.fn(),
    },
    commands: {
      executeCommand: vi.fn(),
    },
    ViewColumn: { One: 1, Beside: 2 },
    Uri: {
      joinPath: vi.fn((..._args: unknown[]) => ({ fsPath: '/mock/path' })),
    },
    Range: vi.fn(),
    Selection: vi.fn(),
    TextEditorRevealType: { InCenter: 2 },
  };
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeResult(id: string): import('../analyzerClient').AnalysisResult {
  return {
    analysis_id: id,
    timestamp: new Date().toISOString(),
    risks: [
      {
        id: `risk_${id}`,
        type: 'semantic_conflict',
        riskLevel: 'high',
        location: { file: 'src/test.js', line: 10 },
        details: {
          functionName: 'testFn',
          changeType: 'signature_parameter_added',
          affectedFiles: ['src/test.js'],
        },
        ai_context: {
          explanation: `Explanation for ${id}`,
          recommendation: `Recommendation for ${id}`,
        },
      },
    ],
  };
}

// ── Test suite ───────────────────────────────────────────────────────────────

describe('DashboardPanel ready-handshake', () => {
  let vscode: typeof import('vscode');

  beforeEach(async () => {
    vscode = await import('vscode');

    // Create a fresh mock panel for each test
    mockPanelInstance = createMockWebviewPanel();
    vi.mocked(vscode.window.createWebviewPanel).mockReturnValue(
      mockPanelInstance.panel as unknown as import('vscode').WebviewPanel
    );

    // Reset singleton
    const { DashboardPanel } = await import('../dashboardPanel');
    DashboardPanel.currentPanel?.dispose();
    DashboardPanel.currentPanel = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('buffers update() calls made before webview is ready', async () => {
    const { DashboardPanel } = await import('../dashboardPanel');
    const extensionUri = { fsPath: '/mock' } as unknown as import('vscode').Uri;
    const result = makeResult('before-ready');

    // Create panel and immediately update (simulates runScan behavior)
    DashboardPanel.createOrShow(extensionUri);
    DashboardPanel.update(result);

    // postMessage should NOT have been called — webview isn't ready yet
    expect(mockPanelInstance.webview.postMessage).not.toHaveBeenCalled();
  });

  it('flushes buffered data when webview sends ready', async () => {
    const { DashboardPanel } = await import('../dashboardPanel');
    const extensionUri = { fsPath: '/mock' } as unknown as import('vscode').Uri;
    const result = makeResult('flush-on-ready');

    DashboardPanel.createOrShow(extensionUri);
    DashboardPanel.update(result);

    // Webview sends 'ready'
    mockPanelInstance.simulateMessage({ type: 'ready' });

    // Now the buffered result should have been posted
    expect(mockPanelInstance.webview.postMessage).toHaveBeenCalledTimes(1);
    expect(mockPanelInstance.webview.postMessage).toHaveBeenCalledWith({
      type: 'updateRisks',
      data: result,
    });
  });

  it('posts immediately when update() is called after ready', async () => {
    const { DashboardPanel } = await import('../dashboardPanel');
    const extensionUri = { fsPath: '/mock' } as unknown as import('vscode').Uri;
    const result = makeResult('after-ready');

    DashboardPanel.createOrShow(extensionUri);

    // Webview is ready first
    mockPanelInstance.simulateMessage({ type: 'ready' });

    // Now update — should post immediately
    DashboardPanel.update(result);

    expect(mockPanelInstance.webview.postMessage).toHaveBeenCalledTimes(1);
    expect(mockPanelInstance.webview.postMessage).toHaveBeenCalledWith({
      type: 'updateRisks',
      data: result,
    });
  });

  it('sends only the latest result when multiple updates occur before ready', async () => {
    const { DashboardPanel } = await import('../dashboardPanel');
    const extensionUri = { fsPath: '/mock' } as unknown as import('vscode').Uri;
    const result1 = makeResult('first');
    const result2 = makeResult('second');
    const result3 = makeResult('latest');

    DashboardPanel.createOrShow(extensionUri);
    DashboardPanel.update(result1);
    DashboardPanel.update(result2);
    DashboardPanel.update(result3);

    // Nothing sent yet
    expect(mockPanelInstance.webview.postMessage).not.toHaveBeenCalled();

    // Webview sends 'ready'
    mockPanelInstance.simulateMessage({ type: 'ready' });

    // Only the latest result should be sent
    expect(mockPanelInstance.webview.postMessage).toHaveBeenCalledTimes(1);
    expect(mockPanelInstance.webview.postMessage).toHaveBeenCalledWith({
      type: 'updateRisks',
      data: result3,
    });
  });

  it('re-sends buffered result on panel reload (new ready signal)', async () => {
    const { DashboardPanel } = await import('../dashboardPanel');
    const extensionUri = { fsPath: '/mock' } as unknown as import('vscode').Uri;
    const result = makeResult('reload-test');

    // First session: create, update, ready → data flows
    DashboardPanel.createOrShow(extensionUri);
    DashboardPanel.update(result);
    mockPanelInstance.simulateMessage({ type: 'ready' });

    expect(mockPanelInstance.webview.postMessage).toHaveBeenCalledTimes(1);

    // Simulate panel dispose + re-create (e.g. user closes and reopens)
    DashboardPanel.currentPanel!.dispose();

    // Create a fresh mock for the new panel
    const newMock = createMockWebviewPanel();
    vi.mocked(vscode.window.createWebviewPanel).mockReturnValue(
      newMock.panel as unknown as import('vscode').WebviewPanel
    );

    DashboardPanel.createOrShow(extensionUri);

    // Update with the same result (runScan would do this)
    DashboardPanel.update(result);

    // Not sent yet — new webview isn't ready
    expect(newMock.webview.postMessage).not.toHaveBeenCalled();

    // New webview sends 'ready'
    newMock.simulateMessage({ type: 'ready' });

    expect(newMock.webview.postMessage).toHaveBeenCalledTimes(1);
    expect(newMock.webview.postMessage).toHaveBeenCalledWith({
      type: 'updateRisks',
      data: result,
    });
  });

  it('handles the full runScan flow: createOrShow → update → enriched update', async () => {
    const { DashboardPanel } = await import('../dashboardPanel');
    const extensionUri = { fsPath: '/mock' } as unknown as import('vscode').Uri;
    const rawResult = makeResult('raw');
    const enrichedResult = makeResult('enriched');

    // runScan sequence
    DashboardPanel.createOrShow(extensionUri);
    DashboardPanel.update(rawResult);       // raw result (immediate)
    DashboardPanel.update(enrichedResult);  // enriched result (after AI, but still before webview boots)

    // Nothing sent yet
    expect(mockPanelInstance.webview.postMessage).not.toHaveBeenCalled();

    // Webview finally boots
    mockPanelInstance.simulateMessage({ type: 'ready' });

    // Only the enriched (latest) result should be sent
    expect(mockPanelInstance.webview.postMessage).toHaveBeenCalledTimes(1);
    expect(mockPanelInstance.webview.postMessage).toHaveBeenCalledWith({
      type: 'updateRisks',
      data: enrichedResult,
    });
  });

  it('does nothing on ready if no data was buffered', async () => {
    const { DashboardPanel } = await import('../dashboardPanel');
    const extensionUri = { fsPath: '/mock' } as unknown as import('vscode').Uri;

    DashboardPanel.createOrShow(extensionUri);

    // Webview sends 'ready' before any update() call
    mockPanelInstance.simulateMessage({ type: 'ready' });

    // No postMessage should have been made
    expect(mockPanelInstance.webview.postMessage).not.toHaveBeenCalled();
  });

  it('update() is a no-op when no panel exists', async () => {
    const { DashboardPanel } = await import('../dashboardPanel');
    const result = makeResult('no-panel');

    // Should not throw
    DashboardPanel.update(result);
    expect(mockPanelInstance.webview.postMessage).not.toHaveBeenCalled();
  });
});
