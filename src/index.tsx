import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

const RESIZE_OBSERVER_NOISE_RE = /ResizeObserver loop (completed with undelivered notifications|limit exceeded)/i;

// Suppress known browser ResizeObserver noise to avoid dev red-screen overlay.
function shouldIgnoreResizeObserverNoise(input: unknown): boolean {
  const msg = String(
    (input as any)?.message ??
    (input as any)?.reason?.message ??
    (input as any)?.reason ??
    input ??
    ""
  );
  return RESIZE_OBSERVER_NOISE_RE.test(msg);
}

window.addEventListener("error", (event) => {
  if (!shouldIgnoreResizeObserverNoise(event)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
});

window.addEventListener("unhandledrejection", (event) => {
  if (!shouldIgnoreResizeObserverNoise(event)) return;
  event.preventDefault();
});

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
