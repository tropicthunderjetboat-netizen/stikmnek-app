import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// ═══════════════════════════════════════════════════════════════════
// NUCLEAR FIX: Kill all service workers and clear all caches.
// This runs on EVERY page load to ensure no stale SW can trap users.
// ═══════════════════════════════════════════════════════════════════
(async function nukeServiceWorkers() {
  if (!('serviceWorker' in navigator)) return;
  
  try {
    // Unregister ALL service workers
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const reg of registrations) {
      // If there's a waiting worker, activate it first so it can self-destruct
      if (reg.waiting) {
        reg.waiting.postMessage('SKIP_WAITING');
      }
      await reg.unregister();
      console.log('[NUKE] Unregistered SW:', reg.scope);
    }
    
    // Clear ALL caches
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      for (const name of cacheNames) {
        await caches.delete(name);
        console.log('[NUKE] Deleted cache:', name);
      }
    }
    
    if (registrations.length > 0) {
      console.log('[NUKE] All service workers unregistered and caches cleared.');
    }
  } catch (err) {
    console.warn('[NUKE] SW cleanup error (non-fatal):', err);
  }
})();

// Listen for any SW trying to take control and reload
if ('serviceWorker' in navigator) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    console.log('[App] SW controller changed — reloading...');
    window.location.reload();
  });
  
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'FORCE_RELOAD') {
      if (!refreshing) {
        refreshing = true;
        console.log('[App] Force reload from SW v' + event.data.version);
        window.location.reload();
      }
    }
  });
}

// ═══════════════════════════════════════════════════════════════════
// Render the app
// ═══════════════════════════════════════════════════════════════════
createRoot(document.getElementById('root')!).render(<App />);

// Defer error logger initialization
const initErrorLogger = () => {
  import('@/lib/errorLogger').then(({ errorLogger }) => {
    errorLogger.init();
  });
};

if (typeof requestIdleCallback === 'function') {
  requestIdleCallback(initErrorLogger, { timeout: 2000 });
} else {
  setTimeout(initErrorLogger, 50);
}
