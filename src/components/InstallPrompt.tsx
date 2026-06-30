import React, { useState, useEffect, useCallback } from 'react';
import { Download, X, Share, MoreVertical } from 'lucide-react';
import { useAppContext } from '@/contexts/AppContext';
import { APP_ICON } from '@/lib/brand';
import {
  type BeforeInstallPromptEvent,
  getStoredInstallPrompt,
  isIosDevice,
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

/** Phone-class device — the only place a home-screen install makes sense to push. */
function isMobileDevice(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(window.navigator.userAgent) || isIosDevice();
}

/**
 * Deterministic install prompt. On phones it always shows a single button:
 *  - If the browser supports one-tap install (Android Chrome captured a
 *    `beforeinstallprompt`), tapping it installs instantly.
 *  - Otherwise it expands a short, correct instruction for that platform so the
 *    user is never left at a dead end.
 * Once the app is saved (opens standalone) or dismissed, it never shows again.
 */
const InstallPrompt: React.FC = () => {
  const { showAuth } = useAppContext();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    if (alreadyHandled() || wasDismissed()) return;
    if (!isMobileDevice() && !getStoredInstallPrompt()) return;

    void registerPwaServiceWorker();
    setShowBanner(true);

    const capture = (ev: BeforeInstallPromptEvent) => {
      storeInstallPrompt(ev);
      setDeferredPrompt(ev);
    };

    const stored = getStoredInstallPrompt();
    if (stored) capture(stored);

    const promptHandler = (e: Event) => {
      e.preventDefault();
      capture(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', promptHandler);

    const availableHandler = () => {
      const ev = getStoredInstallPrompt();
      if (ev) capture(ev);
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
      window.removeEventListener('beforeinstallprompt', promptHandler);
      window.removeEventListener('stikmnek-install-available', availableHandler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, []);

  const handlePrimary = useCallback(async () => {
    const prompt = deferredPrompt ?? getStoredInstallPrompt();
    if (!prompt) {
      // No native one-tap on this browser — show the manual steps instead.
      setShowHelp((v) => !v);
      return;
    }
    setInstalling(true);
    try {
      const outcome = await triggerPwaInstall(prompt);
      if (outcome === 'accepted') {
        try { localStorage.setItem(INSTALLED_KEY, 'true'); } catch { /* ignore */ }
        setShowBanner(false);
        setDeferredPrompt(null);
        storeInstallPrompt(null);
      } else if (outcome === 'unavailable') {
        setShowHelp(true);
      }
      // 'dismissed' → user cancelled the native dialog; leave the banner to retry.
    } finally {
      setInstalling(false);
    }
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    try { localStorage.setItem(DISMISS_KEY, 'true'); } catch { /* ignore */ }
    setShowBanner(false);
  }, []);

  if (showAuth || !showBanner) return null;

  const ios = isIosDevice();

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
              <p className="text-sm sm:text-base font-bold text-gray-900">Add StikmNek to your phone</p>
              <p className="text-xs sm:text-sm text-gray-500 mt-0.5 truncate">Quick access to deals — no app store needed.</p>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => void handlePrimary()}
                disabled={installing}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white text-sm font-bold hover:from-teal-700 hover:to-emerald-700 transition-all shadow-lg shadow-teal-200/50 disabled:opacity-60"
              >
                {installing ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                <span>{installing ? 'Adding...' : 'Add'}</span>
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

          {showHelp && (
            <div className="mt-3 rounded-xl bg-gray-50 border border-gray-200 px-4 py-3">
              {ios ? (
                <p className="text-sm text-gray-700 flex items-center gap-2 flex-wrap">
                  <span>Tap the</span>
                  <Share className="w-4 h-4 text-teal-600 inline" />
                  <span className="font-semibold">Share</span>
                  <span>button below, then choose</span>
                  <span className="font-semibold">&ldquo;Add to Home Screen&rdquo;</span>.
                </p>
              ) : (
                <p className="text-sm text-gray-700 flex items-center gap-2 flex-wrap">
                  <span>Tap the</span>
                  <MoreVertical className="w-4 h-4 text-teal-600 inline" />
                  <span className="font-semibold">menu</span>
                  <span>(top right), then choose</span>
                  <span className="font-semibold">&ldquo;Add to Home screen&rdquo;</span>
                  <span>or</span>
                  <span className="font-semibold">&ldquo;Install app&rdquo;</span>.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default InstallPrompt;
