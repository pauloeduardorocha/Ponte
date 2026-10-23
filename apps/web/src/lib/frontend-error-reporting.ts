import { APP_VERSION } from './app-version';

type EventType = 'runtime' | 'unhandled_rejection' | 'console' | 'api';
type Report = {
  occurredAt: string;
  eventType: EventType;
  message: string;
  stack?: string;
  route: string;
  clientRequestId?: string;
  apiPath?: string;
  apiMethod?: string;
  apiStatus?: number;
  userAgent: string;
  device: Record<string, string | number | boolean | undefined>;
  logs: Array<{ level: 'warn' | 'error'; at: string; message: string }>;
};

const API_URL: string = import.meta.env.VITE_API_URL ?? '/api/v1';
const breadcrumbs: Report['logs'] = [];
let tokenReader: (() => string | null) | undefined;
let initialized = false;
let sending = false;
const pending: Report[] = [];
const redactions = [
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
  /\b(?:PT\d{2})?\d{21}\b/gi,
];

function safeText(value: unknown, max = 2000): string {
  let text = typeof value === 'string' ? value : value instanceof Error ? `${value.name}: ${value.message}` : String(value);
  // Remove control bytes that can corrupt structured log output.
  // eslint-disable-next-line no-control-regex
  text = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ');
  for (const pattern of redactions) text = text.replace(pattern, '[redacted]');
  return text.slice(0, max);
}

function deviceInfo() {
  const ua = navigator.userAgent;
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iPod/i.test(ua) ? 'iOS' : /Windows/i.test(ua) ? 'Windows' : /Mac OS/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : 'unknown';
  const browser = /Edg\//i.test(ua) ? 'Edge' : /Firefox\//i.test(ua) ? 'Firefox' : /CriOS|Chrome\//i.test(ua) ? 'Chrome' : /Safari\//i.test(ua) ? 'Safari' : 'unknown';
  return {
    appVersion: APP_VERSION,
    os, browser, platform: safeText(navigator.platform, 40), language: safeText(navigator.language, 80),
    timezone: safeText(Intl.DateTimeFormat().resolvedOptions().timeZone, 80),
    viewportWidth: window.innerWidth, viewportHeight: window.innerHeight,
    online: navigator.onLine,
    standalone: (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) || Boolean((navigator as Navigator & { standalone?: boolean }).standalone),
  };
}

function baseReport(eventType: EventType, message: unknown, extra: Partial<Report> = {}): Report {
  return {
    occurredAt: new Date().toISOString(), eventType, message: safeText(message),
    route: `${location.pathname}${location.hash ? '#[redacted]' : ''}`,
    userAgent: safeText(navigator.userAgent, 1024), device: deviceInfo(),
    logs: breadcrumbs.slice(-20).map((entry) => ({ ...entry })), ...extra,
  };
}

async function flush() {
  if (sending || !pending.length || !navigator.onLine) return;
  sending = true;
  try {
    while (pending.length) {
      const report = pending[0];
      try {
        const token = tokenReader?.();
        const response = await fetch(`${API_URL}/client-errors`, {
          method: 'POST', keepalive: true, credentials: 'include',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify(report),
        });
        if (!response.ok) break;
        pending.shift();
      } catch { break; }
    }
  } finally { sending = false; }
}

export function reportFrontendError(eventType: EventType, message: unknown, extra: Partial<Report> = {}) {
  if (!initialized) return;
  if (pending.length >= 20) pending.shift();
  pending.push(baseReport(eventType, message, extra));
  void flush();
}

export function reportApiFailure(details: { path: string; method: string; status?: number; requestId?: string; message: string }) {
  if (/\/client-errors(?:\?|$)/.test(details.path)) return;
  reportFrontendError('api', details.message, {
    apiPath: (details.path.split(/[?#]/, 1)[0] ?? '').slice(0, 512),
    apiMethod: details.method.toUpperCase().slice(0, 10),
    apiStatus: details.status, clientRequestId: details.requestId,
  });
}

export function initFrontendErrorReporting(getToken: () => string | null) {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  tokenReader = getToken;
  window.addEventListener('error', (event) => {
    reportFrontendError('runtime', event.message || event.error, { stack: event.error instanceof Error ? safeText(event.error.stack, 8000) : undefined });
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    reportFrontendError('unhandled_rejection', safeText(reason), { stack: reason instanceof Error ? safeText(reason.stack, 8000) : undefined });
  });
  window.addEventListener('online', () => void flush());
  const original = { warn: console.warn.bind(console), error: console.error.bind(console) };
  for (const level of ['warn', 'error'] as const) {
    console[level] = (...args: unknown[]) => {
      const message = args.filter((entry) => typeof entry === 'string' || entry instanceof Error).map((entry) => safeText(entry, 500)).join(' ').slice(0, 500);
      if (message) {
        breadcrumbs.push({ level, at: new Date().toISOString(), message });
        if (breadcrumbs.length > 20) breadcrumbs.shift();
        if (level === 'error') reportFrontendError('console', message);
      }
      original[level](...args);
    };
  }
}
