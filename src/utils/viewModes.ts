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
  'business-profile',
  'checkout',
  'payment-confirmation',
  'business-dashboard',
  'help',
  'faq',
  'business-guide',
  'business-new',
  'business-join',
  'list-business',
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
  '/saved': 'my-favorites',
  '/profile': 'dashboard',
  '/checkout': 'checkout',
  '/payment-confirmation': 'payment-confirmation',
  '/business/new': 'business-new',
  '/for-business': 'business-join',
  '/list-your-business': 'list-business',
  '/hub': 'business-dashboard',
  '/help': 'help',
  '/faq': 'faq',
  '/business-guide': 'business-guide',
};

/** Canonical URL for a view when one exists (keeps refresh / share working). */
export function pathForViewMode(view: ViewMode): string | null {
  for (const [path, mapped] of Object.entries(PATH_TO_VIEW)) {
    if (mapped === view) return path;
  }
  return null;
}

/**
 * Tourist Hybrid Hub bottom tabs. Saved maps to `my-favorites` (favorites + pass holder in later steps);
 * Profile maps to `dashboard` (user_profiles settings).
 */
export const HUB_BOTTOM_NAV_VIEWS: readonly ViewMode[] = [
  'home',
  'map',
  'my-favorites',
  'dashboard',
] as const;

/** Fixed chrome height of the hub bottom tab bar (excludes iOS home-indicator inset). */
export const HUB_BOTTOM_NAV_HEIGHT_PX = 56;

export function isHubBottomNavView(view: ViewMode): boolean {
  return (HUB_BOTTOM_NAV_VIEWS as readonly string[]).includes(view);
}

/** Path used when switching hub tabs (keeps URL shareable). */
export function pathForHubView(view: ViewMode): string | null {
  switch (view) {
    case 'home':
      return '/';
    case 'map':
      return '/map';
    case 'my-favorites':
      return '/saved';
    case 'dashboard':
      return '/profile';
    default:
      return null;
  }
}

/** Shareable per-deal route: `/deal/<readable-title>-<offeringId>`. */
export const DEAL_PATH_RE = /^\/deal\/(.+)$/;

/** Shareable business profile: `/partner/<name>-<id>` (legacy `/host/...` still works). */
export const PARTNER_PATH_RE = /^\/partner\/(.+)$/;

/** @deprecated Legacy business profile URLs */
export const HOST_PATH_RE = /^\/host\/(.+)$/;

/** Returns the deal slug if `pathname` is a `/deal/:slug` route, else null. */
export function dealSlugFromPathname(pathname: string): string | null {
  const m = normalizeAppPathname(pathname).match(DEAL_PATH_RE);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Returns the partner profile slug from `/partner/:slug` or legacy `/host/:slug`. */
export function partnerSlugFromPathname(pathname: string): string | null {
  const p = normalizeAppPathname(pathname);
  const m = p.match(PARTNER_PATH_RE) || p.match(HOST_PATH_RE);
  return m ? decodeURIComponent(m[1]) : null;
}

/** @deprecated Use partnerSlugFromPathname */
export const hostSlugFromPathname = partnerSlugFromPathname;

export function viewFromPathname(pathname: string): ViewMode | null {
  if (dealSlugFromPathname(pathname)) return 'business-detail';
  if (hostSlugFromPathname(pathname)) return 'business-profile';
  const next = PATH_TO_VIEW[normalizeAppPathname(pathname)];
  return isViewMode(next) ? next : null;
}

export function isRoutableAppPath(pathname: string): boolean {
  const p = normalizeAppPathname(pathname);
  if (p.startsWith('/legal/')) return true;
  if (dealSlugFromPathname(p)) return true;
  if (hostSlugFromPathname(p)) return true;
  return p in PATH_TO_VIEW;
}
