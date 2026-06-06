import React, { useState, useEffect, useCallback } from 'react';
import { Download, X, Share2, Plus, ChevronRight, Smartphone } from 'lucide-react';
import { useAppContext } from '@/contexts/AppContext';

import { APP_ICON } from '@/lib/brand';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const COOKIE_CONSENT_KEY = 'stikm-cookie-consent';
const DISMISS_KEY = 'stikmnek-install-dismissed';
const BUSINESS_DISMISS_KEY = 'stikmnek-install-dismissed-business';
const DISMISS_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days
const BUSINESS_DISMISS_DURATION = 3 * 24 * 60 * 60 * 1000; // 3 days — re-prompt sooner for owners

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
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const isBusinessUser = user?.type === 'business';
  const isBusinessOnboarding =
    isBusinessUser &&
    (currentView === 'complete-business-profile' ||
      currentView === 'business-dashboard' ||
      currentView === 'business-new');

  const dismissKey = isBusinessUser ? BUSINESS_DISMISS_KEY : DISMISS_KEY;
  const dismissDuration = isBusinessUser ? BUSINESS_DISMISS_DURATION : DISMISS_DURATION;
  const showDelayMs = isBusinessOnboarding ? 1200 : isBusinessUser ? 2000 : 4000;

  // Detect device + standalone mode
  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    setIsStandalone(standalone);
    if (standalone) return;

    const ua = window.navigator.userAgent;
    const iosDetected =
      /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setIsIOS(iosDetected);

    const mobileDetected =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua) ||
      window.innerWidth < 768;
    setIsMobile(mobileDetected);
  }, []);

  // Auto-show banner on mobile after cookie consent + delay (iOS never gets beforeinstallprompt)
  useEffect(() => {
    if (isStandalone || !isMobile || !cookieConsentResolved || showAuth) return;
    if (isDismissedRecently(dismissKey, dismissDuration)) return;

    const timer = window.setTimeout(() => {
      setShowBanner((prev) => prev || true);
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

  // Re-show sooner when a business owner lands on onboarding views
  useEffect(() => {
    if (isStandalone || !isMobile || !cookieConsentResolved || showAuth || !isBusinessOnboarding) return;
    if (isDismissedRecently(BUSINESS_DISMISS_KEY, BUSINESS_DISMISS_DURATION)) return;

    const timer = window.setTimeout(() => {
      setShowBanner(true);
    }, 800);

    return () => window.clearTimeout(timer);
  }, [isStandalone, isMobile, cookieConsentResolved, showAuth, isBusinessOnboarding, currentView]);

  // Listen for beforeinstallprompt (Android/Chrome/Edge) — rare without a service worker
  useEffect(() => {
    if (isStandalone) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      if (isDismissedRecently(dismissKey, dismissDuration)) return;
      setShowBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    const installedHandler = () => {
      setShowBanner(false);
      setDeferredPrompt(null);
      setIsStandalone(true);
    };
    window.addEventListener('appinstalled', installedHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, [isStandalone, dismissKey, dismissDuration]);

  const handleInstall = useCallback(async () => {
    if (isIOS) {
      setShowIOSModal(true);
      setShowBanner(false);
      return;
    }

    if (deferredPrompt) {
      setInstalling(true);
      try {
        await deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          setShowBanner(false);
          setDeferredPrompt(null);
        }
      } catch (err) {
        console.warn('[InstallPrompt] Install failed:', err);
      } finally {
        setInstalling(false);
      }
    } else {
      setShowIOSModal(true);
      setShowBanner(false);
    }
  }, [deferredPrompt, isIOS]);

  const handleDismiss = useCallback(() => {
    setShowBanner(false);
    setShowIOSModal(false);
    localStorage.setItem(dismissKey, String(Date.now()));
  }, [dismissKey]);

  if (isStandalone || showAuth) return null;
  if (!showBanner && !showIOSModal) return null;

  const title = isBusinessUser
    ? 'Save StikmNek to Home Screen'
    : isMobile
      ? 'Add StikmNek to Home Screen'
      : 'Install StikmNek App';

  const subtitle = isBusinessUser
    ? 'Quick access to finish your listing and scan passes'
    : 'Quick access to deals — works offline too!';

  return (
    <>
      {showBanner && (
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
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={handleInstall}
                    disabled={installing}
                    className="flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white text-sm font-bold hover:from-teal-700 hover:to-emerald-700 transition-all shadow-lg shadow-teal-200/50 disabled:opacity-60"
                  >
                    {installing ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    <span className="hidden sm:inline">
                      {installing ? 'Installing...' : 'Install'}
                    </span>
                    <span className="sm:hidden">{installing ? '...' : 'Add'}</span>
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
      )}

      {showIOSModal && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={handleDismiss}
        >
          <div
            className="relative w-full max-w-md mx-4 mb-0 sm:mb-0 bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-r from-teal-600 to-emerald-600 p-6 text-white relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-16 translate-x-16" />
              <div className="absolute bottom-0 left-0 w-20 h-20 bg-white/10 rounded-full translate-y-10 -translate-x-10" />
              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl overflow-hidden shadow-lg bg-white/20">
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
                  <div>
                    <h3 className="font-extrabold text-lg">Add to Home Screen</h3>
                    <p className="text-white/80 text-sm">
                      {isBusinessUser ? 'Finish your listing anytime' : 'Quick access to StikmNek'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleDismiss}
                  className="w-9 h-9 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-5">
              <p className="text-sm text-gray-600">
                {isBusinessUser
                  ? 'Save StikmNek on your phone so you can finish your listing, upload photos, and scan tourist passes — just follow these steps:'
                  : 'Install StikmNek on your device for quick access — just follow these simple steps:'}
              </p>

              {isIOS ? (
                <>
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                      <span className="text-sm font-extrabold text-blue-600">1</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-gray-900">Tap the Share button</p>
                      <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5">
                        Look for the
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 font-semibold">
                          <Share2 className="w-3 h-3" /> Share
                        </span>
                        icon in Safari&apos;s toolbar
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center">
                      <span className="text-sm font-extrabold text-teal-600">2</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-gray-900">
                        Scroll down and tap &quot;Add to Home Screen&quot;
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5">
                        Look for
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 font-semibold">
                          <Plus className="w-3 h-3" /> Add to Home Screen
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                      <span className="text-sm font-extrabold text-emerald-600">3</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-gray-900">Tap &quot;Add&quot; to confirm</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        StikmNek will appear on your home screen like a regular app!
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                      <span className="text-sm font-extrabold text-blue-600">1</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-gray-900">Open browser menu</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Tap the three dots (&#8942;) in the top-right corner of your browser
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center">
                      <span className="text-sm font-extrabold text-teal-600">2</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-gray-900">
                        Tap &quot;Install app&quot; or &quot;Add to Home Screen&quot;
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5">
                        Look for
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 font-semibold">
                          <Smartphone className="w-3 h-3" /> Install app
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                      <span className="text-sm font-extrabold text-emerald-600">3</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-gray-900">Confirm the installation</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        StikmNek will appear on your home screen like a regular app!
                      </p>
                    </div>
                  </div>
                </>
              )}

              <div className="p-4 rounded-xl bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-100">
                <p className="text-xs font-bold text-teal-800 mb-2">Why add to home screen?</p>
                <ul className="space-y-1.5">
                  <li className="flex items-center gap-2 text-xs text-teal-700">
                    <ChevronRight className="w-3 h-3 flex-shrink-0" />
                    {isBusinessUser
                      ? 'Come back easily to finish your listing'
                      : 'Open instantly — no browser needed'}
                  </li>
                  <li className="flex items-center gap-2 text-xs text-teal-700">
                    <ChevronRight className="w-3 h-3 flex-shrink-0" />
                    Full-screen experience, no address bar
                  </li>
                  <li className="flex items-center gap-2 text-xs text-teal-700">
                    <ChevronRight className="w-3 h-3 flex-shrink-0" />
                    {isBusinessUser
                      ? 'Scan tourist passes right from your phone'
                      : 'Works even with poor connectivity'}
                  </li>
                </ul>
              </div>

              <button
                onClick={handleDismiss}
                className="w-full py-3 rounded-xl bg-gray-100 text-gray-600 text-sm font-semibold hover:bg-gray-200 transition-colors"
              >
                Maybe Later
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default InstallPrompt;
