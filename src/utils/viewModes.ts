/**
 * Canonical list of in-app views. Add new routes/pages here — `ViewMode` is derived from this array.
 */
export const VIEW_MODES = [
  'home',
  'deals',
  'map',
  'passes',
  'dashboard',
  'my-favorites',
  'admin',
  'business-detail',
  'checkout',
  'payment-confirmation',
  'business-dashboard',
  'help',
  'faq',
  'business-guide',
  'business-new',
  'complete-profile',
  'complete-business-profile',
] as const;

export type ViewMode = (typeof VIEW_MODES)[number];

export function isViewMode(value: unknown): value is ViewMode {
  return typeof value === 'string' && (VIEW_MODES as readonly string[]).includes(value);
}

/** Normalize pathname for route lookup (no trailing slash; bare `/` stays `/`). */
export function normalizeAppPathname(pathname: string): string {
  return pathname.replace(/\/$/, '') || '/';
}

/** URL path → in-app view (excludes `/legal/*` and `/deal/:slug`, handled separately in AppLayout). */
export const PATH_TO_VIEW: Record<string, ViewMode> = {
  '/': 'home',
  '/deals': 'deals',
  '/map': 'map',
  '/passes': 'passes',
  '/business/new': 'business-new',
  '/hub': 'business-dashboard',
  '/help': 'help',
  '/faq': 'faq',
  '/business-guide': 'business-guide',
};

/** Shareable per-deal route: `/deal/<readable-title>-<offeringId>`. */
export const DEAL_PATH_RE = /^\/deal\/(.+)$/;

/** Returns the deal slug if `pathname` is a `/deal/:slug` route, else null. */
export function dealSlugFromPathname(pathname: string): string | null {
  const m = normalizeAppPathname(pathname).match(DEAL_PATH_RE);
  return m ? decodeURIComponent(m[1]) : null;
}

export function viewFromPathname(pathname: string): ViewMode | null {
  if (dealSlugFromPathname(pathname)) return 'business-detail';
  const next = PATH_TO_VIEW[normalizeAppPathname(pathname)];
  return isViewMode(next) ? next : null;
}

export function isRoutableAppPath(pathname: string): boolean {
  const p = normalizeAppPathname(pathname);
  if (p.startsWith('/legal/')) return true;
  if (dealSlugFromPathname(p)) return true;
  return p in PATH_TO_VIEW;
}
