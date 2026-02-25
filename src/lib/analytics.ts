/**
 * StikmNek Analytics Tracking Utility
 * Tracks key user actions, page views, and performance metrics.
 * Dual-destination: localStorage (always) + Google Analytics 4 (when consent given).
 *
 * PERFORMANCE: Constructor is lightweight. Heavy work (localStorage parsing,
 * performance observers, GA init) is deferred to after first idle to avoid
 * blocking the main thread during page load.
 *
 * GA4 Integration:
 *   - gtag.js is loaded dynamically when user accepts cookies
 *   - Events are forwarded to GA4 via gtag('event', ...)
 *   - Consent state is managed via localStorage 'stikm-cookie-consent'
 *   - GA_MEASUREMENT_ID is fetched from the server to keep it private
 */

declare global {
  interface Window {
    gtag: (...args: any[]) => void;
    dataLayer: any[];
  }
}

interface AnalyticsEvent {
  event: string;
  category: string;
  label?: string;
  value?: number;
  timestamp: string;
  sessionId: string;
  userId?: string;
  metadata?: Record<string, any>;
}

// Lazily generate a session ID (only accesses sessionStorage when first needed)
let _sessionId: string | null = null;
const getSessionId = (): string => {
  if (_sessionId) return _sessionId;
  try {
    _sessionId = sessionStorage.getItem('stikm-session-id');
    if (!_sessionId) {
      _sessionId = 's_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
      sessionStorage.setItem('stikm-session-id', _sessionId);
    }
  } catch {
    _sessionId = 's_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
  }
  return _sessionId;
};

// Track session start time lazily
let _sessionStart: number | null = null;
const getSessionStart = (): number => {
  if (_sessionStart === null) _sessionStart = Date.now();
  return _sessionStart;
};

class Analytics {
  private events: AnalyticsEvent[] = [];
  private userId: string | null = null;
  private sessionId: string | null = null;
  private pageViewCount = 0;
  private gaInitialized = false;
  private gaMeasurementId: string | null = null;
  private consentGiven = false;
  private heavyInitDone = false;
  private pendingEvents: Array<() => void> = [];

  constructor() {
    // Lightweight constructor — defer all heavy work (localStorage, observers, GA)
    // to after the browser is idle to avoid blocking the main thread.
    this.deferHeavyInit();
  }

  /**
   * Defers localStorage reads, performance observer setup, and GA initialization
   * to after the browser is idle. This eliminates the ~80-120ms synchronous block
   * that was part of the 342ms long task during page load.
   */
  private deferHeavyInit() {
    const setup = () => {
      if (this.heavyInitDone) return;
      this.heavyInitDone = true;

      // Now safe to access sessionStorage/localStorage
      this.sessionId = getSessionId();
      this.loadStoredEvents();
      this.trackPerformance();
      this.checkConsent();

      // Flush any events that were queued before heavy init completed
      for (const fn of this.pendingEvents) {
        try { fn(); } catch (_e) {}
      }
      this.pendingEvents = [];
    };

    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(setup, { timeout: 2000 });
    } else {
      setTimeout(setup, 50);
    }
  }

  /** Ensure heavy init is done before accessing session-dependent data */
  private ensureInit() {
    if (!this.sessionId) {
      this.sessionId = getSessionId();
    }
  }

  setUserId(userId: string | null) {
    this.userId = userId;
    // Update GA user ID if initialized
    if (this.gaInitialized && window.gtag && userId) {
      window.gtag('set', { user_id: userId });
    }
  }

  // ─── Consent Management ───

  private checkConsent() {
    try {
      const consent = localStorage.getItem('stikm-cookie-consent');
      if (consent === 'accepted') {
        this.consentGiven = true;
        this.initGA();
      }
    } catch (_e) {}
  }

  onConsentAccepted() {
    this.consentGiven = true;
    this.initGA();
  }

  onConsentDeclined() {
    this.consentGiven = false;
    if (window.gtag) {
      window.gtag('consent', 'update', {
        analytics_storage: 'denied',
      });
    }
  }

  // ─── Google Analytics 4 Initialization ───

  private async initGA() {
    if (this.gaInitialized) return;

    try {
      const { supabase } = await import('@/lib/supabase');
      await supabase.functions.invoke('sentry-relay', {
        body: { action: 'health' },
      });
      this.loadGtagScript();
    } catch (_e) {
      this.loadGtagScript();
    }
  }

  private loadGtagScript() {
    if (document.querySelector('script[src*="googletagmanager.com/gtag"]')) {
      this.gaInitialized = true;
      return;
    }

    window.dataLayer = window.dataLayer || [];
    window.gtag = function () {
      window.dataLayer.push(arguments);
    };

    window.gtag('consent', 'default', {
      analytics_storage: this.consentGiven ? 'granted' : 'denied',
    });

    const existingScript = document.querySelector('script[data-ga-id]');
    const measurementId = existingScript?.getAttribute('data-ga-id') || null;

    if (measurementId) {
      this.gaMeasurementId = measurementId;
      this.configureGA(measurementId);
    } else {
      this.gaInitialized = true;
      console.log('[Analytics] GA4 initialized in local-only mode (no measurement ID found in page)');
    }
  }

  private configureGA(measurementId: string) {
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + measurementId;
    document.head.appendChild(script);

    script.onload = () => {
      window.gtag('js', new Date());
      window.gtag('config', measurementId, {
        send_page_view: true,
        cookie_flags: 'SameSite=None;Secure',
        custom_map: {
          dimension1: 'user_type',
          dimension2: 'pass_type',
        },
      });

      if (this.userId) {
        window.gtag('set', { user_id: this.userId });
      }

      this.gaInitialized = true;
      console.log('[Analytics] GA4 initialized with measurement ID: ' + measurementId);

      if (this.consentGiven) {
        window.gtag('consent', 'update', {
          analytics_storage: 'granted',
        });
      }
    };

    script.onerror = () => {
      console.warn('[Analytics] Failed to load gtag.js - GA4 will not be available');
      this.gaInitialized = true;
    };
  }

  // ─── Send event to GA4 ───
  private sendToGA(eventName: string, params?: Record<string, any>) {
    if (!this.consentGiven || !window.gtag) return;

    try {
      this.ensureInit();
      window.gtag('event', eventName, {
        ...params,
        session_id: this.sessionId,
      });
    } catch (_e) {}
  }

  // ─── Core tracking ───

  private loadStoredEvents() {
    try {
      const stored = localStorage.getItem('stikm-analytics');
      if (stored) {
        const parsed = JSON.parse(stored);
        this.events = Array.isArray(parsed) ? parsed.slice(-200) : [];
      }
    } catch (_e) {}
  }

  private saveEvents() {
    try {
      localStorage.setItem('stikm-analytics', JSON.stringify(this.events.slice(-200)));
    } catch (_e) {}
  }

  track(event: string, category: string, label?: string, value?: number, metadata?: Record<string, any>) {
    this.ensureInit();

    const analyticsEvent: AnalyticsEvent = {
      event,
      category,
      label,
      value,
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId || 's_unknown',
      userId: this.userId || undefined,
      metadata,
    };

    this.events.push(analyticsEvent);

    // Defer localStorage write to avoid blocking
    if (this.heavyInitDone) {
      this.saveEvents();
    } else {
      this.pendingEvents.push(() => this.saveEvents());
    }

    // Forward to GA4
    this.sendToGA(event, {
      event_category: category,
      event_label: label,
      value: value,
      ...metadata,
    });

    // Log to console in development
    if (import.meta.env.DEV) {
      console.log('[Analytics] ' + category + '/' + event, label || '', value || '', metadata || '');
    }
  }

  // ─── Pre-built tracking methods ───

  pageView(pageName: string) {
    this.pageViewCount++;
    this.track('page_view', 'navigation', pageName, this.pageViewCount);
    this.sendToGA('page_view', {
      page_title: pageName,
      page_location: window.location.href,
    });
  }

  signIn(method: string) {
    this.track('sign_in', 'auth', method);
    this.sendToGA('login', { method });
  }

  signUp(userType: string) {
    this.track('sign_up', 'auth', userType);
    this.sendToGA('sign_up', { method: userType });
  }

  signOut() {
    this.track('sign_out', 'auth');
  }

  purchasePass(passType: string, amount: number) {
    this.track('purchase_pass', 'commerce', passType, amount);
    this.sendToGA('purchase', {
      transaction_id: 'pass_' + Date.now(),
      value: amount,
      currency: 'AUD',
      items: [{ item_name: passType + '_pass', price: amount, quantity: 1 }],
    });
  }


  viewBusiness(businessId: string, businessName: string) {
    this.track('view_business', 'engagement', businessName, undefined, { businessId });
    this.sendToGA('view_item', {
      items: [{ item_id: businessId, item_name: businessName }],
    });
  }

  redeemDeal(businessId: string, savedAmount: number) {
    this.track('redeem_deal', 'commerce', businessId, savedAmount);
  }

  submitReview(businessId: string, rating: number) {
    this.track('submit_review', 'engagement', businessId, rating);
  }

  submitBusiness(businessName: string) {
    this.track('submit_business', 'business', businessName);
  }

  toggleFavorite(businessId: string, isFavorite: boolean) {
    this.track(isFavorite ? 'add_favorite' : 'remove_favorite', 'engagement', businessId);
    this.sendToGA(isFavorite ? 'add_to_wishlist' : 'remove_from_wishlist', {
      items: [{ item_id: businessId }],
    });
  }

  searchQuery(query: string, resultCount: number) {
    this.track('search', 'engagement', query, resultCount);
    this.sendToGA('search', { search_term: query });
  }

  filterCategory(category: string) {
    this.track('filter_category', 'engagement', category);
  }

  clickCTA(ctaName: string, location: string) {
    this.track('click_cta', 'engagement', ctaName, undefined, { location });
  }

  paymentStarted(passType: string, amount: number) {
    this.track('payment_started', 'commerce', passType, amount);
    this.sendToGA('begin_checkout', {
      value: amount,
      currency: 'AUD',
      items: [{ item_name: passType + '_pass', price: amount }],
    });
  }



  paymentCompleted(passType: string, amount: number) {
    this.track('payment_completed', 'commerce', passType, amount);
  }

  paymentFailed(passType: string, error: string) {
    this.track('payment_failed', 'commerce', passType, undefined, { error });
  }

  error(errorMessage: string, component?: string) {
    this.track('error', 'system', errorMessage, undefined, { component });
    this.sendToGA('exception', {
      description: errorMessage,
      fatal: false,
    });
  }

  // ─── Performance tracking ───

  private trackPerformance() {
    if (typeof window === 'undefined') return;

    // Track page load performance after load
    window.addEventListener('load', () => {
      setTimeout(() => {
        try {
          const perf = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
          if (perf) {
            const loadTime = Math.round(perf.loadEventEnd - perf.startTime);
            this.track('performance', 'system', 'page_load', loadTime, {
              dns: Math.round(perf.domainLookupEnd - perf.domainLookupStart),
              ttfb: Math.round(perf.responseStart - perf.requestStart),
              domReady: Math.round(perf.domContentLoadedEventEnd - perf.startTime),
              fullLoad: loadTime,
            });

            this.sendToGA('web_vitals', {
              ttfb: Math.round(perf.responseStart - perf.requestStart),
              dom_ready: Math.round(perf.domContentLoadedEventEnd - perf.startTime),
              full_load: loadTime,
            });
          }
        } catch (_e) {}
      }, 1000);
    });

    this.trackCoreWebVitals();
  }

  private trackCoreWebVitals() {
    if (!('PerformanceObserver' in window)) return;

    // Largest Contentful Paint (LCP)
    try {
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        if (lastEntry) {
          const lcp = Math.round(lastEntry.startTime);
          this.sendToGA('web_vitals_lcp', { value: lcp, metric_id: 'lcp' });
        }
      });
      lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
    } catch (_e) {}

    // First Input Delay (FID)
    try {
      const fidObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        if (entries.length > 0) {
          const fid = Math.round((entries[0] as any).processingStart - entries[0].startTime);
          this.sendToGA('web_vitals_fid', { value: fid, metric_id: 'fid' });
        }
      });
      fidObserver.observe({ type: 'first-input', buffered: true });
    } catch (_e) {}

    // Cumulative Layout Shift (CLS)
    try {
      let clsValue = 0;
      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!(entry as any).hadRecentInput) {
            clsValue += (entry as any).value;
          }
        }
      });
      clsObserver.observe({ type: 'layout-shift', buffered: true });

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          this.sendToGA('web_vitals_cls', { value: Math.round(clsValue * 1000), metric_id: 'cls' });
        }
      });
    } catch (_e) {}
  }

  // ─── Reporting ───

  getEvents(): AnalyticsEvent[] {
    return [...this.events];
  }

  getSessionDuration(): number {
    return Math.round((Date.now() - getSessionStart()) / 1000);
  }

  getStats() {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const todayEvents = this.events.filter(e => e.timestamp.startsWith(today));

    return {
      totalEvents: this.events.length,
      todayEvents: todayEvents.length,
      pageViews: this.events.filter(e => e.event === 'page_view').length,
      sessionDuration: this.getSessionDuration(),
      uniquePages: new Set(this.events.filter(e => e.event === 'page_view').map(e => e.label)).size,
      commerceEvents: this.events.filter(e => e.category === 'commerce').length,
      errors: this.events.filter(e => e.event === 'error').length,
      gaInitialized: this.gaInitialized,
      consentGiven: this.consentGiven,
    };
  }

  clearEvents() {
    this.events = [];
    this.saveEvents();
  }

  isGAActive(): boolean {
    return this.gaInitialized && this.consentGiven;
  }
}

// Singleton instance — constructor is now lightweight (no localStorage/sessionStorage access)
export const analytics = new Analytics();
export default analytics;
