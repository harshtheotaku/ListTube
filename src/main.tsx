import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { isNativeCapacitor } from './services/platform';
import './index.css';

const isLocalHost =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

if (typeof window !== 'undefined' && 'serviceWorker' in navigator && !isNativeCapacitor()) {
  if (isLocalHost || !import.meta.env.PROD) {
    // Ensure localhost testing always serves live Vite/preview changes immediately
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => regs.forEach((r) => void r.unregister()))
      .catch(() => {});
  } else {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
