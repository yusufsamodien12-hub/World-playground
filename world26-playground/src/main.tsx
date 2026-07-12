
import React from 'react';
import * as ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { ErrorBoundary } from '../components/ErrorBoundary';

// Global error handler
window.addEventListener('error', (event) => {
  console.error('❌ Global error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('❌ Unhandled promise rejection:', event.reason);
});

// Handle module loading failures
window.addEventListener('importmap:error', (event) => {
  console.error('❌ Module import failed:', event);
});

// Catch network errors for failed module loads
const originalFetch = window.fetch;
window.fetch = async (...args: Parameters<typeof fetch>) => {
  try {
    const response = await originalFetch(...args);
    if (!response.ok && typeof args[0] === 'string' && args[0].includes('.js')) {
      console.warn('⚠️ Failed to load module:', args[0], response.status);
    }
    return response;
  } catch (error) {
    if (typeof args[0] === 'string' && args[0].includes('.js')) {
      console.warn('⚠️ Module fetch error:', args[0], error);
    }
    throw error;
  }
};

console.log('🚀 Application starting...');
console.log('Environment:', import.meta.env.MODE);
console.log('Base URL:', import.meta.env.BASE_URL);

try {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    console.error('❌ Root element not found!');
    throw new Error("Could not find root element to mount to");
  }

  console.log('✅ Root element found, mounting React app...');

  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );

  console.log('✅ React app mounted');
} catch (error) {
  console.error('❌ Fatal error during app initialization:', error);
  document.body.innerHTML = `
    <div style="position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; background: #050505; color: #fff; font-family: monospace;">
      <div style="text-align: center; max-width: 600px; padding: 20px;">
        <div style="font-size: 24px; font-weight: bold; margin-bottom: 16px; color: #ff4444;">❌ Initialization Failed</div>
        <div style="font-size: 14px; opacity: 0.7; background: rgba(255,68,68,0.1); padding: 20px; border-radius: 8px;">
          ${error instanceof Error ? error.message : String(error)}
        </div>
        <button onclick="window.location.reload()" style="margin-top: 20px; padding: 12px 24px; background: white; color: black; border: none; border-radius: 8px; cursor: pointer; font-weight: bold;">
          Reload Page
        </button>
      </div>
    </div>
  `;
}
