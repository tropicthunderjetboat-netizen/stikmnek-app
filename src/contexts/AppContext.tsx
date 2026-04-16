import React, { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { toast } from 'sonner';
import { Language } from '@/data/translations';
import { Business } from '@/data/businesses';
import { supabase, directProfileInsert, SUPABASE_URL, ENDPOINTS } from '@/lib/supabase';
import { mapJoinedOfferingToBusiness, OFFERING_LISTING_COLUMNS } from '@/lib/businessOfferingMap';

import { GeoPosition, haversineDistance } from '@/hooks/useGeolocation';
import { errorLogger } from '@/lib/errorLogger';
import type { ViewMode } from '@/utils/viewModes';
import type { PassProductId } from '@/data/pricing';
import { PASS_PRODUCTS, passProductIdFromDb } from '@/data/pricing';

export type { ViewMode };
export type { PassProductId };

/** PostgREST embed: null | single object | array — normalize to object rows only. */
function normalizeEmbeddedOfferings(raw: unknown): Record<string, unknown>[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw.filter((x): x is Record<string, unknown> => x != null && typeof x === 'object' && !Array.isArray(x));
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return [raw as Record<string, unknown>];
  }
  return [];
}

// ═══════════════════════════════════════════════════════════════
// ADMIN EMAILS: These always get 'admin' role regardless of DB
// ═══════════════════════════════════════════════════════════════
const ADMIN_EMAILS = ['admin@stikmnek.com', 'testadmin@example.com', 'stikmnek@gmail.com'];

/** Active pass on the user; null if none. Canonical product id (not legacy DB strings). */
export type PassType = PassProductId | null;

// ═══════════════════════════════════════════════════════════════
// UserProfile — matches the ACTUAL user_profiles table columns
//
// Columns added by user:  name, full_name, user_type
// Original columns kept:  display_name, role (kept in sync)
// ═══════════════════════════════════════════════════════════════
export interface UserProfile {
  id: string;
  user_id: string;
  // NEW columns (user-added)
  name: string | null;
  full_name: string | null;
  user_type: string | null;
  // Original columns (still populated for backwards compat)
  role: 'tourist' | 'business' | 'admin';
  display_name: string;
  email: string;
  phone: string;
  avatar_url: string | null;
  business_name: string | null;
  business_category: string | null;
  business_description: string | null;
  business_location: string | null;
  business_phone: string | null;
  business_email: string | null;
  business_hours: string | null;
  home_country: string | null;
  travel_dates: string | null;
  onboarding_complete: boolean;
  superstar_credits?: number;
  /** Tourist party & travel prefs (post-pass profile, analytics). */
  num_adults?: number;
  num_children?: number;
  num_infants?: number;
  preferred_contact_method?: string | null;
  /** Tourist WhatsApp (may differ from `phone`). */
  whatsapp_number?: string | null;
  resort_name?: string | null;
  expected_arrival_date?: string | null;
  expected_departure_date?: string | null;
  post_pass_profile_completed?: boolean;
  /** If true, user has unlocked Share Bonus before buying a pass; consumed on purchase. */
  share_bonus_unlocked?: boolean;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  type: 'tourist' | 'business' | 'admin';
  pass: PassType;
  passId: string | null;
  passExpiry: string | null;
  passValidFrom: string | null;
  passValidUntil: string | null;
  avatarUrl?: string | null;
  /** People capacity (base or after share bonus). Used by QR code & receipts. */
  passPeopleCount?: number | null;
  /** Whether share bonus has been applied to this pass. */
  shareBonusApplied?: boolean | null;
  /** Whether the user has an unused, pre-purchase share bonus to apply on their next pass. */
  shareBonusUnlocked?: boolean | null;
  /** Super Star review credits (purchased, decremented on use). */
  superstarCredits?: number;
}

export interface CartItem {
  passType: PassProductId;
  price: number;
}

export interface DBReview {
  id: string;
  business_id: string;
  user_name: string;
  rating: number;
  comment: string;
  created_at: string;
  has_super_star?: boolean;
}

// ─── Review list helpers (module scope: stable for loadReviews / realtime) ───

/** Normalize DB / realtime / PostgREST row so list state stays consistent */
export function reviewRowToDBReview(row: Record<string, unknown> | null | undefined): DBReview | null {
  if (!row || row.id == null) return null;
  const hasSuper = !!(row.has_super_star);
  const rawRating = Number(row.rating);
  const displayRating = hasSuper && rawRating === 5 ? 6 : rawRating;
  return {
    id: String(row.id),
    business_id: String(row.business_id),
    user_name: (row.user_name != null && String(row.user_name).trim()) ? String(row.user_name).trim() : 'Anonymous',
    rating: displayRating,
    comment: row.comment != null ? String(row.comment) : '',
    created_at: row.created_at != null ? String(row.created_at) : new Date().toISOString(),
    has_super_star: hasSuper,
  };
}

function reviewFingerprint(r: DBReview): string {
  const createdDate = r.created_at ? String(r.created_at).slice(0, 10) : '';
  const name = (r.user_name || 'Anonymous').trim().toLowerCase();
  const cmt = (r.comment || '').trim();
  const ratingKey = r.has_super_star ? 'super' : String(r.rating);
  return `fp:${r.business_id}|${name}|${ratingKey}|${cmt}|${createdDate}`;
}

export function dedupeReviewsList(list: DBReview[]): DBReview[] {
  const out: DBReview[] = [];
  const seenId = new Set<string>();
  const seenFp = new Set<string>();

  for (const r of list) {
    const idKey = r?.id ? `id:${String(r.id)}` : '';
    const fpKey = reviewFingerprint(r);

    if (idKey && seenId.has(idKey)) continue;
    if (seenFp.has(fpKey)) continue;

    if (idKey) seenId.add(idKey);
    seenFp.add(fpKey);
    out.push(r);
  }

  return out;
}

/** ISO cutoff for `redemptions.redeemed_at` — last 30×24h from now (UTC). */
function reviewRecentRedemptionCutoffIso(): string {
  return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
}

/** Substring match for `RAISE EXCEPTION` text in `submit_superstar_review`. */
const REVIEW_WINDOW_EXPIRED_RPC_SNIPPET = 'Review window expired';

function translateReviewWindowExpiredMessage(language: Language): string {
  if (language === 'fr') {
    return 'Pour garder des avis pertinents, vous ne pouvez publier un avis que dans les 30 jours suivant votre visite.';
  }
  if (language === 'bi') {
    return 'Blong riviu i stap fri, yu save postem riviu nomo insaed 30 dei from taem yu bin visit.';
  }
  return 'To keep reviews fresh, you can only post a review within 30 days of your visit.';
}

function translateMustRedeemFirstMessage(
  language: Language,
  redemptionContext: 'leave_review' | 'superstar_purchase',
): string {
  if (redemptionContext === 'superstar_purchase') {
    if (language === 'en') {
      return 'You must redeem a service from this business before purchasing a Super Star review.';
    }
    if (language === 'fr') {
      return 'Vous devez utiliser une offre de cet établissement avant d’acheter un avis Super Star.';
    }
    return 'Yu mas redeem wan sarvis long bisinis ia bifo yu bae Super Star riviu.';
  }
  if (language === 'en') {
    return 'You must redeem a service from this business before leaving a review.';
  }
  if (language === 'fr') {
    return 'Vous devez utiliser une offre de cet établissement avant de laisser un avis.';
  }
  return 'Yu mas redeem wan sarvis long bisinis ia bifo yu save riviu.';
}

/** Tourist onboarding gate — same criteria as AppLayout profile-first redirect. */
export function isTouristProfileCompleteForGate(p: UserProfile | null | undefined): boolean {
  if (!p) return false;
  return (
    p.post_pass_profile_completed === true &&
    Boolean(p.name || p.full_name || p.display_name) &&
    (p.num_adults ?? 0) >= 1 &&
    Boolean(p.expected_arrival_date) &&
    Boolean(p.expected_departure_date)
  );
}

interface AppContextType {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  language: Language;
  setLanguage: (lang: Language) => void;
  currentView: ViewMode;
  setCurrentView: (view: ViewMode) => void;
  user: User | null;
  userProfile: UserProfile | null;
  authLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string, type: 'tourist' | 'business') => Promise<void>;
  signUpTourist: (name: string, email: string, password: string) => Promise<void>;
  signUpBusiness: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  favorites: string[];
  toggleFavorite: (id: string) => void;
  cart: CartItem | null;
  setCart: (item: CartItem | null) => void;
  purchasePass: (passType: PassProductId) => void;
  selectedBusiness: Business | null;
  setSelectedBusiness: React.Dispatch<React.SetStateAction<Business | null>>;
  showAuth: boolean;
  setShowAuth: (show: boolean) => void;
  authMode: 'signin' | 'signup' | 'signup-tourist' | 'signup-business';
  setAuthMode: (mode: 'signin' | 'signup' | 'signup-tourist' | 'signup-business') => void;
  showQR: string | null;
  setShowQR: (id: string | null) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedCategory: string;
  setSelectedCategory: (cat: string) => void;
  redemptions: { businessId: string; date: string; saved: number }[];
  dbBusinesses: Business[];
  dbReviews: DBReview[];
  submitReview: (businessId: string, rating: number, comment: string, isSuperStar?: boolean) => Promise<void>;
  /**
   * Owner + redemption preflight for Super Star *payment* (credits === 0).
   * Call before opening the payment modal or charging the card — not after payment.
   */
  validateSuperStarPaymentPrerequisites: (businessId: string) => Promise<void>;
  /**
   * No toasts. Use before opening review UI: owner check + redemption within last 30 days.
   */
  checkReviewSubmissionAllowed: (
    businessId: string,
    redemptionContext?: 'leave_review' | 'superstar_purchase',
  ) => Promise<{ allowed: boolean; message?: string }>;
  refreshUserProfile: () => Promise<void>;
  dataLoaded: boolean;
  refreshBusinesses: () => Promise<void>;
  refreshUserPass: () => Promise<void>;
  /** Reload pass redemptions from DB (e.g. after QR redemption). */
  refreshRedemptions: () => Promise<void>;
  /** null = not loaded; business owners only — true if `businesses` has a row for this user. */
  businessOwnerHasBusinessRow: boolean | null;
  /** True if this owner has a pending_businesses submission (awaiting review). */
  businessOwnerHasPendingSubmission: boolean;
  refreshBusinessOwnerRowStatus: () => Promise<void>;
  /** Set when user_profiles could not be loaded (network/Supabase); avoids gating loops on null profile. */
  userProfileLoadError: string | null;
  /** Clears error and refetches profile from Supabase (e.g. after a blip). */
  retryUserProfileFetch: () => Promise<void>;
  /** Tourist has started fields but gate not satisfied — show “resume” copy on complete-profile. */
  touristOnboardingResume: boolean;
  /** Business owner: pending submission or partial user_profiles business fields before businesses row. */
  businessOnboardingResume: boolean;
  userLocation: GeoPosition | null;
  locationLoading: boolean;
  locationError: string | null;
  requestUserLocation: () => void;
  getDistanceTo: (lat: number, lng: number) => number | null;
}

const AppContext = createContext<AppContextType>({} as AppContextType);

export const useAppContext = () => useContext(AppContext);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [language, setLanguage] = useState<Language>('en');
  const [currentView, setCurrentView] = useState<ViewMode>('home');

  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [cart, setCart] = useState<CartItem | null>(null);
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup' | 'signup-tourist' | 'signup-business'>('signin');
  const [showQR, setShowQR] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [redemptions, setRedemptions] = useState<{ businessId: string; date: string; saved: number }[]>([]);
  const [dbBusinesses, setDbBusinesses] = useState<Business[]>([]);
  const [dbReviews, setDbReviews] = useState<DBReview[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [businessOwnerHasBusinessRow, setBusinessOwnerHasBusinessRow] = useState<boolean | null>(null);
  const [businessOwnerHasPendingSubmission, setBusinessOwnerHasPendingSubmission] = useState(false);
  const [userProfileLoadError, setUserProfileLoadError] = useState<string | null>(null);

  // Geolocation state
  const [userLocation, setUserLocation] = useState<GeoPosition | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Track whether we've already processed the initial session
  const sessionProcessedRef = useRef(false);

  // ═══ ROLE PERSISTENCE GUARDS ═══
  const lastDbResolvedRoleRef = useRef<'tourist' | 'business' | 'admin' | null>(null);
  /** Same userId: reuse one in-flight resolve to avoid stacked getSession + profile selects. */
  const resolveRoleInflightRef = useRef(
    new Map<
      string,
      Promise<{
        role: 'tourist' | 'business' | 'admin';
        profile: UserProfile | null;
        fromDb: boolean;
        profileRowFetchOk: boolean;
      }>
    >(),
  );
  const signInCooldownRef = useRef<number>(0);
  const authProcessingRef = useRef<boolean>(false);
  /** Delays the red profile banner so transient timeouts / double auth events do not flash a false error. */
  const profileBannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ═══════════════════════════════════════════════════════════
  // GEOLOCATION
  // ═══════════════════════════════════════════════════════════
  const requestUserLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser');
      return;
    }
    setLocationLoading(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        // Guard against NaN/Infinity from buggy geolocation implementations
        if (typeof lat === 'number' && typeof lng === 'number' && isFinite(lat) && isFinite(lng)) {
          setUserLocation({
            lat,
            lng,
            accuracy: pos.coords.accuracy,
            timestamp: pos.timestamp,
          });
          setLocationLoading(false);
          setLocationError(null);
          toast.success('Location found!');
        } else {
          console.warn('[Geolocation] Invalid coordinates received:', lat, lng);
          setLocationLoading(false);
          setLocationError('Invalid location data received');
        }
      },
      (err) => {
        let errorMsg = 'Unable to get your location';
        if (err.code === 1) errorMsg = 'Location permission denied';
        if (err.code === 2) errorMsg = 'Location unavailable';
        if (err.code === 3) errorMsg = 'Location request timed out';
        setLocationLoading(false);
        setLocationError(errorMsg);
        toast.error(errorMsg);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, []);


  const getDistanceTo = useCallback((lat: number, lng: number): number | null => {
    if (!userLocation) return null;
    return haversineDistance(userLocation.lat, userLocation.lng, lat, lng);
  }, [userLocation]);

  // ═══════════════════════════════════════════════════════════
  // DATA LOADING
  // ═══════════════════════════════════════════════════════════
  const loadBusinesses = useCallback(async () => {
    const DBG = '[loadBusinesses]';
    try {
      // Left-embed `business_offerings` (no !inner) so we can see profiles even when the join
      // or RLS would exclude rows with !inner — filter to active offerings in the loop below.
      const { data: profileRows, error: loadErr } = await supabase
        .from('businesses')
        .select(`
          id,
          name,
          category,
          owner_id,
          location,
          lat,
          lng,
          hours,
          opening_hours,
          phone,
          email,
          contact_email,
          business_email,
          whatsapp_number,
          rating,
          review_count,
          featured,
          active,
          map_url,
          website,
          tags,
          business_offerings (
            ${OFFERING_LISTING_COLUMNS}
          )
        `)
        .eq('active', true)
        .order('featured', { ascending: false })
        .order('name', { ascending: true });

      if (loadErr) {
        console.warn(`${DBG} fetch error:`, loadErr.message || loadErr, loadErr);
        setDbBusinesses([]);
        setDataLoaded(true);
        return;
      }

      if (profileRows && profileRows.length > 0) {
        // One `Business` card per active `business_offerings` row (`Business.id` = offering id).
        const mapped: Business[] = [];
        for (const row of profileRows as Record<string, unknown>[]) {
          const profileName = String(row.name ?? '(no name)');
          const profileId = String(row.id ?? '');

          const rawOff = row.business_offerings;
          const offs = normalizeEmbeddedOfferings(rawOff);
          const { business_offerings: _drop, ...profile } = row;

          if (offs.length === 0) {
            continue;
          }

          for (const o of offs) {
            const off = o as Record<string, unknown> & { active?: boolean; id?: unknown };
            if (off.active === false) {
              continue;
            }
            try {
              const b = mapJoinedOfferingToBusiness(off, profile, SUPABASE_URL);
              const profileActive = profile.active !== false;
              mapped.push({
                ...b,
                active: profileActive && b.active !== false,
              });
            } catch (mapErr) {
              console.warn(`${DBG} Skipping business:`, profileName, `id=${profileId}`, 'Reason: mapJoinedOfferingToBusiness threw:', mapErr);
            }
          }
        }
        setDbBusinesses(mapped);
      } else {
        setDbBusinesses([]);
      }
      setDataLoaded(true);
    } catch (err) {
      console.error('[loadBusinesses] Failed to load businesses:', err);
      setDataLoaded(true);
    }
  }, []);

  const loadReviews = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('reviews')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      if (data) {
        const mapped = data
          .map((r: Record<string, unknown>) => reviewRowToDBReview(r))
          .filter(Boolean) as DBReview[];
        setDbReviews(dedupeReviewsList(mapped));
      }
    } catch (err) {
      console.error('Failed to load reviews:', err);
    }
  }, []);

  /** Always call latest loadReviews from realtime (avoids stale useEffect closures) */
  const loadReviewsRef = useRef(loadReviews);
  loadReviewsRef.current = loadReviews;

  const loadBusinessesRef = useRef(loadBusinesses);
  loadBusinessesRef.current = loadBusinesses;

  const loadFavorites = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('favorites')
        .select('business_id')
        .eq('user_id', userId);
      if (error) throw error;
      if (data) {
        setFavorites(data.map((f: any) => f.business_id));
      }
    } catch (err) {
      console.error('Failed to load favorites:', err);
    }
  }, []);

  const loadUserPass = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('passes')
        .select('*')
        .eq('user_id', userId)
        .eq('active', true)
        .order('purchased_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(3);
      if (error) throw error;
      if (data && data.length > 0) {
        const pass = data[0];
        const expiry = new Date(pass.expires_at);
        if (expiry > new Date()) {
          const validFrom = pass.valid_from ? new Date(pass.valid_from).toISOString().split('T')[0] : null;
          const validUntil = pass.valid_until ? new Date(pass.valid_until).toISOString().split('T')[0] : null;
          const peopleCount = pass.max_people ?? pass.people_count ?? null;
          const shareBonusApplied = pass.share_bonus_applied ?? false;
          // Only update if we have the same user — never clear user (prev can be null if race with setUser)
          setUser(prev => {
            if (!prev || prev.id !== userId) return prev;
            return {
              ...prev,
              pass: passProductIdFromDb(String(pass.pass_type)),
              passId: pass.id,
              passExpiry: expiry.toISOString().split('T')[0],
              passValidFrom: validFrom,
              passValidUntil: validUntil,
              passPeopleCount: peopleCount,
              shareBonusApplied,
            };
          });
        }
      }
    } catch (err) {
      console.error('Failed to load pass:', err);
    }
  }, []);

  const loadRedemptions = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('redemptions')
        .select('*')
        .eq('user_id', userId)
        .order('redeemed_at', { ascending: false });
      if (error) throw error;
      if (data) {
        setRedemptions(data.map((r: any) => ({
          businessId: r.business_id,
          date: new Date(r.redeemed_at).toISOString().split('T')[0],
          saved: Number(r.saved_amount) || 0,
        })));
      }
    } catch (err) {
      console.error('Failed to load redemptions:', err);
    }
  }, []);

  const loadRedemptionsRef = useRef(loadRedemptions);
  loadRedemptionsRef.current = loadRedemptions;

  const loadUserData = useCallback((userId: string) => {
    loadFavorites(userId);
    loadUserPass(userId);
    loadRedemptions(userId);
  }, [loadFavorites, loadUserPass, loadRedemptions]);


  // ═══════════════════════════════════════════════════════════
  // HELPER: Extract the user's role from a DB profile row.
  //
  // Priority: user_type > role > fallback
  //
  // The user added a `user_type` column. We read that first.
  // Fall back to the original `role` column for older rows.
  // ═══════════════════════════════════════════════════════════
  const extractRole = (profile: any): 'tourist' | 'business' | 'admin' => {
    const raw = profile.user_type || profile.role;
    if (raw === 'admin' || raw === 'business' || raw === 'tourist') return raw;
    return 'tourist';
  };

  // ═══════════════════════════════════════════════════════════
  // HELPER: Extract the user's display name from a DB profile row.
  //
  // Priority: name > full_name > display_name > email prefix
  // ═══════════════════════════════════════════════════════════
  const extractName = (profile: any, fallbackEmail?: string): string => {
    return profile.name
      || profile.full_name
      || profile.display_name
      || fallbackEmail?.split('@')[0]
      || 'User';
  };


  // ═══════════════════════════════════════════════════════════
  // ROLE RESOLUTION — single source of truth
  // Priority: 1) Admin email  2) DB profile  3) Previously resolved
  //           4) Auth metadata  5) Default tourist
  // ═══════════════════════════════════════════════════════════

  const resolveRole = useCallback(
    async (
      userId: string,
      email: string,
      metadata?: Record<string, any>,
    ): Promise<{
      role: 'tourist' | 'business' | 'admin';
      profile: UserProfile | null;
      fromDb: boolean;
      profileRowFetchOk: boolean;
    }> => {
      const inflightKey = userId || '__no_user__';
      const existing = resolveRoleInflightRef.current.get(inflightKey);
      if (existing) {
        console.log('[resolveRole] dedupe: sharing inflight promise', { userId: inflightKey });
        return existing;
      }

      const promise = (async () => {
        const isAdmin = ADMIN_EMAILS.includes(email.toLowerCase());

        let profile: UserProfile | null = null;
        let dbQuerySucceeded = false;
        try {
          if (userId) {
            const approxRestUrl = `${ENDPOINTS.rest}/user_profiles?select=*&user_id=eq.${encodeURIComponent(userId)}`;
            const startedAt = Date.now();
            const { data, error } = await supabase
              .from('user_profiles')
              .select('*')
              .eq('user_id', userId)
              .maybeSingle();
            const elapsedMs = Date.now() - startedAt;

            if (error) {
              const err = error as {
                message?: string;
                code?: string;
                details?: string;
                hint?: string;
                status?: number;
                statusCode?: number;
              };
              const errorPayload = {
                userId,
                profileSelect: '*',
                approxGetUrl: approxRestUrl,
                elapsedMs,
                message: err.message ?? null,
                code: err.code ?? null,
                details: err.details ?? null,
                hint: err.hint ?? null,
                httpStatus: err.status ?? err.statusCode ?? null,
              };
              console.error('[resolveRole] user_profiles query failed:', errorPayload);
            } else if (data) {
              profile = data as UserProfile;
              dbQuerySucceeded = true;
              if (elapsedMs > 2500) {
                console.warn('[resolveRole] Slow profile fetch:', { elapsedMs });
              }
            } else {
              dbQuerySucceeded = true;
              if (elapsedMs > 2500) {
                console.warn('[resolveRole] Slow profile fetch (no row):', { elapsedMs });
              }
            }
          }
        } catch (err) {
          console.warn('[resolveRole] Exception:', (err as Error)?.message);
        }

        let finalRole: 'tourist' | 'business' | 'admin';
        let resolvedFromDb = false;

        if (isAdmin) {
          finalRole = 'admin';
          resolvedFromDb = true;
          if (profile && extractRole(profile) !== 'admin') {
            supabase
              .from('user_profiles')
              .update({ role: 'admin', user_type: 'admin', updated_at: new Date().toISOString() })
              .eq('user_id', userId)
              .then(() => {})
              .catch((e) => console.warn('[resolveRole] Admin update failed:', e?.message));
            profile = { ...profile, role: 'admin', user_type: 'admin' };
          }
        } else if (profile) {
          let dbRole = extractRole(profile);
          const metaType = metadata?.user_type;
          if (metaType === 'business' && dbRole === 'tourist') {
            dbRole = 'business';
            profile = { ...profile, role: 'business', user_type: 'business' };
            supabase
              .from('user_profiles')
              .update({
                user_type: 'business',
                role: 'business',
                updated_at: new Date().toISOString(),
              })
              .eq('user_id', userId)
              .then(() => {})
              .catch((e) => console.warn('[resolveRole] Business role sync failed:', e?.message));
          }
          finalRole = dbRole;
          resolvedFromDb = true;
        } else if (!dbQuerySucceeded && lastDbResolvedRoleRef.current) {
          finalRole = lastDbResolvedRoleRef.current;
        } else if (metadata?.user_type && ['tourist', 'business', 'admin'].includes(metadata.user_type)) {
          finalRole = metadata.user_type as 'tourist' | 'business' | 'admin';
        } else {
          finalRole = 'tourist';
        }

        if (resolvedFromDb) {
          lastDbResolvedRoleRef.current = finalRole;
        }

        if (profile) {
          setUserProfile(profile);
        }

        return { role: finalRole, profile, fromDb: resolvedFromDb, profileRowFetchOk: dbQuerySucceeded };
      })();

      resolveRoleInflightRef.current.set(inflightKey, promise);
      promise.finally(() => {
        if (resolveRoleInflightRef.current.get(inflightKey) === promise) {
          resolveRoleInflightRef.current.delete(inflightKey);
        }
      });
      return promise;
    },
    [],
  );


  // ═══════════════════════════════════════════════════════════
  // BUILD USER — Converts auth user + DB profile into User object
  //
  // Name priority:  profile.name > profile.full_name > profile.display_name > auth meta > email
  // Role priority:  already resolved by resolveRole()
  // ═══════════════════════════════════════════════════════════
  const buildUser = useCallback((
    authUser: any,
    role: 'tourist' | 'business' | 'admin',
    profile?: UserProfile | null
  ): User => {
    const meta = authUser.user_metadata || {};

    // Name: DB profile columns first, then auth metadata
    const userName = profile
      ? extractName(profile, authUser.email)
      : (meta.name || meta.full_name || authUser.email?.split('@')[0] || 'User');

    const avatarUrl = profile?.avatar_url || meta.avatar_url || meta.picture || null;

    return {
      id: authUser.id,
      name: userName,
      email: profile?.email || authUser.email || '',
      type: role,
      pass: null,
      passId: null,
      passExpiry: null,
      passValidFrom: null,
      passValidUntil: null,
      avatarUrl,
      superstarCredits: profile?.superstar_credits ?? 0,
      shareBonusUnlocked: profile?.share_bonus_unlocked ?? false,
    };
  }, []);


  // Redirect user to the correct view based on role
  const redirectForRole = useCallback((role: 'tourist' | 'business' | 'admin') => {
    if (role === 'admin') {
      toast.success('Welcome back, Admin!');
      setCurrentView('admin');
    } else if (role === 'business') {
      toast.success('Welcome! Redirecting to your dashboard...');
      setCurrentView('business-dashboard');
    } else {
      toast.success('Welcome to StikmNek!');
    }
  }, [setCurrentView]);


  // ═══════════════════════════════════════════════════════════
  // HANDLE AUTHENTICATED SESSION
  //
  // Called by onAuthStateChange for ALL auth events.
  // If no profile exists, creates one via direct DB INSERT.
  // NO edge functions. NO external dependencies.
  // ═══════════════════════════════════════════════════════════
  const handleAuthenticatedUser = useCallback(async (
    authUser: any,
    shouldRedirect: boolean
  ) => {
    if (authProcessingRef.current && !shouldRedirect) {
      setAuthLoading(false);
      return;
    }

    authProcessingRef.current = true;

    // Sync session onto the Supabase client before any RLS-backed user_profiles calls.
    await supabase.auth.getSession();

    if (profileBannerTimerRef.current) {
      clearTimeout(profileBannerTimerRef.current);
      profileBannerTimerRef.current = null;
    }

    try {
      let role: 'tourist' | 'business' | 'admin';
      let profile: UserProfile | null;
      let profileRowFetchOk = false;
      try {
        const result = await resolveRole(authUser.id, authUser.email || '', authUser.user_metadata);
        role = result.role;
        profile = result.profile;
        profileRowFetchOk = result.profileRowFetchOk;
      } catch (resolveErr) {
        console.warn('[handleAuthenticatedUser] resolveRole failed:', (resolveErr as Error)?.message);
        role = ADMIN_EMAILS.includes((authUser.email || '').toLowerCase()) ? 'admin' : 'tourist';
        profile = null;
        profileRowFetchOk = false;
      }

      // ─── FALLBACK: If no profile found, create one (with timeout, don't block) ───
      if (!profile) {
        const meta = authUser.user_metadata || {};
        const fallbackName = meta.name || meta.full_name || authUser.email?.split('@')[0] || 'User';
        const fallbackType = meta.user_type || 'tourist';

        try {
          const directResult = await Promise.race([
            directProfileInsert({
              userId: authUser.id,
              name: fallbackName,
              email: authUser.email || '',
              userType: fallbackType as 'tourist' | 'business' | 'admin',
            }),
            new Promise<{ success: boolean; profile?: any; error?: string }>((resolve) =>
              setTimeout(() => resolve({ success: false, error: 'directProfileInsert timeout' }), 8000)
            ),
          ]);

          if (directResult.success && directResult.profile) {
            profile = directResult.profile as UserProfile;
            role = extractRole(profile);
            setUserProfile(profile);
            lastDbResolvedRoleRef.current = role;
          } else {
            console.warn('[handleAuthenticatedUser] Direct DB insert failed or timed out:', directResult.error);
          }
        } catch (insertErr) {
          console.warn('[handleAuthenticatedUser] directProfileInsert exception:', (insertErr as Error)?.message);
        }
      }

      const profileReady = !!profile;
      const profileBannerMessage =
        'Failed to load your profile. Please check your connection and try again, or contact support if this continues.';
      const isListedAdmin = ADMIN_EMAILS.includes((authUser.email || '').toLowerCase());
      if (!profileReady && !profileRowFetchOk && !isListedAdmin) {
        if (profileBannerTimerRef.current) {
          clearTimeout(profileBannerTimerRef.current);
          profileBannerTimerRef.current = null;
        }
        profileBannerTimerRef.current = setTimeout(() => {
          profileBannerTimerRef.current = null;
          setUserProfileLoadError(profileBannerMessage);
        }, 1600);
      } else {
        if (profileBannerTimerRef.current) {
          clearTimeout(profileBannerTimerRef.current);
          profileBannerTimerRef.current = null;
        }
        setUserProfileLoadError(null);
      }

      const userObj = buildUser(authUser, role, profile);

      setUser(userObj);
      setShowAuth(false);

      loadUserData(authUser.id);

      if (shouldRedirect) {
        signInCooldownRef.current = Date.now();
        redirectForRole(role);
      }
    } catch (err) {
      console.error('[handleAuthenticatedUser] CRITICAL ERROR:', err);
      if (profileBannerTimerRef.current) {
        clearTimeout(profileBannerTimerRef.current);
        profileBannerTimerRef.current = null;
      }
      // Fallback still signs the user in from JWT metadata — do not show the profile banner
      // (it reads like a failed login even though the session is valid).
      setUserProfileLoadError(null);
      const meta = authUser.user_metadata || {};
      let fallbackRole: 'tourist' | 'business' | 'admin';
      
      if (ADMIN_EMAILS.includes((authUser.email || '').toLowerCase())) {
        fallbackRole = 'admin';
      } else if (lastDbResolvedRoleRef.current) {
        fallbackRole = lastDbResolvedRoleRef.current;
      } else if (meta.user_type === 'business') {
        fallbackRole = 'business';
      } else {
        fallbackRole = 'tourist';
      }
      
      setUser({
        id: authUser.id,
        name: meta.name || meta.full_name || authUser.email?.split('@')[0] || 'User',
        email: authUser.email || '',
        type: fallbackRole,
        pass: null,
        passId: null,
        passExpiry: null,
        passValidFrom: null,
        passValidUntil: null,
        avatarUrl: meta.avatar_url || null,
      });
      setShowAuth(false);
      if (shouldRedirect) {
        redirectForRole(fallbackRole);
      }
    } finally {
      authProcessingRef.current = false;
      setAuthLoading(false);
    }
  }, [resolveRole, buildUser, loadUserData, redirectForRole]);


  // ═══════════════════════════════════════════════════════════
  // AUTH STATE CHANGE LISTENER + PROACTIVE SESSION RESTORE
  //
  // Session persistence fix: getSession() is called immediately on mount.
  // If INITIAL_SESSION doesn't fire (e.g. cached/stale state), we restore
  // from storage proactively. Fallback timer reduced to 1.5s.
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    loadBusinesses();
    loadReviews();

    // Proactive session restore — don't rely solely on INITIAL_SESSION
    const initSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user && !sessionProcessedRef.current) {
          sessionProcessedRef.current = true;
          await handleAuthenticatedUser(session.user, false);
          return;
        }
        if (!session?.user) {
          sessionProcessedRef.current = true;
          setAuthLoading(false);
        }
      } catch (err) {
        console.warn('[Init] getSession error:', err);
        setAuthLoading(false);
      }
    };
    initSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        try {
          switch (event) {
            case 'SIGNED_OUT': {
              if (profileBannerTimerRef.current) {
                clearTimeout(profileBannerTimerRef.current);
                profileBannerTimerRef.current = null;
              }
              lastDbResolvedRoleRef.current = null;
              signInCooldownRef.current = 0;
              authProcessingRef.current = false;
              setUser(null);
              setUserProfile(null);
              setUserProfileLoadError(null);
              setFavorites([]);
              setRedemptions([]);
              setBusinessOwnerHasBusinessRow(null);
              setBusinessOwnerHasPendingSubmission(false);
              setAuthLoading(false);
              break;
            }

            case 'SIGNED_IN': {
              if (!session?.user) {
                console.warn('[onAuthStateChange] SIGNED_IN but no session.user');
                setAuthLoading(false);
                break;
              }
              await handleAuthenticatedUser(session.user, true);
              break;
            }

            case 'TOKEN_REFRESHED': {
              if (!session?.user) {
                setAuthLoading(false);
                break;
              }
              const msSinceSignIn = Date.now() - signInCooldownRef.current;
              if (signInCooldownRef.current > 0 && msSinceSignIn < 8000) {
                setAuthLoading(false);
                break;
              }
              await handleAuthenticatedUser(session.user, false);
              break;
            }

            case 'INITIAL_SESSION': {
              if (sessionProcessedRef.current) {
                setAuthLoading(false);
                break;
              }
              if (session?.user) {
                sessionProcessedRef.current = true;
                await handleAuthenticatedUser(session.user, false);
              } else {
                sessionProcessedRef.current = true;
                setAuthLoading(false);
              }
              break;
            }

            default: {
              break;
            }
          }
        } catch (err) {
          console.error('[onAuthStateChange] Unhandled error:', err);
          setAuthLoading(false);
        }
      }
    );

    // FALLBACK: If proactive getSession and INITIAL_SESSION both miss, retry at 1.5s
    const fallbackTimer = setTimeout(async () => {
      if (!sessionProcessedRef.current) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            sessionProcessedRef.current = true;
            await handleAuthenticatedUser(session.user, false);
          } else {
            sessionProcessedRef.current = true;
            setAuthLoading(false);
          }
        } catch (err) {
          console.error('[Init] getSession error:', err);
          sessionProcessedRef.current = true;
          setAuthLoading(false);
        }
      }
    }, 1500);

    // SAFETY NET: last resort if auth never settles (should be rare after profile load completes)
    const safetyTimer = setTimeout(() => {
      setAuthLoading(prev => {
        if (prev) {
          console.warn('[Safety] authLoading still true after 60s — forcing false');
          return false;
        }
        return prev;
      });
    }, 60_000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(fallbackTimer);
      clearTimeout(safetyTimer);
      if (profileBannerTimerRef.current) {
        clearTimeout(profileBannerTimerRef.current);
        profileBannerTimerRef.current = null;
      }
    };
  }, [loadBusinesses, loadReviews, handleAuthenticatedUser]);


  // When auth modal opens but user is already logged in (session restored from localStorage),
  // close the modal and show a toast. Do NOT redirect — user may have clicked "Sign In" by accident
  // or may want to stay on the current page. Redirect only happens on explicit sign-in (SIGNED_IN).
  useEffect(() => {
    if (showAuth && user) {
      setShowAuth(false);
      toast.info('You\'re already signed in.');
    }
  }, [showAuth, user]);

  // Realtime: refetch reviews instead of merging payload — merging raced with loadReviews()
  // after submit and could still show duplicates when ids/shapes differ slightly.
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleReload = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void loadReviewsRef.current?.();
      }, 120);
    };

    const channel = supabase
      .channel('realtime-reviews-refetch')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reviews' }, scheduleReload)
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      void supabase.removeChannel(channel);
    };
  }, []);

  // Realtime: refetch listings (business_offerings + profile join, or legacy businesses)
  useEffect(() => {
    const debounced = () => {
      void loadBusinessesRef.current?.();
    };
    const ch1 = supabase
      .channel('realtime-businesses')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'businesses' }, debounced)
      .subscribe();
    const ch2 = supabase
      .channel('realtime-business-offerings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'business_offerings' }, debounced)
      .subscribe();
    return () => {
      void supabase.removeChannel(ch1);
      void supabase.removeChannel(ch2);
    };
  }, []);

  // Realtime: refetch redemptions when server inserts a row for this user (QR redemption, etc.)
  useEffect(() => {
    const uid = user?.id;
    if (!uid) return;

    const channel = supabase
      .channel(`realtime-redemptions-${uid}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'redemptions',
          filter: `user_id=eq.${uid}`,
        },
        () => {
          void loadRedemptionsRef.current(uid);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const toggleSidebar = () => setSidebarOpen(prev => !prev);

  // ═══════════════════════════════════════════════════════════
  // SIGN IN — Simple. Call Supabase. onAuthStateChange handles the rest.
  // ═══════════════════════════════════════════════════════════
  const signIn = useCallback(async (email: string, password: string) => {
    setAuthLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      console.error('[signIn] Error:', error.message);
      setAuthLoading(false);
      toast.error(error.message || 'Sign in failed');
      throw error;
    }
  }, []);


  // ═══════════════════════════════════════════════════════════
  // SIGN UP — STRIPPED TO THE CORE (2026-02-25)
  //
  // Step 1: supabase.auth.signUp() → creates user in Auth
  //         (trigger handle_new_user fires → inserts into user_profiles)
  // Step 2: directProfileInsert() → ensures name, full_name, user_type
  //         columns are populated (trigger may not have set them)
  //
  // NO edge functions. NO layers. Two steps.
  // ═══════════════════════════════════════════════════════════
  const signUp = useCallback(async (name: string, email: string, password: string, type: 'tourist' | 'business') => {
    setAuthLoading(true);

    // ─── Step 1: Create the auth user ───
    // Auth metadata includes name and user_type so the trigger can read them
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, full_name: name, user_type: type },
      },
    });

    if (authError) {
      console.error('[signUp] Auth error:', authError.message);
      setAuthLoading(false);
      toast.error(authError.message || 'Sign up failed');
      throw authError;
    }

    const authUser = authData?.user;
    const hasSession = !!authData?.session;

    if (!authUser) {
      setAuthLoading(false);
      toast.error('Sign up failed — no user returned');
      throw new Error('No user returned from sign up');
    }

    // ─── Step 2: Ensure profile has all columns populated ───
    const isAdmin = ADMIN_EMAILS.includes(email.toLowerCase());
    const effectiveType = isAdmin ? 'admin' : type;

    if (hasSession) {
      // We have a session (JWT), so we can write to the DB via RLS
      const result = await directProfileInsert({
        userId: authUser.id,
        name: name,
        email: email,
        userType: effectiveType as 'tourist' | 'business' | 'admin',
      });

      if (result.success) {
        if (result.profile) {
          setUserProfile(result.profile as UserProfile);
        }
      } else {
        console.warn('[signUp] Profile insert/update failed:', result.error);
        toast.warning('Account created but profile setup may be delayed.');
      }

      toast.success('Account created! Welcome to StikmNek!');
      // onAuthStateChange SIGNED_IN will fire and set user state
    } else {
      // No session — email confirmation is required
      setAuthLoading(false);
      toast.success('Account created! Please check your email to confirm your account.');
      setShowAuth(false);
    }
  }, []);


  const signUpTourist = useCallback(async (name: string, email: string, password: string) => {
    await signUp(name, email, password, 'tourist');
  }, [signUp]);

  const signUpBusiness = useCallback(async (name: string, email: string, password: string) => {
    await signUp(name, email, password, 'business');
  }, [signUp]);

  // ═══════════════════════════════════════════════════════════
  // SIGN OUT
  // ═══════════════════════════════════════════════════════════
  const signOut = useCallback(async () => {
    lastDbResolvedRoleRef.current = null;
    signInCooldownRef.current = 0;
    authProcessingRef.current = false;
    setUser(null);
    setUserProfile(null);
    setUserProfileLoadError(null);
    setFavorites([]);
    setRedemptions([]);
    setCart(null);
    setCurrentView('home');
    setSidebarOpen(false);
    setBusinessOwnerHasBusinessRow(null);
    setBusinessOwnerHasPendingSubmission(false);

    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch (err) {
      console.error('[signOut] Error:', err);
    }

    toast.success('Signed out successfully');
  }, [setCurrentView]);


  // ═══════════════════════════════════════════════════════════
  // UPDATE PROFILE
  //
  // Safe fields include BOTH old and new column names.
  // After updating, re-reads the profile and syncs User state.
  // ═══════════════════════════════════════════════════════════
  const updateProfile = useCallback(async (updates: Partial<UserProfile>) => {
    if (!user) return;
    try {
      const safeFields = [
        // New columns
        'name', 'full_name', 'user_type',
        // Original columns
        'display_name', 'phone', 'avatar_url', 'home_country', 'travel_dates',
        'business_name', 'business_category', 'business_description',
        'business_location', 'business_phone', 'business_email', 'business_hours',
        'onboarding_complete',
        'num_adults', 'num_children', 'num_infants', 'preferred_contact_method', 'resort_name',
        'expected_arrival_date', 'expected_departure_date',
        'post_pass_profile_completed', 'whatsapp_number', 'email',
      ];
      const safeUpdates: Record<string, any> = { updated_at: new Date().toISOString() };
      for (const key of safeFields) {
        if ((updates as any)[key] !== undefined) {
          safeUpdates[key] = (updates as any)[key];
        }
      }

      // Keep name/display_name in sync
      if (safeUpdates.name && !safeUpdates.display_name) {
        safeUpdates.display_name = safeUpdates.name;
        safeUpdates.full_name = safeUpdates.name;
      }
      if (safeUpdates.display_name && !safeUpdates.name) {
        safeUpdates.name = safeUpdates.display_name;
        safeUpdates.full_name = safeUpdates.display_name;
      }
      // Keep user_type/role in sync
      if (safeUpdates.user_type && !safeUpdates.role) {
        safeUpdates.role = safeUpdates.user_type;
      }

      const { error } = await supabase
        .from('user_profiles')
        .update(safeUpdates)
        .eq('user_id', user.id);

      if (error) throw error;

      // Re-resolve role and sync from DB profile
      const { role, profile: updatedProfile } = await resolveRole(user.id, user.email, {});
      setUser(prev => prev ? {
        ...prev,
        type: role,
        name: updatedProfile ? extractName(updatedProfile, prev.email) : prev.name,
        email: updatedProfile?.email || prev.email,
        avatarUrl: updatedProfile?.avatar_url ?? prev.avatarUrl,
      } : null);

      toast.success('Profile updated!');
    } catch (err: any) {
      console.error('updateProfile failed:', err);
      toast.error(err.message || 'Failed to update profile');
    }
  }, [user, resolveRole]);

  // ═══════════════════════════════════════════════════════════
  // TOGGLE FAVORITE
  // ═══════════════════════════════════════════════════════════
  const toggleFavorite = useCallback(async (id: string) => {
    if (!user) {
      setShowAuth(true);
      setAuthMode('signin');
      return;
    }
    const isFav = favorites.includes(id);
    if (isFav) {
      setFavorites(prev => prev.filter(f => f !== id));
      toast.success('Removed from favorites');
      await supabase.from('favorites').delete().eq('user_id', user.id).eq('business_id', id);
    } else {
      setFavorites(prev => [...prev, id]);
      toast.success('Added to favorites');
      await supabase.from('favorites').insert({ user_id: user.id, business_id: id });
    }
  }, [user, favorites]);

  // ═══════════════════════════════════════════════════════════
  // PURCHASE PASS
  // ═══════════════════════════════════════════════════════════
  const purchasePass = useCallback(async (passType: PassProductId) => {
    if (!user) {
      setShowAuth(true);
      setAuthMode('signup-tourist');
      return;
    }
    if (user.pass === passType) {
      toast.info('You already have this pass active!');
      return;
    }
    const price = PASS_PRODUCTS[passType]?.priceAUD ?? 0;
    setCart({ passType, price });
    setCurrentView('checkout');
  }, [user, setCurrentView]);

  const refreshUserProfile = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data: profile, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      if (profile) {
        setUserProfile(profile as UserProfile);
        setUserProfileLoadError(null);
        setUser(prev => prev && prev.id === user.id
          ? {
            ...prev,
            superstarCredits: profile.superstar_credits ?? 0,
            shareBonusUnlocked: (profile as any).share_bonus_unlocked ?? false,
          }
          : prev);
      } else {
        setUserProfileLoadError(null);
      }
    } catch (err) {
      // Do not set the global profile banner here: PassCards / payment flows call refresh often;
      // transient PostgREST errors would flash a false "failed login" banner before the next success.
      console.warn('refreshUserProfile failed:', err);
    }
  }, [user?.id]);

  const retryUserProfileFetch = useCallback(async () => {
    setUserProfileLoadError(null);
    await refreshUserProfile();
  }, [refreshUserProfile]);

  // ═══════════════════════════════════════════════════════════
  // REVIEW PREFLIGHT — owner + redemption within last 30 days (businesses.id)
  // ═══════════════════════════════════════════════════════════
  const evaluateReviewSubmissionPreflight = useCallback(
    async (
      businessId: string,
      redemptionContext: 'leave_review' | 'superstar_purchase',
    ): Promise<{ ok: true } | { ok: false; message: string }> => {
      if (!user) {
        return { ok: false, message: 'Not signed in' };
      }

      const { data: ownRow } = await supabase
        .from('businesses')
        .select('id')
        .eq('id', businessId)
        .eq('owner_id', user.id)
        .maybeSingle();

      if (ownRow) {
        const msg =
          language === 'en'
            ? 'You cannot leave a review for your own business.'
            : language === 'fr'
              ? 'Vous ne pouvez pas laisser un avis sur votre propre établissement.'
              : 'Yu no save riviu long bisinis blong yu yet.';
        return { ok: false, message: msg };
      }

      const cutoff = reviewRecentRedemptionCutoffIso();

      const { data: recentRows, error: recentErr } = await supabase
        .from('redemptions')
        .select('id')
        .eq('user_id', user.id)
        .eq('business_id', businessId)
        .gte('redeemed_at', cutoff)
        .limit(1);

      if (recentErr) {
        return {
          ok: false,
          message:
            language === 'en'
              ? 'Could not verify your visit history. Please try again.'
              : language === 'fr'
                ? 'Impossible de vérifier votre historique de visites. Réessayez.'
                : 'Noka verifyem histori blong visit blong yu. Trai bakagen.',
        };
      }

      if (recentRows?.length) {
        return { ok: true };
      }

      const { data: anyRows, error: anyErr } = await supabase
        .from('redemptions')
        .select('id')
        .eq('user_id', user.id)
        .eq('business_id', businessId)
        .limit(1);

      if (anyErr) {
        return {
          ok: false,
          message:
            language === 'en'
              ? 'Could not verify your visit history. Please try again.'
              : language === 'fr'
                ? 'Impossible de vérifier votre historique de visites. Réessayez.'
                : 'Noka verifyem histori blong visit blong yu. Trai bakagen.',
        };
      }

      if (anyRows?.length) {
        return { ok: false, message: translateReviewWindowExpiredMessage(language) };
      }

      return {
        ok: false,
        message: translateMustRedeemFirstMessage(language, redemptionContext),
      };
    },
    [user, language],
  );

  const checkReviewSubmissionAllowed = useCallback(
    async (
      businessId: string,
      redemptionContext: 'leave_review' | 'superstar_purchase' = 'leave_review',
    ): Promise<{ allowed: boolean; message?: string }> => {
      if (!user) {
        return {
          allowed: false,
          message:
            language === 'en'
              ? 'Sign in to leave a review.'
              : language === 'fr'
                ? 'Connectez-vous pour laisser un avis.'
                : 'Saen in blong riviu.',
        };
      }
      const r = await evaluateReviewSubmissionPreflight(businessId, redemptionContext);
      if (r.ok) return { allowed: true };
      return { allowed: false, message: r.message };
    },
    [user, language, evaluateReviewSubmissionPreflight],
  );

  const preflightReviewSubmission = useCallback(
    async (
      businessId: string,
      redemptionContext: 'leave_review' | 'superstar_purchase',
    ): Promise<void> => {
      if (!user) {
        setShowAuth(true);
        throw new Error('Not signed in');
      }

      const r = await evaluateReviewSubmissionPreflight(businessId, redemptionContext);
      if (!r.ok) {
        toast.error(r.message);
        throw new Error(r.message);
      }
    },
    [user, setShowAuth, evaluateReviewSubmissionPreflight],
  );

  const validateSuperStarPaymentPrerequisites = useCallback(
    async (businessId: string) => preflightReviewSubmission(businessId, 'superstar_purchase'),
    [preflightReviewSubmission],
  );

  // ═══════════════════════════════════════════════════════════
  // SUBMIT REVIEW — Direct insert or RPC for Superstar
  // ═══════════════════════════════════════════════════════════
  const submitReview = useCallback(
    async (businessId: string, rating: number, comment: string, isSuperStar = false) => {
      if (!user) {
        setShowAuth(true);
        return;
      }
      try {
        const wantsSuper = isSuperStar || rating === 6;
        // Payment-specific copy is only used in validateSuperStarPaymentPrerequisites (before charging).
        await preflightReviewSubmission(businessId, 'leave_review');

        if (wantsSuper) {
          const { data: creditRow, error: creditErr } = await supabase
            .from('user_profiles')
            .select('superstar_credits')
            .eq('user_id', user.id)
            .maybeSingle();

          if (creditErr) throw creditErr;
          const liveCredits = creditRow?.superstar_credits ?? 0;
          if (liveCredits < 1) {
            const msg =
              language === 'en'
                ? 'No Super Star credits available. Please purchase a Super Star first.'
                : language === 'fr'
                  ? 'Aucun crédit Super Star disponible. Veuillez d’abord acheter un Super Star.'
                  : 'No gat Super Star kredit. Plis bae wan Super Star festaem.';
            toast.error(msg);
            throw new Error(msg);
          }

          const { error } = await supabase.rpc('submit_superstar_review', {
            p_business_id: businessId,
            p_user_name: user.name,
            p_comment: comment,
          });
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('reviews')
            .insert({
              business_id: businessId,
              user_id: user.id,
              user_name: user.name,
              rating,
              comment,
              has_super_star: false,
              created_at: new Date().toISOString(),
            })
            .select()
            .single();
          if (error) throw error;
        }

        await loadReviews();

        if (wantsSuper) {
          refreshUserProfile();
        }

        toast.success('Review submitted! Thank you.');
      } catch (err: any) {
        console.error('Submit review error:', err);
        let msg: string = err?.message || 'Failed to submit review';
        if (typeof msg === 'string' && msg.includes(REVIEW_WINDOW_EXPIRED_RPC_SNIPPET)) {
          msg = translateReviewWindowExpiredMessage(language);
        }
        toast.error(msg);
        throw err;
      }
    },
    [user, language, refreshUserProfile, loadReviews, preflightReviewSubmission, setShowAuth],
  );

  const refreshBusinesses = useCallback(async () => {
    await loadBusinesses();
  }, [loadBusinesses]);

  const refreshUserPass = useCallback(async () => {
    if (user?.id) {
      await loadUserPass(user.id);
    }
  }, [user?.id, loadUserPass]);

  const refreshRedemptions = useCallback(async () => {
    if (user?.id) {
      await loadRedemptions(user.id);
    }
  }, [user?.id, loadRedemptions]);

  const refreshBusinessOwnerRowStatus = useCallback(async () => {
    const uid = user?.id;
    const utype = user?.type;
    if (!uid || utype !== 'business') {
      setBusinessOwnerHasBusinessRow(null);
      setBusinessOwnerHasPendingSubmission(false);
      return;
    }
    try {
      const [bizRes, pendRes] = await Promise.all([
        supabase.from('businesses').select('id').eq('owner_id', uid).limit(1),
        supabase
          .from('pending_businesses')
          .select('id')
          .eq('owner_id', uid)
          .eq('status', 'pending')
          .limit(1),
      ]);
      if (bizRes.error) throw bizRes.error;
      if (pendRes.error) throw pendRes.error;
      setBusinessOwnerHasBusinessRow((bizRes.data?.length ?? 0) > 0);
      setBusinessOwnerHasPendingSubmission((pendRes.data?.length ?? 0) > 0);
    } catch (e) {
      console.warn('[refreshBusinessOwnerRowStatus]', e);
      setBusinessOwnerHasBusinessRow(false);
      setBusinessOwnerHasPendingSubmission(false);
    }
  }, [user?.id, user?.type]);

  useEffect(() => {
    void refreshBusinessOwnerRowStatus();
  }, [refreshBusinessOwnerRowStatus]);

  const touristOnboardingResume = useMemo(() => {
    if (!userProfile || user?.type !== 'tourist') return false;
    if (isTouristProfileCompleteForGate(userProfile)) return false;
    return Boolean(
      userProfile.name ||
        userProfile.full_name ||
        userProfile.display_name ||
        (userProfile.num_adults != null && userProfile.num_adults > 0) ||
        userProfile.expected_arrival_date ||
        userProfile.expected_departure_date ||
        userProfile.num_children != null ||
        userProfile.num_infants != null,
    );
  }, [userProfile, user?.type]);

  const businessOnboardingResume = useMemo(() => {
    if (!userProfile || user?.type !== 'business') return false;
    if (businessOwnerHasBusinessRow === true) return false;
    if (businessOwnerHasPendingSubmission) return true;
    return Boolean(
      (userProfile.business_name && userProfile.business_name.trim()) ||
        (userProfile.business_location && userProfile.business_location.trim()) ||
        (userProfile.business_phone && userProfile.business_phone.trim()) ||
        (userProfile.business_email && userProfile.business_email.trim()) ||
        (userProfile.whatsapp_number && userProfile.whatsapp_number.trim()),
    );
  }, [userProfile, user?.type, businessOwnerHasBusinessRow, businessOwnerHasPendingSubmission]);

  return (
    <AppContext.Provider
      value={{
        sidebarOpen, toggleSidebar,
        language, setLanguage,
        currentView, setCurrentView,
        user, userProfile, authLoading, signIn, signUp, signUpTourist, signUpBusiness, signOut,
        updateProfile,
        favorites, toggleFavorite,
        cart, setCart,
        purchasePass,
        selectedBusiness, setSelectedBusiness,
        showAuth, setShowAuth,
        authMode, setAuthMode,
        showQR, setShowQR,
        searchQuery, setSearchQuery,
        selectedCategory, setSelectedCategory,
        redemptions,
        dbBusinesses, dbReviews, submitReview, validateSuperStarPaymentPrerequisites,
        checkReviewSubmissionAllowed, dataLoaded,
        refreshBusinesses,
        refreshUserPass,
        refreshRedemptions,
        refreshUserProfile,
        retryUserProfileFetch,
        businessOwnerHasBusinessRow,
        businessOwnerHasPendingSubmission,
        refreshBusinessOwnerRowStatus,
        userProfileLoadError,
        touristOnboardingResume,
        businessOnboardingResume,
        userLocation, locationLoading, locationError,
        requestUserLocation, getDistanceTo,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};
