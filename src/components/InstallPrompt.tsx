import React, { useState, useEffect, useCallback } from 'react';
import { Download, X } from 'lucide-react';
import { useAppContext } from '@/contexts/AppContext';
import { APP_ICON } from '@/lib/brand';
import {
  type BeforeInstallPromptEvent,
  getStoredInstallPrompt,
  isStandaloneDisplay,
  registerPwaServiceWorker,
  storeInstallPrompt,
  triggerPwaInstall,
} from '@/lib/pwaInstall';

const DISMISS_KEY = 'stikmnek-install-dismissed';
const INSTALLED_KEY = 'stikmnek-install-done';

/** Already installed (running standalone) or saved before — never prompt again. */
function alreadyHandled(): boolean {
  try {
    if (localStorage.getItem(INSTALLED_KEY) === 'true') return true;
  } catch {
    /* ignore */
  }
  return isStandaloneDisplay();
}

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Minimal one-tap install prompt. The banner only appears when the browser can
 * actually install in one tap (it captured a `beforeinstallprompt` event — i.e.
 * Android Chrome / desktop Chromium). Tap Save → native install. Once saved (or
 * dismissed) it never shows again.
 */
const InstallPrompt: React.FC = () => {
  const { showAuth } = useAppContext();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (alreadyHandled()) return;

    void registerPwaServiceWorker();

    const reveal = (ev: BeforeInstallPromptEvent) => {
      storeInstallPrompt(ev);
      setDeferredPrompt(ev);
      if (!wasDismissed()) setShowBanner(true);
    };

    // Event captured by the early inline script in index.html before React mounted.
    const stored = getStoredInstallPrompt();
    if (stored) reveal(stored);

    const handler = (e: Event) => {
      e.preventDefault();
      reveal(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // Fired by the early inline capture when the install event arrives after mount.
    const availableHandler = () => {
      const ev = getStoredInstallPrompt();
      if (ev) reveal(ev);
    };
    window.addEventListener('stikmnek-install-available', availableHandler);

    const installedHandler = () => {
      try { localStorage.setItem(INSTALLED_KEY, 'true'); } catch { /* ignore */ }
      setShowBanner(false);
      setDeferredPrompt(null);
      storeInstallPrompt(null);
    };
    window.addEventListener('appinstalled', installedHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('stikmnek-install-available', availableHandler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, []);

  const handleSave = useCallback(async () => {
    setInstalling(true);
    try {
      const outcome = await triggerPwaInstall(deferredPrompt ?? getStoredInstallPrompt());
      if (outcome === 'accepted') {
        try { localStorage.setItem(INSTALLED_KEY, 'true'); } catch { /* ignore */ }
        setShowBanner(false);
        setDeferredPrompt(null);
        storeInstallPrompt(null);
      }
      // 'dismissed' (cancelled the native dialog) → leave the banner so they can retry.
    } finally {
      setInstalling(false);
    }
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    try { localStorage.setItem(DISMISS_KEY, 'true'); } catch { /* ignore */ }
    setShowBanner(false);
  }, []);

  if (showAuth || !showBanner || !deferredPrompt) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[95] animate-in slide-in-from-bottom duration-500">
      <div className="bg-white border-t border-gray-200 shadow-[0_-4px_20px_rgba(0,0,0,0.12)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="flex-shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-2xl overflow-hidden shadow-lg shadow-teal-200/50 bg-gradient-to-br from-teal-500 to-emerald-600">
              <img
                src={APP_ICON}
                alt="StikmNek"
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm sm:text-base font-bold text-gray-900">Save StikmNek to your phone</p>
              <p className="text-xs sm:text-sm text-gray-500 mt-0.5 truncate">One tap — quick access to deals, no app store needed.</p>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => void handleSave()}
                disabled={installing}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white text-sm font-bold hover:from-teal-700 hover:to-emerald-700 transition-all shadow-lg shadow-teal-200/50 disabled:opacity-60"
              >
                {installing ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                <span>{installing ? 'Saving...' : 'Save'}</span>
              </button>
              <button
                onClick={handleDismiss}
                className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                aria-label="Dismiss install prompt"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InstallPrompt;
