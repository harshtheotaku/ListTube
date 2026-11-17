import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/plus-jakarta-sans';
import '@fontsource-variable/newsreader';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/600.css';
import { App } from './App';
import { isNativeCapacitor } from './services/platform';
import './index.css';

if (
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  !isNativeCapacitor() &&
  import.meta.env.PROD
) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
