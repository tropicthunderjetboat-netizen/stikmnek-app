/**
 * Centralized dynamic imports for heavy screens/libraries.
 *
 * Purpose:
 * - Create an “import barrier” so app shells (Navbar/AppLayout/etc.) can prefetch
 *   without accidentally pulling heavy deps into the initial bundle.
 * - Provide one place to audit what chunks we consider “heavy”.
 */

export function prefetchChunk<T>(loader: () => Promise<T>): void {
  // Fire-and-forget; avoid unhandled rejection noise.
  void loader().catch(() => {});
}

// ── Screens ────────────────────────────────────────────────────────────────
export const loadMapView = () => import('@/components/MapView');
export const loadAdminPanel = () => import('@/components/AdminPanel');
export const loadBusinessOwnerDashboard = () => import('@/components/BusinessOwnerDashboard');
export const loadTouristDashboard = () => import('@/components/Dashboard');
export const loadMyFavoritesList = () => import('@/components/MyFavoritesList');

// ── Heavy sub-components (library drivers) ─────────────────────────────────
export const loadAdminPurchaseOverview = () => import('@/components/AdminPurchaseOverview'); // recharts
export const loadDashboardAnalytics = () => import('@/components/DashboardAnalytics'); // recharts
export const loadBusinessDescriptionEditor = () => import('@/components/BusinessDescriptionEditor'); // quill
export const loadBusinessDetailMap = () => import('@/components/BusinessDetailMap'); // leaflet

