import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { App } from './App';

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );

  // Signal the extension host that the React tree is mounted and the
  // message listener in App.tsx is active.  DashboardPanel buffers
  // any AnalysisResult until it receives this message.
  acquireVsCodeApi().postMessage({ type: 'ready' });
}
