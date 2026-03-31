/**
 * Canonical list of in-app views. Add new routes/pages here — `ViewMode` is derived from this array.
 */
export const VIEW_MODES = [
  'home',
  'deals',
  'map',
  'passes',
  'dashboard',
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
