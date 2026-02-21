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

function hideDevOverlayNoise() {
  const selectors = [
    "#webpack-dev-server-client-overlay-div",
    "#webpack-dev-server-client-overlay",
    "iframe[src*='react-error-overlay']",
    "iframe[id*='webpack-dev-server-client-overlay']",
  ];
  for (const sel of selectors) {
    const elements = Array.from(document.querySelectorAll(sel));
    for (const el of elements) {
      if (el instanceof HTMLElement) {
        el.style.display = "none";
      }
    }
  }
}

window.addEventListener("error", (event) => {
  if (!shouldIgnoreResizeObserverNoise(event)) return;
  hideDevOverlayNoise();
  event.preventDefault();
  event.stopImmediatePropagation();
}, true);

window.addEventListener("unhandledrejection", (event) => {
  if (!shouldIgnoreResizeObserverNoise(event)) return;
  hideDevOverlayNoise();
  event.preventDefault();
}, true);

const prevOnError = window.onerror;
window.onerror = function (...args: any[]) {
  if (shouldIgnoreResizeObserverNoise(args?.[0])) {
    hideDevOverlayNoise();
    return true;
  }
  return prevOnError ? prevOnError.apply(window, args as any) : false;
};

const prevUnhandled = window.onunhandledrejection;
window.onunhandledrejection = function (event: PromiseRejectionEvent) {
  if (shouldIgnoreResizeObserverNoise(event)) {
    hideDevOverlayNoise();
    event.preventDefault();
    return true;
  }
  return prevUnhandled ? prevUnhandled.call(window, event) : false;
};

const rawConsoleError = console.error.bind(console);
console.error = (...args: any[]) => {
  const merged = args.map((x) => String((x as any)?.message ?? x ?? "")).join(" ");
  if (RESIZE_OBSERVER_NOISE_RE.test(merged)) return;
  rawConsoleError(...args);
};

// Shield React Flow layout observers from browser ResizeObserver dev noise.
const NativeResizeObserver = window.ResizeObserver;
if (typeof NativeResizeObserver === "function") {
  class SafeResizeObserver extends NativeResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      super((entries, observer) => {
        requestAnimationFrame(() => {
          try {
            callback(entries, observer);
          } catch (e) {
            if (!shouldIgnoreResizeObserverNoise(e)) {
              throw e;
            }
          }
        });
      });
    }
  }
  // @ts-ignore override browser global for dev stability
  window.ResizeObserver = SafeResizeObserver;
}

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
