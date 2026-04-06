/**
 * StikmNek Error Logger
 * Captures runtime errors, unhandled rejections, and manual error reports.
 * Stores in Supabase error_logs table + localStorage fallback + Sentry relay.
 *
 * PERFORMANCE: init() defers heavy work (PerformanceObserver, Sentry health check)
 * to avoid blocking the main thread during page load.
 *
 * Sentry relay: all Edge Function invokes are wrapped — failures log a console warning
 * and never throw. In development, relay can be skipped via VITE_SENTRY_RELAY_IN_DEV
 * (default false) to reduce noise; set VITE_SENTRY_RELAY_IN_DEV=true to test the relay locally.
 */

import { supabase } from '@/lib/supabase';

interface ErrorLogEntry {
  error_type: string;
  error_message: string;
  error_stack?: string;
  component?: string;
  page_url: string;
  user_agent: string;
  metadata?: Record<string, any>;
  severity: 'warning' | 'error' | 'critical';
}

const isDev = import.meta.env.DEV;
/** When false (default in dev), outbound sentry-relay calls are skipped except health check soft-fail. */
const sentryRelayInDev = import.meta.env.VITE_SENTRY_RELAY_IN_DEV === 'true';

class ErrorLogger {
  private userId: string | null = null;
  private buffer: ErrorLogEntry[] = [];
  private sentryBuffer: ErrorLogEntry[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private sentryFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private initialized = false;
  private sentryEnabled = true;
  private originalConsoleError: ((...args: any[]) => void) | null = null;
  /** Re-entrancy guard: prevents the console.error interceptor from
   *  capturing errors that originate from within the logger itself. */
  private isProcessing = false;

  init() {
    if (this.initialized) return;
    this.initialized = true;

    this.originalConsoleError = console.error.bind(console);

    const self = this;
    console.error = function (...args: any[]) {
      self.originalConsoleError?.(...args);

      if (self.isProcessing) return;

      let msg: string;
      try {
        msg = args
          .map((a) =>
            typeof a === 'string'
              ? a
              : a instanceof Error
                ? a.message
                : typeof a === 'object' && a !== null
                  ? a.message || ''
                  : String(a)
          )
          .join(' ');
      } catch {
        return;
      }

      if (
        msg.includes('[ErrorLogger]') ||
        msg.includes('[ErrorBoundary]')
      ) {
        return;
      }

      const hasSynthetic = args.some(
        (a) => typeof a === 'object' && a !== null && a._synthetic === true
      );
      if (hasSynthetic) return;

      if (
        msg.includes('Warning:') ||
        msg.includes('React does not recognize') ||
        msg.includes('Each child in a list') ||
        msg.includes('Cannot update a component')
      ) {
        return;
      }

      try {
        self.isProcessing = true;
        self.log({
          error_type: 'console_error',
          error_message: msg.substring(0, 2000),
          error_stack: args.find((a) => a?.stack)?.stack?.substring(0, 2000),
          page_url: typeof window !== 'undefined' ? window.location.href : '',
          user_agent:
            typeof navigator !== 'undefined' ? navigator.userAgent : '',
          severity: 'error',
        });
      } finally {
        self.isProcessing = false;
      }
    };

    window.addEventListener('error', (event) => {
      this.log({
        error_type: 'runtime',
        error_message: event.message || 'Unknown error',
        error_stack: event.error?.stack?.substring(0, 2000),
        component: event.filename,
        page_url: window.location.href,
        user_agent: navigator.userAgent,
        severity: 'error',
        metadata: { lineno: event.lineno, colno: event.colno },
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      const message =
        event.reason?.message ||
        event.reason?.toString() ||
        'Unhandled promise rejection';
      this.log({
        error_type: 'promise_rejection',
        error_message: message,
        error_stack: event.reason?.stack?.substring(0, 2000),
        page_url: window.location.href,
        user_agent: navigator.userAgent,
        severity: 'error',
      });
    });

    this.deferHeavyInit();

    if (import.meta.env.DEV) {
      console.info(
        '[ErrorLogger] Initialized (Sentry relay: ' +
          (sentryRelayInDev ? 'enabled in dev' : 'skipped in dev unless VITE_SENTRY_RELAY_IN_DEV=true') +
          ')'
      );
    }
  }

  private deferHeavyInit() {
    const setup = () => {
      this.initPerformanceObserver();
      this.verifySentryConnection();
    };

    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(setup, { timeout: 5000 });
    } else {
      setTimeout(setup, 100);
    }
  }

  private initPerformanceObserver() {
    if (!('PerformanceObserver' in window)) return;
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration > 200) {
            this.log({
              error_type: 'performance',
              error_message:
                'Long task detected: ' + Math.round(entry.duration) + 'ms',
              page_url: window.location.href,
              user_agent: navigator.userAgent,
              severity: 'warning',
              metadata: {
                duration: entry.duration,
                startTime: entry.startTime,
              },
            });
          }
        }
      });
      observer.observe({ entryTypes: ['longtask'] });
    } catch (_e) {
      // PerformanceObserver not supported or entryType not available — ignore.
    }
  }

  setUserId(userId: string | null) {
    this.userId = userId;
  }

  /**
   * Invokes sentry-relay; never throws. Logs console.warn on failure or in dev when skipped.
   */
  private async invokeSentryRelay(
    body: Record<string, unknown>,
    context: string
  ): Promise<void> {
    if (isDev && !sentryRelayInDev) {
      console.warn(
        `[ErrorLogger] ${context} — Sentry relay skipped in development (set VITE_SENTRY_RELAY_IN_DEV=true to enable)`
      );
      return;
    }
    try {
      const { data, error } = await supabase.functions.invoke('sentry-relay', { body });
      if (error) {
        console.warn(
          `[ErrorLogger] ${context} — sentry-relay invoke failed:`,
          error.message || String(error)
        );
        return;
      }
      if (
        data &&
        typeof data === 'object' &&
        'success' in data &&
        (data as { success?: boolean }).success === false &&
        !(data as { relay_skipped?: boolean }).relay_skipped
      ) {
        console.warn(`[ErrorLogger] ${context} — sentry-relay returned success=false`, data);
      }
    } catch (e) {
      console.warn(
        `[ErrorLogger] ${context} — sentry-relay threw:`,
        e instanceof Error ? e.message : e
      );
    }
  }

  log(entry: ErrorLogEntry) {
    this.buffer.push(entry);
    this.sentryBuffer.push(entry);
    this.storeLocally(entry);

    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => this.flushToDb(), 2000);

    if (this.sentryFlushTimer) clearTimeout(this.sentryFlushTimer);
    this.sentryFlushTimer = setTimeout(() => this.flushToSentry(), 3000);

    if (entry.severity === 'critical') {
      this.flushToDb();
      this.flushToSentry();
    }
  }

  captureError(
    error: Error,
    context?: {
      component?: string;
      severity?: 'warning' | 'error' | 'critical';
      metadata?: Record<string, any>;
    }
  ) {
    this.log({
      error_type: 'manual',
      error_message: error.message,
      error_stack: error.stack?.substring(0, 2000),
      component: context?.component,
      page_url: window.location.href,
      user_agent: navigator.userAgent,
      severity: context?.severity || 'error',
      metadata: context?.metadata,
    });
  }

  captureApiError(
    endpoint: string,
    statusCode: number,
    errorMessage: string
  ) {
    this.log({
      error_type: 'api',
      error_message:
        'API Error: ' +
        endpoint +
        ' returned ' +
        statusCode +
        ': ' +
        errorMessage,
      page_url: window.location.href,
      user_agent: navigator.userAgent,
      severity: statusCode >= 500 ? 'critical' : 'error',
      metadata: { endpoint, statusCode },
    });
  }

  captureComponentError(error: Error, componentStack?: string) {
    this.log({
      error_type: 'react_boundary',
      error_message: error.message,
      error_stack: error.stack?.substring(0, 2000),
      component: componentStack?.substring(0, 500),
      page_url: window.location.href,
      user_agent: navigator.userAgent,
      severity: 'critical',
      metadata: {
        componentStack: componentStack?.substring(0, 1000),
      },
    });
  }

  captureMessage(
    message: string,
    level: 'info' | 'warning' | 'error' = 'info',
    extra?: Record<string, any>
  ) {
    if (!this.sentryEnabled) return;
    void this.invokeSentryRelay(
      {
        action: 'capture_message',
        message,
        level,
        tags: { source: 'stikmnek-frontend' },
        extra,
        user_id: this.userId,
      },
      'captureMessage'
    );
  }

  private storeLocally(entry: ErrorLogEntry) {
    try {
      const raw = localStorage.getItem('stikm-error-log');
      const errors = raw ? JSON.parse(raw) : [];
      errors.push({
        ...entry,
        timestamp: new Date().toISOString(),
        userId: this.userId,
      });
      if (errors.length > 50) errors.splice(0, errors.length - 50);
      localStorage.setItem('stikm-error-log', JSON.stringify(errors));
    } catch (_e) {
      // localStorage may be full or unavailable — silently ignore.
    }
  }

  private async flushToDb() {
    if (this.buffer.length === 0) return;
    const entries = [...this.buffer];
    this.buffer = [];
    try {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess?.session?.access_token) {
        // No JWT → PostgREST is anon; error_logs INSERT requires authenticated (401/42501).
        this.buffer.unshift(...entries);
        return;
      }
      const records = entries.map((entry) => ({
        user_id: this.userId || null,
        error_type: entry.error_type,
        error_message: entry.error_message.substring(0, 2000),
        error_stack: entry.error_stack?.substring(0, 2000),
        component: entry.component,
        page_url: entry.page_url,
        user_agent: entry.user_agent,
        metadata: entry.metadata || {},
        severity: entry.severity,
      }));
      const { error } = await supabase.from('error_logs').insert(records);
      if (error) {
        // Do not re-queue forever; localStorage already has a copy.
        if (error.code !== '42501') {
          console.warn('[ErrorLogger] error_logs insert failed:', error.message, error.code);
        }
      }
    } catch (_e) {
      // DB insert failed — errors are already in localStorage as fallback.
    }
  }

  private async flushToSentry() {
    if (!this.sentryEnabled || this.sentryBuffer.length === 0) return;
    if (isDev && !sentryRelayInDev) {
      this.sentryBuffer = [];
      return;
    }
    const entries = [...this.sentryBuffer];
    this.sentryBuffer = [];
    for (const entry of entries) {
      await this.invokeSentryRelay(
        {
          action: 'capture_error',
          error_message: entry.error_message,
          error_stack: entry.error_stack,
          error_type: entry.error_type,
          severity: entry.severity,
          component: entry.component,
          page_url: entry.page_url,
          user_agent: entry.user_agent,
          metadata: entry.metadata,
          user_id: this.userId,
          tags: {
            error_type: entry.error_type,
            severity: entry.severity,
          },
        },
        'flushToSentry'
      );
    }
  }

  private async verifySentryConnection() {
    if (isDev && !sentryRelayInDev) {
      this.sentryEnabled = false;
      console.warn(
        '[ErrorLogger] Sentry relay health check skipped in development (set VITE_SENTRY_RELAY_IN_DEV=true to verify)'
      );
      return;
    }
    try {
      const { data, error } = await supabase.functions.invoke('sentry-relay', {
        body: { action: 'health' },
      });
      if (error || !data?.success) {
        this.sentryEnabled = false;
        console.warn(
          '[ErrorLogger] Sentry relay health check failed:',
          error?.message || 'No success response',
          data ?? ''
        );
      } else {
        this.sentryEnabled = Boolean((data as { sentry_configured?: boolean }).sentry_configured);
        if (this.sentryEnabled) {
          console.info('[ErrorLogger] Sentry relay is ACTIVE and configured');
          this.captureMessage(
            'StikmNek app initialized — Sentry relay confirmed active',
            'info',
            {
              timestamp: new Date().toISOString(),
              url: window.location.href,
              userAgent: navigator.userAgent,
            }
          );
        } else {
          console.warn(
            '[ErrorLogger] Sentry relay is reachable but Sentry DSN is not configured in Edge Function secrets'
          );
        }
      }
    } catch (e) {
      this.sentryEnabled = false;
      console.warn(
        '[ErrorLogger] Sentry relay unreachable:',
        e instanceof Error ? e.message : e
      );
    }
  }

  getLocalErrors(): any[] {
    try {
      return JSON.parse(localStorage.getItem('stikm-error-log') || '[]');
    } catch {
      return [];
    }
  }

  clearLocalErrors() {
    localStorage.removeItem('stikm-error-log');
  }

  isSentryEnabled(): boolean {
    return this.sentryEnabled;
  }
}

export const errorLogger = new ErrorLogger();
export default errorLogger;
