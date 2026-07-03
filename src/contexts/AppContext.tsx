import React, { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { toast } from 'sonner';
import { Language } from '@/data/translations';
import { Business } from '@/data/businesses';
import { supabase, directProfileInsert, SUPABASE_URL, ENDPOINTS } from '@/lib/supabase';
import { profileBusinessIdFor } from '@/lib/businessOfferingMap';
import { fetchActiveListings } from '@/lib/loadListings';
import {
  favoriteKeysFromDbRows,
  favoriteKeyForOffering,
  favoriteKeyForProfile,
  isDuplicateFavoriteRowError,
  isFavoritesOfferingSchemaError,
} from '@/lib/favoritesUi';

import { GeoPosition, haversineDistance } from '@/hooks/useGeolocation';
import { errorLogger } from '@/lib/errorLogger';
import { viewFromPathname, type ViewMode } from '@/utils/viewModes';
import type { PassProductId } from '@/data/passCatalog';
import { passProductIdFromDb } from '@/data/passCatalog';
import { clampPartySize, MAX_PARTY_SIZE } from '@/data/pricing';
import { inferIsExtendedPassFromTripDates } from '@/lib/optimalPassFromRegistration';
import { checkBusinessOwnerNeedsFirstListing } from '@/lib/businessOwnerListingStatus';

export type { ViewMode };
export type { PassProductId } from '@/data/passCatalog';

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
  /** Business owner opted in to StikmNek WhatsApp education / listing tips. */
  whatsapp_marketing_opt_in?: boolean;
  whatsapp_marketing_opt_in_at?: string | null;
  resort_name?: string | null;
  expected_arrival_date?: string | null;
  expected_departure_date?: string | null;
  post_pass_profile_completed?: boolean;
  /** If true, user has unlocked Share Bonus before buying a pass; consumed on purchase. */
  share_bonus_unlocked?: boolean;
  /** Checkout default group size (1–20); column `user_profiles.party_size` (nullable). */
  party_size?: number | null;
  /** Checkout default pass length; column `user_profiles.preferred_pass_duration` enum. */
  preferred_pass_duration?: 'short' | 'extended' | null;
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
  /** From active `passes.amount_paid` (typically AUD). */
  passAmountPaidAud?: number | null;
  /** From active `passes.currency` (e.g. AUD). */
  passCurrency?: string | null;
}

export interface CartItem {
  partySize: number;
  isExtended: boolean;
}

/** Initial checkout cart: profile / auth metadata, then adults+children (ages 6+), else 1 guest. */
export function defaultPassCartFromProfile(
  profile: UserProfile | null,
  authMetadata?: Record<string, unknown> | null,
): CartItem {
  const authDur = String(authMetadata?.preferred_pass_duration ?? '').toLowerCase();
  const authExt = authDur === 'extended';
  const authShort = authDur === 'short';
  const profExt = profile?.preferred_pass_duration === 'extended';
  const profShort = profile?.preferred_pass_duration === 'short';

  let isExtended = false;
  if (authExt || profExt) isExtended = true;
  else if (authShort || profShort) isExtended = false;
  else isExtended = inferIsExtendedPassFromTripDates(profile);

  if (profile) {
    const adults = profile.num_adults ?? 0;
    const children = profile.num_children ?? 0;
    const combined = adults + children;
    if (combined > 0) {
      return { partySize: clampPartySize(combined), isExtended };
    }
  }

  const rawMetaParty = authMetadata?.party_size ?? profile?.party_size;
  const metaPartyN =
    typeof rawMetaParty === 'number'
      ? rawMetaParty
      : typeof rawMetaParty === 'string'
        ? parseInt(String(rawMetaParty), 10)
        : NaN;
  if (Number.isFinite(metaPartyN) && metaPartyN >= 1 && metaPartyN <= MAX_PARTY_SIZE) {
    return { partySize: clampPartySize(metaPartyN), isExtended };
  }

  if (!profile) {
    return { partySize: 1, isExtended };
  }
  return { partySize: 1, isExtended };
}

export interface DBReview {
  id: string;
  business_id: string;
  offering_id?: string | null;
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
    offering_id: row.offering_id != null ? String(row.offering_id) : null,
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
  const off = r.offering_id ? String(r.offering_id) : '';
  return `fp:${r.business_id}|${off}|${name}|${ratingKey}|${cmt}|${createdDate}`;
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
  /** Encoded keys: `off:<offering_uuid>` or `biz:<profile_businesses.id>` (see favoritesUi). */
  favorites: string[];
  /** Pass a `Business` listing for per-deal favorites, or a profile id string for map “whole venue”. */
  toggleFavorite: (target: Business | string) => Promise<void>;
  cart: CartItem | null;
  setCart: (item: CartItem | null) => void;
  /** Opens checkout; optional `isExtended` / `partySize` override profile defaults. */
  purchasePass: (opts?: { isExtended?: boolean; partySize?: number }) => void;
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
  redemptions: { businessId: string; date: string; saved: number; offeringId: string | null }[];
  dbBusinesses: Business[];
  dbReviews: DBReview[];
  /** optional `offeringId` associates the review to a specific listing/deal (businessId stays the master profile id). */
  submitReview: (businessId: string, rating: number, comment: string, isSuperStar?: boolean, offeringId?: string | null) => Promise<void>;
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
  /** Set when the latest listings fetch failed or returned zero rows. */
  listingsLoadError: string | null;
  listingsLoadSource: 'business_listings_view' | 'business_offerings_join' | 'none' | null;
  refreshBusinesses: () => Promise<void>;
  refreshUserPass: () => Promise<void>;
  /** Reload pass redemptions from DB (e.g. after QR redemption). */
  refreshRedemptions: () => Promise<void>;
  /** null = not loaded; business owners only — true if `businesses` has a row for this user. */
  businessOwnerHasBusinessRow: boolean | null;
  /** True if this owner has a pending_businesses submission (awaiting review). */
  businessOwnerHasPendingSubmission: boolean;
  /** Profile saved but no live offering and no pending submission — should submit a deal. */
  businessOwnerNeedsFirstListing: boolean | null;
  /**
   * Last `refreshBusinessOwnerRowStatus` attempt counter: 0 = idle or last run succeeded;
   * 1–3 while retrying; 3 = all retries failed (row unknown — `businessOwnerHasBusinessRow` stays null).
   */
  businessOwnerRowLookupRetryCount: number;
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
  const [currentView, setCurrentView] = useState<ViewMode>(() => {
    if (typeof window === 'undefined') return 'home';
    return viewFromPathname(window.location.pathname) ?? 'home';
  });

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
  const [redemptions, setRedemptions] = useState<
    { businessId: string; date: string; saved: number; offeringId: string | null }[]
  >([]);
  const [dbBusinesses, setDbBusinesses] = useState<Business[]>([]);
  const [dbReviews, setDbReviews] = useState<DBReview[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [listingsLoadError, setListingsLoadError] = useState<string | null>(null);
  const [listingsLoadSource, setListingsLoadSource] = useState<
    'business_listings_view' | 'business_offerings_join' | 'none' | null
  >(null);
  const [businessOwnerHasBusinessRow, setBusinessOwnerHasBusinessRow] = useState<boolean | null>(null);
  const [businessOwnerHasPendingSubmission, setBusinessOwnerHasPendingSubmission] = useState(false);
  const [businessOwnerNeedsFirstListing, setBusinessOwnerNeedsFirstListing] = useState<boolean | null>(null);
  /** Bumps to cancel in-flight owner-row lookups when user/session changes (see `refreshBusinessOwnerRowStatus`). */
  const businessOwnerRowFetchGenRef = useRef(0);
  /** Attempt index for the current refresh (1-based); 0 after success; 3 after exhausted retries. */
  const [businessOwnerRowLookupRetryCount, setBusinessOwnerRowLookupRetryCount] = useState(0);
  const [userProfileLoadError, setUserProfileLoadError] = useState<string | null>(null);

  // Geolocation state
  const [userLocation, setUserLocation] = useState<GeoPosition | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Track whether we've already processed the initial session
  const sessionProcessedRef = useRef(false);
  /** Monotonic id so concurrent `loadBusinesses` calls cannot let an older error wipe newer data. */
  const businessesLoadGenRef = useRef(0);

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
  /** Only true immediately after `signIn` / signup-with-session so `SIGNED_IN` can redirect; stray tab-sync events skip dashboard redirect. */
  const authIntentRedirectRef = useRef(false);
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
    const gen = ++businessesLoadGenRef.current;
    const listAbort =
      typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
        ? AbortSignal.timeout(45_000)
        : undefined;
    try {
      const result = await fetchActiveListings(supabase, SUPABASE_URL, { signal: listAbort });

      if (gen !== businessesLoadGenRef.current) return;

      setListingsLoadSource(result.source);
      setListingsLoadError(result.error);

      if (result.businesses.length > 0) {
        setDbBusinesses(result.businesses);
        if (result.source === 'business_offerings_join') {
          console.warn(
            `${DBG} Loaded ${result.businesses.length} listings via offerings join fallback`,
          );
        } else {
          console.log(`${DBG} Loaded ${result.businesses.length} listings from view`);
        }
      } else if (result.error) {
        console.warn(`${DBG} No listings:`, result.error);
        // Keep prior listings on transient errors if we had data (e.g. tab refocus).
        setDbBusinesses((prev) => (prev.length > 0 ? prev : []));
      } else {
        setDbBusinesses([]);
      }
      setDataLoaded(true);
    } catch (err) {
      if (gen !== businessesLoadGenRef.current) return;
      const msg = err instanceof Error ? err.message : 'Could not load listings';
      console.error('[loadBusinesses] Failed to load businesses:', err);
      setListingsLoadError(msg);
      setListingsLoadSource('none');
      setDbBusinesses((prev) => (prev.length > 0 ? prev : []));
      setDataLoaded(true);
    }
  }, []);

  const loadReviews = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('reviews')
        .select('*')
        // Only show public reviews in the tourist UI; admins can hide/unhide in Admin Panel.
        .or('is_public.is.null,is_public.eq.true')
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
        .select('business_id, offering_id')
        .eq('user_id', userId);
      if (error) throw error;
      if (data) {
        setFavorites(
          favoriteKeysFromDbRows(
            data as { business_id: string; offering_id?: string | null }[],
          ),
        );
      }
    } catch (err) {
      console.error('Failed to load favorites:', err);
      try {
        const { data, error } = await supabase
          .from('favorites')
          .select('business_id')
          .eq('user_id', userId);
        if (error) throw error;
        if (data) {
          setFavorites(
            (data as { business_id: string }[]).map((f) => favoriteKeyForProfile(String(f.business_id))),
          );
        }
      } catch (e2) {
        console.error('Failed to load favorites (fallback):', e2);
      }
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

      const clearPassFields = (prev: User | null): User | null => {
        if (!prev || prev.id !== userId) return prev;
        return {
          ...prev,
          pass: null,
          passId: null,
          passExpiry: null,
          passValidFrom: null,
          passValidUntil: null,
          passPeopleCount: null,
          shareBonusApplied: null,
          passAmountPaidAud: null,
          passCurrency: null,
        };
      };

      if (!data || data.length === 0) {
        setUser(clearPassFields);
        return;
      }

      const pass = data[0];
      const expiry = new Date(pass.expires_at);
      if (expiry <= new Date()) {
        setUser(clearPassFields);
        return;
      }

      const validFrom = pass.valid_from ? new Date(pass.valid_from).toISOString().split('T')[0] : null;
      const validUntil = pass.valid_until ? new Date(pass.valid_until).toISOString().split('T')[0] : null;
      const peopleCount = pass.max_people ?? pass.people_count ?? null;
      const shareBonusApplied = pass.share_bonus_applied ?? false;
      const paid = Number(pass.amount_paid);
      const amountPaidAud = Number.isFinite(paid) && paid > 0 ? paid : null;
      const cur = pass.currency != null ? String(pass.currency).trim().toUpperCase() : '';
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
          passAmountPaidAud: amountPaidAud,
          passCurrency: cur || 'AUD',
        };
      });
    } catch (err) {
      console.error('Failed to load pass:', err);
    }
  }, []);

  const loadRedemptions = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('redemptions')
        .select('business_id, redeemed_at, saved_amount, offering_id')
        .eq('user_id', userId)
        .order('redeemed_at', { ascending: false });
      if (error) throw error;
      if (data) {
        setRedemptions(
          data.map((r: any) => ({
            businessId: r.business_id,
            date: new Date(r.redeemed_at).toISOString().split('T')[0],
            saved: Number(r.saved_amount) || 0,
            offeringId: r.offering_id != null ? String(r.offering_id) : null,
          })),
        );
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
            const profileAbort =
              typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
                ? AbortSignal.timeout(12_000)
                : undefined;
            let pq = supabase.from('user_profiles').select('*').eq('user_id', userId).maybeSingle();
            if (profileAbort) pq = pq.abortSignal(profileAbort);
            const { data, error } = await pq;
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
      toast.success('Welcome! Set up your business profile to continue.');
      setCurrentView('complete-business-profile');
    } else {
      toast.success('Welcome to StikmNek!');
    }
  }, [setCurrentView]);

  /** After sign-in: hub if a `businesses` row exists, otherwise profile setup (step 2). */
  const redirectBusinessUserAfterAuth = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('businesses')
        .select('id')
        .eq('owner_id', userId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      const hasRow = Boolean(data?.id);
      setBusinessOwnerHasBusinessRow(hasRow);
      if (hasRow) {
        const needsListing = await checkBusinessOwnerNeedsFirstListing(supabase, userId);
        setBusinessOwnerNeedsFirstListing(needsListing);
        setCurrentView('business-dashboard');
        if (needsListing) {
          toast.success(
            'Welcome back! Submit your first deal next — photos, prices, and discount.',
          );
          window.setTimeout(() => {
            window.dispatchEvent(new CustomEvent('switch-dashboard-tab', { detail: { tab: 'submit' } }));
          }, 150);
        } else {
          toast.success('Welcome back!');
        }
      } else {
        setBusinessOwnerNeedsFirstListing(false);
        toast.success('Welcome! Set up your business profile to continue.');
        setCurrentView('complete-business-profile');
      }
    } catch (err) {
      console.warn('[redirectBusinessUserAfterAuth]', err);
      setBusinessOwnerHasBusinessRow(null);
      setBusinessOwnerNeedsFirstListing(null);
      toast.success('Welcome! Set up your business profile to continue.');
      setCurrentView('complete-business-profile');
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

    // Yield off the GoTrue notifier stack — awaiting getSession() here has caused rare deadlocks
    // with localStorage/session restore where auth never settles and sign-in spins until timeout.
    await new Promise<void>((r) => setTimeout(r, 0));

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
        if (role === 'business') {
          await redirectBusinessUserAfterAuth(authUser.id);
        } else {
          redirectForRole(role);
        }
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
        signInCooldownRef.current = Date.now();
        if (fallbackRole === 'business') {
          await redirectBusinessUserAfterAuth(authUser.id);
        } else {
          redirectForRole(fallbackRole);
        }
      }
    } finally {
      authProcessingRef.current = false;
      setAuthLoading(false);
    }
  }, [resolveRole, buildUser, loadUserData, redirectForRole, redirectBusinessUserAfterAuth]);


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

    const getSessionWithTimeout = async (ms: number) => {
      return Promise.race([
        supabase.auth.getSession(),
        new Promise<{ data: { session: null }; error: Error }>((_, reject) =>
          setTimeout(() => reject(new Error(`getSession timed out after ${ms}ms`)), ms),
        ),
      ]);
    };

    // Proactive session restore — don't rely solely on INITIAL_SESSION
    const initSession = async () => {
      try {
        const { data: { session } } = await getSessionWithTimeout(15_000);
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
        console.warn('[Init] getSession error or timeout:', err);
        sessionProcessedRef.current = true;
        setAuthLoading(false);
      }
    };
    initSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setTimeout(() => {
          void (async () => {
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
              setBusinessOwnerNeedsFirstListing(null);
              setAuthLoading(false);
              break;
            }

            case 'SIGNED_IN': {
              if (!session?.user) {
                console.warn('[onAuthStateChange] SIGNED_IN but no session.user');
                setAuthLoading(false);
                break;
              }
              const wantRedirect = authIntentRedirectRef.current;
              authIntentRedirectRef.current = false;
              await handleAuthenticatedUser(session.user, wantRedirect);
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
          })();
        }, 0);
      }
    );

    // FALLBACK: If proactive getSession and INITIAL_SESSION both miss, retry at 1.5s
    const fallbackTimer = setTimeout(async () => {
      if (!sessionProcessedRef.current) {
        try {
          const { data: { session } } = await getSessionWithTimeout(15_000);
          if (session?.user) {
            sessionProcessedRef.current = true;
            await handleAuthenticatedUser(session.user, false);
          } else {
            sessionProcessedRef.current = true;
            setAuthLoading(false);
          }
        } catch (err) {
          console.error('[Init] fallback getSession error or timeout:', err);
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
  // or may want to stay on the current page. Role redirect runs only when `authIntentRedirectRef` was set by sign-in / sign-up-with-session.
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

  // Realtime: refetch listings when underlying tables change (view has no postgres_changes channel)
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
    authIntentRedirectRef.current = true;

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    // #region agent log
    try {
      fetch('http://127.0.0.1:7607/ingest/08ca587e-0a1d-4571-8adc-bbc01b0f0e0b', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'e04eda' }, body: JSON.stringify({ sessionId: 'e04eda', runId: 'initial', hypothesisId: 'E', location: 'AppContext.tsx:signIn', message: 'signInWithPassword result', data: { ok: !error, error: error?.message ?? null, status: (error as { status?: number } | null)?.status ?? null, emailLower: email === email.trim().toLowerCase() }, timestamp: Date.now() }) }).catch(() => {});
    } catch { /* ignore */ }
    // #endregion

    if (error) {
      authIntentRedirectRef.current = false;
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
    authIntentRedirectRef.current = true;

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
      authIntentRedirectRef.current = false;
      console.error('[signUp] Auth error:', authError.message);
      setAuthLoading(false);
      toast.error(authError.message || 'Sign up failed');
      throw authError;
    }

    const authUser = authData?.user;
    const hasSession = !!authData?.session;
    if (!hasSession) {
      authIntentRedirectRef.current = false;
    }

    if (!authUser) {
      authIntentRedirectRef.current = false;
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
    businessOwnerRowFetchGenRef.current += 1;
    setBusinessOwnerRowLookupRetryCount(0);
    setBusinessOwnerHasBusinessRow(null);
    setBusinessOwnerHasPendingSubmission(false);
    setBusinessOwnerNeedsFirstListing(null);

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
  const toggleFavorite = useCallback(
    async (target: Business | string) => {
      if (!user) {
        setShowAuth(true);
        setAuthMode('signin');
        return;
      }
      let profileId: string;
      let offeringId: string | null;
      if (typeof target === 'string') {
        profileId = target;
        offeringId = null;
      } else {
        profileId = profileBusinessIdFor(target);
        offeringId = target.id !== profileId ? target.id : null;
      }
      const key = offeringId ? favoriteKeyForOffering(offeringId) : favoriteKeyForProfile(profileId);
      const bizKey = favoriteKeyForProfile(profileId);
      const isFav = favorites.includes(key) || (offeringId != null && favorites.includes(bizKey));
      const favoritesAtOpen = favorites;

      if (isFav) {
        setFavorites((prev) => prev.filter((f) => f !== key && f !== bizKey));
        toast.success('Removed from favorites');
        if (offeringId) {
          let { error } = await supabase
            .from('favorites')
            .delete()
            .eq('user_id', user.id)
            .eq('offering_id', offeringId);
          if (error && isFavoritesOfferingSchemaError(error)) {
            ({ error } = await supabase
              .from('favorites')
              .delete()
              .eq('user_id', user.id)
              .eq('business_id', profileId));
          }
          if (error) {
            setFavorites(favoritesAtOpen);
            toast.error(error.message || 'Could not remove favorite');
            return;
          }
        } else {
          let { error } = await supabase
            .from('favorites')
            .delete()
            .eq('user_id', user.id)
            .eq('business_id', profileId)
            .is('offering_id', null);
          if (error && isFavoritesOfferingSchemaError(error)) {
            ({ error } = await supabase
              .from('favorites')
              .delete()
              .eq('user_id', user.id)
              .eq('business_id', profileId));
          }
          if (error) {
            setFavorites(favoritesAtOpen);
            toast.error(error.message || 'Could not remove favorite');
            return;
          }
        }
        return;
      }

      setFavorites((prev) => [...prev, key]);
      toast.success('Added to favorites');
      const insertRow: { user_id: string; business_id: string; offering_id?: string | null } = {
        user_id: user.id,
        business_id: profileId,
      };
      if (offeringId) {
        insertRow.offering_id = offeringId;
        const delLegacy = await supabase
          .from('favorites')
          .delete()
          .eq('user_id', user.id)
          .eq('business_id', profileId)
          .is('offering_id', null);
        if (delLegacy.error && !isFavoritesOfferingSchemaError(delLegacy.error)) {
          console.warn('[toggleFavorite] pre-delete legacy favorite:', delLegacy.error);
        }
      }
      let { error } = await supabase.from('favorites').insert(insertRow);
      if (error && offeringId && isFavoritesOfferingSchemaError(error)) {
        const legacy = await supabase
          .from('favorites')
          .insert({ user_id: user.id, business_id: profileId });
        error = legacy.error;
        if (!legacy.error) {
          setFavorites((prev) => {
            const withoutOff = prev.filter((f) => f !== key);
            return withoutOff.includes(bizKey) ? withoutOff : [...withoutOff, bizKey];
          });
          return;
        }
        if (legacy.error && isDuplicateFavoriteRowError(legacy.error)) {
          setFavorites((prev) => {
            const withoutOff = prev.filter((f) => f !== key);
            return withoutOff.includes(bizKey) ? withoutOff : [...withoutOff, bizKey];
          });
          return;
        }
      }
      if (error) {
        setFavorites((prev) => prev.filter((f) => f !== key));
        console.error('[toggleFavorite] insert failed:', error);
        toast.error(error.message || 'Could not save favorite');
      }
    },
    [user, favorites],
  );

  // ═══════════════════════════════════════════════════════════
  // PURCHASE PASS
  // ═══════════════════════════════════════════════════════════
  const purchasePass = useCallback(
    async (opts?: { isExtended?: boolean; partySize?: number }) => {
      if (!user) {
        setShowAuth(true);
        setAuthMode('signup-tourist');
        return;
      }
      if (user.passId && user.passExpiry) {
        const exp = new Date(user.passExpiry + 'T23:59:59');
        if (exp > new Date()) {
          toast.info('You already have an active pass!');
          return;
        }
      } else if (user.passId) {
        toast.info('You already have an active pass!');
        return;
      }
      let authMeta: Record<string, unknown> | null = null;
      try {
        const {
          data: { user: authUser },
        } = await supabase.auth.getUser();
        authMeta = (authUser?.user_metadata ?? null) as Record<string, unknown> | null;
      } catch {
        authMeta = null;
      }
      const defaults = defaultPassCartFromProfile(userProfile, authMeta);
      const nextCart = {
        ...defaults,
        ...(opts?.isExtended !== undefined ? { isExtended: opts.isExtended } : {}),
        ...(opts?.partySize !== undefined ? { partySize: clampPartySize(opts.partySize) } : {}),
      };
      setCart(nextCart);
      setCurrentView('checkout');
    },
    [user, userProfile, setCurrentView],
  );

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
              : 'Noka verifyem histori blong visit blong yu. Trai bakagen.';
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
                : 'Saen in blong riviu.',
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
                : 'No gat Super Star kredit. Plis bae wan Super Star festaem.',
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
                : 'Putem taetel blong dil ia.',
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
    async (businessId: string, rating: number, comment: string, isSuperStar = false, offeringId?: string | null) => {
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
                  : 'Putem samting long description — nomo ol framaton long hem.';
            toast.error(msg);
            throw new Error(msg);
          }

          const { error } = await supabase.rpc('submit_superstar_review', {
            p_business_id: businessId,
            p_user_name: user.name,
            p_comment: comment,
            p_offering_id: offeringId ?? null,
          });
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('reviews')
            .insert({
              business_id: businessId,
              offering_id: offeringId ?? null,
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
      businessOwnerRowFetchGenRef.current += 1;
      setBusinessOwnerRowLookupRetryCount(0);
      setBusinessOwnerHasBusinessRow(null);
      setBusinessOwnerHasPendingSubmission(false);
      setBusinessOwnerNeedsFirstListing(null);
      return;
    }

    const gen = ++businessOwnerRowFetchGenRef.current;
    const backoffMs = [1000, 2000, 4000] as const;
    const userEmail = user?.email ?? null;

    setBusinessOwnerRowLookupRetryCount(0);

    for (let attempt = 0; attempt < 3; attempt++) {
      if (gen !== businessOwnerRowFetchGenRef.current) return;
      setBusinessOwnerRowLookupRetryCount(attempt + 1);

      try {
        const [bizRes, pendRes] = await Promise.all([
          supabase.from('businesses').select('id').eq('owner_id', uid),
          supabase
            .from('pending_businesses')
            .select('id')
            .eq('owner_id', uid)
            .eq('status', 'pending')
            .limit(1),
        ]);
        if (gen !== businessOwnerRowFetchGenRef.current) return;
        if (bizRes.error) throw bizRes.error;
        if (pendRes.error) throw pendRes.error;
        const hasRow = (bizRes.data?.length ?? 0) > 0;
        const hasPending = (pendRes.data?.length ?? 0) > 0;
        setBusinessOwnerHasBusinessRow(hasRow);
        setBusinessOwnerHasPendingSubmission(hasPending);

        let needsFirstListing = false;
        if (hasRow) {
          const profileIds = (bizRes.data ?? []).map((b) => String(b.id)).filter(Boolean);
          if (profileIds.length > 0) {
            const { data: offeringRows, error: offErr } = await supabase
              .from('business_offerings')
              .select('id')
              .in('business_id', profileIds)
              .limit(1);
            if (gen !== businessOwnerRowFetchGenRef.current) return;
            if (offErr) throw offErr;
            const hasOffering = (offeringRows?.length ?? 0) > 0;
            needsFirstListing = !hasOffering && !hasPending;
          }
        }
        setBusinessOwnerNeedsFirstListing(needsFirstListing);
        setBusinessOwnerRowLookupRetryCount(0);
        return;
      } catch (e: unknown) {
        if (gen !== businessOwnerRowFetchGenRef.current) return;

        const errObj = e as { message?: string; code?: string; details?: string; hint?: string };
        console.error('[refreshBusinessOwnerRowStatus] attempt failed', {
          context: 'refreshBusinessOwnerRowStatus',
          attempt: attempt + 1,
          maxAttempts: 3,
          userId: uid,
          userEmail,
          message: errObj?.message ?? (e instanceof Error ? e.message : String(e)),
          code: errObj?.code,
          details: errObj?.details,
          hint: errObj?.hint,
        });

        if (attempt < 2) {
          await new Promise<void>((resolve) => {
            setTimeout(resolve, backoffMs[attempt]);
          });
        }
      }
    }

    if (gen !== businessOwnerRowFetchGenRef.current) return;
    console.error('[refreshBusinessOwnerRowStatus] all attempts failed — owner row / pending unknown', {
      context: 'refreshBusinessOwnerRowStatus',
      userId: uid,
      userEmail,
      attempts: 3,
      backoffMsDelays: [...backoffMs],
    });
    setBusinessOwnerHasBusinessRow(null);
    setBusinessOwnerNeedsFirstListing(null);
    setBusinessOwnerRowLookupRetryCount(3);
  }, [user?.id, user?.type, user?.email]);

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
        listingsLoadError,
        listingsLoadSource,
        refreshBusinesses,
        refreshUserPass,
        refreshRedemptions,
        refreshUserProfile,
        retryUserProfileFetch,
        businessOwnerHasBusinessRow,
        businessOwnerHasPendingSubmission,
        businessOwnerNeedsFirstListing,
        businessOwnerRowLookupRetryCount,
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
