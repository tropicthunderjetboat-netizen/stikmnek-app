import React, { useState, useEffect, useCallback } from 'react';
import { Download, X } from 'lucide-react';
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
  waitForInstallPrompt,
} from '@/lib/pwaInstall';

const COOKIE_CONSENT_KEY = 'stikm-cookie-consent';
const DISMISS_KEY = 'stikmnek-install-dismissed';
const BUSINESS_DISMISS_KEY = 'stikmnek-install-dismissed-business';
const DISMISS_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days
const BUSINESS_DISMISS_DURATION = 3 * 24 * 60 * 60 * 1000; // 3 days

function isDismissedRecently(key: string, duration: number): boolean {
  const dismissedAt = localStorage.getItem(key);
  if (!dismissedAt) return false;
  const elapsed = Date.now() - parseInt(dismissedAt, 10);
  if (elapsed < duration) return true;
  localStorage.removeItem(key);
  return false;
}

function useCookieConsentResolved(): boolean {
  const [resolved, setResolved] = useState(() => {
    try {
      return Boolean(localStorage.getItem(COOKIE_CONSENT_KEY));
    } catch {
      return true;
    }
  });

  useEffect(() => {
    if (resolved) return;

    const check = () => {
      try {
        if (localStorage.getItem(COOKIE_CONSENT_KEY)) setResolved(true);
      } catch {
        setResolved(true);
      }
    };

    const intervalId = window.setInterval(check, 400);
    window.addEventListener('storage', check);
    window.addEventListener('stikmnek-cookie-consent-set', check);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('storage', check);
      window.removeEventListener('stikmnek-cookie-consent-set', check);
    };
  }, [resolved]);

  return resolved;
}

const InstallPrompt: React.FC = () => {
  const { user, currentView, showAuth } = useAppContext();
  const cookieConsentResolved = useCookieConsentResolved();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [inlineHint, setInlineHint] = useState<string | null>(null);

  const isBusinessUser = user?.type === 'business';
  const isBusinessOnboarding =
    isBusinessUser &&
    (currentView === 'complete-business-profile' ||
      currentView === 'business-dashboard' ||
      currentView === 'business-new');

  const dismissKey = isBusinessUser ? BUSINESS_DISMISS_KEY : DISMISS_KEY;
  const dismissDuration = isBusinessUser ? BUSINESS_DISMISS_DURATION : DISMISS_DURATION;
  const showDelayMs = isBusinessOnboarding ? 1200 : isBusinessUser ? 2000 : 4000;

  useEffect(() => {
    if (isStandaloneDisplay()) {
      setIsStandalone(true);
      return;
    }

    const ua = window.navigator.userAgent;
    const mobileDetected =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua) ||
      window.innerWidth < 768;
    setIsMobile(mobileDetected);

    void registerPwaServiceWorker();

    const stored = getStoredInstallPrompt();
    if (stored) setDeferredPrompt(stored);
  }, []);

  useEffect(() => {
    if (isStandalone || !isMobile || !cookieConsentResolved || showAuth) return;
    if (isDismissedRecently(dismissKey, dismissDuration)) return;

    const timer = window.setTimeout(() => {
      setShowBanner(true);
    }, showDelayMs);

    return () => window.clearTimeout(timer);
  }, [
    isStandalone,
    isMobile,
    cookieConsentResolved,
    showAuth,
    dismissKey,
    dismissDuration,
    showDelayMs,
  ]);

  useEffect(() => {
    if (isStandalone || !isMobile || !cookieConsentResolved || showAuth || !isBusinessOnboarding) return;
    if (isDismissedRecently(BUSINESS_DISMISS_KEY, BUSINESS_DISMISS_DURATION)) return;

    const timer = window.setTimeout(() => {
      setShowBanner(true);
    }, 800);

    return () => window.clearTimeout(timer);
  }, [isStandalone, isMobile, cookieConsentResolved, showAuth, isBusinessOnboarding, currentView]);

  useEffect(() => {
    if (isStandalone) return;

    const handler = (e: Event) => {
      e.preventDefault();
      const ev = e as BeforeInstallPromptEvent;
      storeInstallPrompt(ev);
      setDeferredPrompt(ev);
      if (isDismissedRecently(dismissKey, dismissDuration)) return;
      setShowBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    const installedHandler = () => {
      setShowBanner(false);
      setDeferredPrompt(null);
      storeInstallPrompt(null);
      setIsStandalone(true);
      setInlineHint(null);
    };
    window.addEventListener('appinstalled', installedHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, [isStandalone, dismissKey, dismissDuration]);

  const handleInstall = useCallback(async () => {
    setInlineHint(null);
    setInstalling(true);

    try {
      await registerPwaServiceWorker();

      let prompt = deferredPrompt ?? getStoredInstallPrompt();
      if (!prompt) {
        prompt = await waitForInstallPrompt(2500);
        if (prompt) {
          setDeferredPrompt(prompt);
        }
      }

      const outcome = await triggerPwaInstall(prompt);
      if (outcome === 'accepted') {
        setShowBanner(false);
        setDeferredPrompt(null);
        return;
      }

      if (outcome === 'dismissed') {
        return;
      }

      if (isIosDevice()) {
        setInlineHint('On iPhone: tap Share in Safari, then “Add to Home Screen”.');
      } else {
        setInlineHint('Install needs Chrome or Edge. Open stikmnek.com there and tap Save again.');
      }
    } catch (err) {
      console.warn('[InstallPrompt] Install failed:', err);
      setInlineHint('Could not open install. Try Chrome or Edge on this phone.');
    } finally {
      setInstalling(false);
    }
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    setShowBanner(false);
    setInlineHint(null);
    localStorage.setItem(dismissKey, String(Date.now()));
  }, [dismissKey]);

  if (isStandalone || showAuth || !showBanner) return null;

  const title = isBusinessUser
    ? 'Save StikmNek to Home Screen'
    : isMobile
      ? 'Add StikmNek to Home Screen'
      : 'Install StikmNek App';

  const subtitle = isBusinessUser
    ? 'Quick access to finish your listing and scan passes'
    : 'Quick access to deals — works offline too!';

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
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                }}
              />
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm sm:text-base font-bold text-gray-900">{title}</p>
              <p className="text-xs sm:text-sm text-gray-500 mt-0.5 truncate">{subtitle}</p>
              {inlineHint && (
                <p className="text-[11px] text-amber-800 font-medium mt-1 leading-snug">{inlineHint}</p>
              )}
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => void handleInstall()}
                disabled={installing}
                className="flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white text-sm font-bold hover:from-teal-700 hover:to-emerald-700 transition-all shadow-lg shadow-teal-200/50 disabled:opacity-60"
              >
                {installing ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                <span className="hidden sm:inline">
                  {installing ? 'Saving...' : 'Save'}
                </span>
                <span className="sm:hidden">{installing ? '...' : 'Save'}</span>
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
