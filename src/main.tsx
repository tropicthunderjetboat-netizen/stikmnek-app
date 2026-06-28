import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// ═══════════════════════════════════════════════════════════════════
// PASSWORD RESET: If user landed on any path with recovery hash, send
// them to /reset-password so the "Set new password" form is shown.
// (Supabase email link sometimes redirects to Site URL "/" instead of
// the redirectTo we send; without this, they get logged in on home with
// no way to change password.)
// ═══════════════════════════════════════════════════════════════════
const isRecoveryOnWrongPage =
  typeof window !== 'undefined' &&
  window.location.hash.includes('type=recovery') &&
  ((window.location.pathname.replace(/\/$/, '') || '/') !== '/reset-password');
// #region agent log
try {
  if (typeof window !== 'undefined') {
    const _h = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
    const _s = new URLSearchParams(window.location.search || '');
    fetch('http://127.0.0.1:7607/ingest/08ca587e-0a1d-4571-8adc-bbc01b0f0e0b', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'e04eda' }, body: JSON.stringify({ sessionId: 'e04eda', runId: 'initial', hypothesisId: 'B,D', location: 'main.tsx:bootstrap', message: 'app bootstrap recovery check', data: { host: window.location.host, pathname: window.location.pathname, isRecoveryOnWrongPage, hashHasRecovery: window.location.hash.includes('type=recovery'), hashHasError: _h.has('error'), searchHasCode: _s.has('code'), searchHasError: _s.has('error') }, timestamp: Date.now() }) }).catch(() => {});
  }
} catch { /* ignore */ }
// #endregion
if (isRecoveryOnWrongPage) {
  window.location.replace(window.location.origin + '/reset-password' + window.location.hash);
}

// Register installable PWA service worker (enables native Add to Home on supported browsers).
import { registerPwaServiceWorker } from '@/lib/pwaInstall';

void registerPwaServiceWorker();

// ═══════════════════════════════════════════════════════════════════
// Render the app (skip if we just triggered a redirect to /reset-password)
// ═══════════════════════════════════════════════════════════════════
if (!isRecoveryOnWrongPage) {
  createRoot(document.getElementById('root')!).render(<App />);
}

// Defer perf + error logger initialization (keep main thread free for FCP/LCP).
const initPerfAndErrorLogger = () => {
  import('@/lib/errorLogger').then(({ errorLogger }) => {
    errorLogger.init();
  });
  import('@/lib/perf').then(({ initPerfMonitoring }) => {
    initPerfMonitoring();
  });
};

if (typeof requestIdleCallback === 'function') {
  requestIdleCallback(initPerfAndErrorLogger, { timeout: 2000 });
} else {
  setTimeout(initPerfAndErrorLogger, 50);
}
