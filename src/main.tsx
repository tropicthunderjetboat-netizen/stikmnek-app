import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import '@/lib/analytics';

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
