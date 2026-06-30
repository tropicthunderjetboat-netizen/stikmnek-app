export const PWA_SW_URL = '/pwa-sw.js';
export const PWA_MIGRATION_KEY = 'stikmnek-pwa-migrated-v4';

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

type WindowWithInstall = Window & {
  __stikmnekDeferredInstall?: BeforeInstallPromptEvent | null;
};

function installWindow(): WindowWithInstall {
  return window as WindowWithInstall;
}

export function getStoredInstallPrompt(): BeforeInstallPromptEvent | null {
  return installWindow().__stikmnekDeferredInstall ?? null;
}

export function storeInstallPrompt(event: BeforeInstallPromptEvent | null): void {
  installWindow().__stikmnekDeferredInstall = event;
}

/** One-time cleanup of legacy self-destruct service workers. */
export async function migrateLegacyServiceWorkers(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  try {
    if (localStorage.getItem(PWA_MIGRATION_KEY)) return;
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const reg of registrations) {
      await reg.unregister();
    }
    if ('caches' in window) {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
    }
    localStorage.setItem(PWA_MIGRATION_KEY, 'true');
  } catch (err) {
    console.warn('[PWA] legacy migration failed:', err);
  }
}

export async function registerPwaServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  await migrateLegacyServiceWorkers();
  try {
    return await navigator.serviceWorker.register(PWA_SW_URL, { scope: '/' });
  } catch (err) {
    console.warn('[PWA] service worker registration failed:', err);
    return null;
  }
}

export async function triggerPwaInstall(
  deferred: BeforeInstallPromptEvent | null,
): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferred) return 'unavailable';
  try {
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === 'accepted') {
      storeInstallPrompt(null);
    }
    return outcome;
  } catch (err) {
    console.warn('[PWA] install prompt failed:', err);
    return 'unavailable';
  }
}

export function isIosDevice(): boolean {
  const ua = window.navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export function isStandaloneDisplay(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
