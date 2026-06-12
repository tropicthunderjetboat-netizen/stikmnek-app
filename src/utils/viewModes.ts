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

/** URL path → in-app view (excludes `/legal/*`, handled separately in AppLayout). */
export const PATH_TO_VIEW: Record<string, ViewMode> = {
  '/': 'home',
  '/deals': 'deals',
  '/map': 'map',
  '/passes': 'passes',
  '/business/new': 'business-new',
  '/help': 'help',
  '/faq': 'faq',
  '/business-guide': 'business-guide',
};

export function viewFromPathname(pathname: string): ViewMode | null {
  const next = PATH_TO_VIEW[normalizeAppPathname(pathname)];
  return isViewMode(next) ? next : null;
}

export function isRoutableAppPath(pathname: string): boolean {
  const p = normalizeAppPathname(pathname);
  if (p.startsWith('/legal/')) return true;
  return p in PATH_TO_VIEW;
}
