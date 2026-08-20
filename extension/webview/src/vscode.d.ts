// Minimal type declarations for the VS Code webview acquireVsCodeApi() bridge.
// This is injected by VS Code at runtime; we just need the type here.

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};
