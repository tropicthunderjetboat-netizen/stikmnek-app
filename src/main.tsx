import { createRoot } from 'react-dom/client';
import { useLayoutEffect, type ReactNode } from 'react';
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

/** Dismiss the inline #ssg-boot cover once React has committed its first paint. */
function SsgBootDismiss({ children }: { children: ReactNode }) {
  useLayoutEffect(() => {
    document.documentElement.classList.add('app-ready');
    const boot = document.getElementById('ssg-boot');
    if (boot) boot.remove();
    try {
      const shownAt = (window as Window & { __ssgBootShownAt?: number }).__ssgBootShownAt;
      if (typeof shownAt === 'number' && typeof performance !== 'undefined') {
        const ms = Math.round(performance.now() - shownAt);
        (window as Window & { __ssgBootVisibleMs?: number }).__ssgBootVisibleMs = ms;
        if (import.meta.env.DEV) {
          console.debug(`[ssg-boot] cover visible ~${ms}ms before React commit`);
        }
      }
    } catch {
      /* ignore */
    }
  }, []);
  return children;
}

// ═══════════════════════════════════════════════════════════════════
// Render the app (skip if we just triggered a redirect to /reset-password)
// ═══════════════════════════════════════════════════════════════════
if (!isRecoveryOnWrongPage) {
  createRoot(document.getElementById('root')!).render(
    <SsgBootDismiss>
      <App />
    </SsgBootDismiss>,
  );
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
