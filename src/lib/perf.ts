import type { Metric } from 'web-vitals';
import { onCLS, onFCP, onINP, onLCP, onTTFB } from 'web-vitals';
import { errorLogger } from '@/lib/errorLogger';

type PerfRating = 'good' | 'needs-improvement' | 'poor';

type PerfConfig = {
  enabled: boolean;
  /** 0..1 */
  sampleRate: number;
  /** When true, logs to console for local debugging. */
  debug: boolean;
};

function envBool(v: unknown, fallback: boolean): boolean {
  if (v == null) return fallback;
  const s = String(v).trim().toLowerCase();
  if (s === 'true' || s === '1' || s === 'yes') return true;
  if (s === 'false' || s === '0' || s === 'no') return false;
  return fallback;
}

function envNumber(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function getPerfConfig(): PerfConfig {
  const isProd = import.meta.env.PROD;
  const enabled = envBool(import.meta.env.VITE_PERF_ENABLED, isProd);
  const sampleRate = Math.min(
    1,
    Math.max(0, envNumber(import.meta.env.VITE_PERF_SAMPLE_RATE, isProd ? 0.1 : 1)),
  );
  const debug = envBool(import.meta.env.VITE_PERF_DEBUG, !isProd);
  return { enabled, sampleRate, debug };
}

function shouldSample(sampleRate: number): boolean {
  if (sampleRate >= 1) return true;
  if (sampleRate <= 0) return false;
  return Math.random() < sampleRate;
}

// Thresholds from web.dev guidance (p75). Units:
// - CLS: unitless
// - FCP/LCP/TTFB/INP: milliseconds
const THRESHOLDS: Record<string, { good: number; poor: number }> = {
  CLS: { good: 0.1, poor: 0.25 },
  FCP: { good: 1800, poor: 3000 },
  INP: { good: 200, poor: 500 },
  LCP: { good: 2500, poor: 4000 },
  TTFB: { good: 800, poor: 1800 },
};

export function rateMetric(metric: Pick<Metric, 'name' | 'value'>): PerfRating {
  const t = THRESHOLDS[metric.name];
  if (!t) return 'needs-improvement';
  if (metric.value <= t.good) return 'good';
  if (metric.value >= t.poor) return 'poor';
  return 'needs-improvement';
}

function reportMetric(metric: Metric, cfg: PerfConfig) {
  const rating = rateMetric(metric);
  const payload = {
    metric: metric.name,
    value: metric.value,
    rating,
    id: metric.id,
    navigationType: metric.navigationType,
    url: typeof window !== 'undefined' ? window.location.href : '',
  };

  if (cfg.debug) {
    // eslint-disable-next-line no-console
    console.info('[perf]', payload);
  }

  // Integrate with existing error logging transport (Sentry relay + DB).
  // Keep these as "info" unless poor.
  errorLogger.captureMessage(
    `perf:${metric.name}`,
    rating === 'poor' ? 'warning' : 'info',
    payload,
  );
}

let perfInitialized = false;

/**
 * Initializes lightweight client performance monitoring (Web Vitals).
 *
 * Env vars (Vite):
 * - `VITE_PERF_ENABLED` (default: true in prod, false in dev)
 * - `VITE_PERF_SAMPLE_RATE` (default: 0.1 in prod, 1 in dev)
 * - `VITE_PERF_DEBUG` (default: true in dev, false in prod)
 */
export function initPerfMonitoring(): void {
  if (perfInitialized) return;
  perfInitialized = true;

  const cfg = getPerfConfig();
  if (!cfg.enabled) return;
  if (!shouldSample(cfg.sampleRate)) return;

  // Web vitals are very lightweight; they hook into perf events already present.
  onCLS((m) => reportMetric(m, cfg));
  onFCP((m) => reportMetric(m, cfg));
  onINP((m) => reportMetric(m, cfg));
  onLCP((m) => reportMetric(m, cfg));
  onTTFB((m) => reportMetric(m, cfg));
}

