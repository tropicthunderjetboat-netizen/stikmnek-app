import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Language } from '@/data/translations';
import { Business } from '@/data/businesses';
import { supabase, directProfileInsert, SUPABASE_URL } from '@/lib/supabase';
import { getBusinessImageUrl } from '@/lib/utils';

import { GeoPosition, haversineDistance } from '@/hooks/useGeolocation';
import { errorLogger } from '@/lib/errorLogger';


// ═══════════════════════════════════════════════════════════════
// ADMIN EMAILS: These always get 'admin' role regardless of DB
// ═══════════════════════════════════════════════════════════════
const ADMIN_EMAILS = ['admin@stikmnek.com', 'testadmin@example.com', 'stikmnek@gmail.com'];

export type ViewMode =
  | 'home'
  | 'deals'
  | 'map'
  | 'passes'
  | 'dashboard'
  | 'admin'
  | 'business-detail'
  | 'checkout'
  | 'payment-confirmation'
  | 'business-dashboard'
  | 'help'
  | 'complete-profile';

export type PassType = 'daily' | 'weekly' | 'monthly' | 'mega_group' | null;

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
  passType: 'daily' | 'weekly' | 'monthly' | 'mega_group';
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
  purchasePass: (passType: 'daily' | 'weekly' | 'monthly' | 'mega_group') => void;
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
  refreshUserProfile: () => Promise<void>;
  dataLoaded: boolean;
  refreshBusinesses: () => Promise<void>;
  refreshUserPass: () => Promise<void>;
  /** Reload pass redemptions from DB (e.g. after QR redemption). */
  refreshRedemptions: () => Promise<void>;
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

  // Geolocation state
  const [userLocation, setUserLocation] = useState<GeoPosition | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Track whether we've already processed the initial session
  const sessionProcessedRef = useRef(false);

  // ═══ ROLE PERSISTENCE GUARDS ═══
  const lastDbResolvedRoleRef = useRef<'tourist' | 'business' | 'admin' | null>(null);
  const signInCooldownRef = useRef<number>(0);
  const authProcessingRef = useRef<boolean>(false);

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
    try {
      const { data, error } = await supabase
        .from('businesses')
        .select('*')
        .order('featured', { ascending: false });
      if (error) throw error;
      if (data) {
        const mapped: Business[] = data.map((b: any) => ({
          id: b.id,
          name: b.name ?? '',
          category: b.category ?? 'dining',
          description: b.description ?? '',
          descriptionFr: b.description_fr || b.description,
          descriptionBi: b.description_bi || b.description,
          image: getBusinessImageUrl(b.image_url || b.image, SUPABASE_URL),
          rating: Number(b.rating) || 0,
          reviewCount: b.review_count || 0,
          discount: b.deal || b.discount || '',
          originalPrice: Number(b.original_price) || 0,
          dealPrice: Number(b.discounted_price ?? b.deal_price) || 0,
          location: b.location || '',
          lat: Number(b.lat) || 0,
          lng: Number(b.lng) || 0,
          mapUrl: b.map_url || null,
          map_url: b.map_url || null,
          website: b.website || null,
          hours: b.opening_hours || b.hours || '',
          phone: b.phone || b.business_phone || b.contact_phone || b.phone_number || '',
          contactEmail: b.email || b.contact_email || b.business_email || null,
          whatsappNumber: b.whatsapp_number || b.whatsapp || b.business_whatsapp || null,
          tags: b.tags || [],
          featured: b.featured || false,
          ownerId: b.owner_id || null,
          superStarCount: Number(b.super_star_count) || 0,
          pricingTiers: b.pricing_tiers ?? null,
        }));
        setDbBusinesses(mapped);
        setDataLoaded(true);
      }
    } catch (err) {
      console.error('Failed to load businesses:', err);
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
              pass: pass.pass_type as PassType,
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
  // ROLE RESOLUTION — Fail-fast, single source of truth
  // Priority: 1) Admin email  2) DB profile  3) Previously resolved
  //           4) Auth metadata  5) Default tourist (never hang)
  // DB fetch has 3s timeout. Admin DB update runs in background.
  // ═══════════════════════════════════════════════════════════
  const ROLE_RESOLVE_TIMEOUT_MS = 3000;

  const resolveRole = useCallback(async (
    userId: string,
    email: string,
    metadata?: Record<string, any>
  ): Promise<{ role: 'tourist' | 'business' | 'admin'; profile: UserProfile | null; fromDb: boolean }> => {
    console.log('[resolveRole] START for userId:', userId, 'email:', email);

    // Step 1: Admin email check (synchronous, never blocks)
    const isAdmin = ADMIN_EMAILS.includes(email.toLowerCase());
    if (isAdmin) {
      console.log('[resolveRole] ADMIN EMAIL MATCH — role = admin');
    }

    // Step 2: Fetch profile with timeout — fail-fast
    let profile: UserProfile | null = null;
    let dbQuerySucceeded = false;
    try {
      const fetchPromise = supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('resolveRole: DB query timeout')), ROLE_RESOLVE_TIMEOUT_MS)
      );

      const { data, error } = await Promise.race([fetchPromise, timeoutPromise]);

      if (error) {
        console.error('[resolveRole] DB query error:', error.message);
      } else if (data) {
        profile = data as UserProfile;
        dbQuerySucceeded = true;
        console.log('[resolveRole] DB profile FOUND — user_type:', profile.user_type, 'role:', profile.role, 'name:', profile.name);
      } else {
        dbQuerySucceeded = true;
        console.log('[resolveRole] No profile in DB for this user');
      }
    } catch (err) {
      console.warn('[resolveRole] Exception or timeout:', (err as Error)?.message);
    }

    // Step 3: Determine final role — never block, always resolve
    let finalRole: 'tourist' | 'business' | 'admin';
    let resolvedFromDb = false;

    if (isAdmin) {
      finalRole = 'admin';
      resolvedFromDb = true;
      // Defer admin DB update to background — don't block auth flow
      if (profile && extractRole(profile) !== 'admin') {
        console.log('[resolveRole] Scheduling admin DB update (background)');
        supabase
          .from('user_profiles')
          .update({ role: 'admin', user_type: 'admin', updated_at: new Date().toISOString() })
          .eq('user_id', userId)
          .then(() => console.log('[resolveRole] Admin profile updated'))
          .catch((e) => console.warn('[resolveRole] Admin update failed:', e?.message));
        profile = { ...profile, role: 'admin', user_type: 'admin' };
      }
    } else if (profile) {
      finalRole = extractRole(profile);
      resolvedFromDb = true;
      console.log('[resolveRole] Using DB role:', finalRole);
    } else if (!dbQuerySucceeded && lastDbResolvedRoleRef.current) {
      finalRole = lastDbResolvedRoleRef.current;
      console.log('[resolveRole] DB query FAILED — preserving last known role:', finalRole);
    } else if (metadata?.user_type && ['tourist', 'business', 'admin'].includes(metadata.user_type)) {
      finalRole = metadata.user_type as 'tourist' | 'business' | 'admin';
      console.log('[resolveRole] No DB profile — using metadata user_type:', finalRole);
    } else {
      finalRole = 'tourist';
      console.log('[resolveRole] Fail-fast: defaulting to tourist');
    }

    if (resolvedFromDb) {
      lastDbResolvedRoleRef.current = finalRole;
    }

    if (profile) {
      setUserProfile(profile);
    }

    console.log('[resolveRole] FINAL ROLE:', finalRole);
    return { role: finalRole, profile, fromDb: resolvedFromDb };
  }, []);


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
    console.log('[redirectForRole] Redirecting for role:', role);
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
      console.log('[handleAuthenticatedUser] SKIPPING — another call is in progress');
      setAuthLoading(false);
      return;
    }

    authProcessingRef.current = true;

    try {
      console.log('[handleAuthenticatedUser] Processing user:', authUser.email, 'shouldRedirect:', shouldRedirect);

      // Fail-fast: resolveRole has internal timeout; wrap in extra safety
      let role: 'tourist' | 'business' | 'admin';
      let profile: UserProfile | null;
      try {
        const result = await Promise.race([
          resolveRole(authUser.id, authUser.email || '', authUser.user_metadata),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('handleAuthenticatedUser: resolveRole timeout')), 5000)
          ),
        ]);
        role = result.role;
        profile = result.profile;
      } catch (resolveErr) {
        console.warn('[handleAuthenticatedUser] resolveRole failed — using default tourist:', (resolveErr as Error)?.message);
        role = ADMIN_EMAILS.includes((authUser.email || '').toLowerCase()) ? 'admin' : 'tourist';
        profile = null;
      }

      // ─── FALLBACK: If no profile found, create one (with timeout, don't block) ───
      if (!profile) {
        console.log('[handleAuthenticatedUser] No profile found — creating via direct DB insert');
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
              setTimeout(() => resolve({ success: false, error: 'directProfileInsert timeout' }), 4000)
            ),
          ]);

          if (directResult.success && directResult.profile) {
            profile = directResult.profile as UserProfile;
            role = extractRole(profile);
            setUserProfile(profile);
            lastDbResolvedRoleRef.current = role;
            console.log('[handleAuthenticatedUser] Profile created — role:', role);
          } else {
            console.warn('[handleAuthenticatedUser] Direct DB insert failed or timed out:', directResult.error);
          }
        } catch (insertErr) {
          console.warn('[handleAuthenticatedUser] directProfileInsert exception:', (insertErr as Error)?.message);
        }
      }

      const userObj = buildUser(authUser, role, profile);

      console.log('[handleAuthenticatedUser] Setting user state — role:', role, 'name:', userObj.name);
      setUser(userObj);
      setShowAuth(false);

      loadUserData(authUser.id);

      if (shouldRedirect) {
        signInCooldownRef.current = Date.now();
        redirectForRole(role);
      }
    } catch (err) {
      console.error('[handleAuthenticatedUser] CRITICAL ERROR:', err);
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
          console.log('[Init] Proactive getSession — restoring:', session.user.email);
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
              console.log('[onAuthStateChange] SIGNED_OUT — clearing all state');
              lastDbResolvedRoleRef.current = null;
              signInCooldownRef.current = 0;
              authProcessingRef.current = false;
              setUser(null);
              setUserProfile(null);
              setFavorites([]);
              setRedemptions([]);
              setAuthLoading(false);
              break;
            }

            case 'SIGNED_IN': {
              if (!session?.user) {
                console.warn('[onAuthStateChange] SIGNED_IN but no session.user');
                setAuthLoading(false);
                break;
              }
              console.log('[onAuthStateChange] SIGNED_IN for:', session.user.email);
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
                console.log(`[onAuthStateChange] TOKEN_REFRESHED SKIPPED — within ${msSinceSignIn}ms of SIGNED_IN cooldown`);
                setAuthLoading(false);
                break;
              }
              console.log('[onAuthStateChange] TOKEN_REFRESHED for:', session.user.email);
              await handleAuthenticatedUser(session.user, false);
              break;
            }

            case 'INITIAL_SESSION': {
              if (sessionProcessedRef.current) {
                console.log('[onAuthStateChange] INITIAL_SESSION — already processed by proactive getSession');
                setAuthLoading(false);
                break;
              }
              if (session?.user) {
                console.log('[onAuthStateChange] INITIAL_SESSION — restoring:', session.user.email);
                sessionProcessedRef.current = true;
                await handleAuthenticatedUser(session.user, false);
              } else {
                console.log('[onAuthStateChange] INITIAL_SESSION — no session');
                sessionProcessedRef.current = true;
                setAuthLoading(false);
              }
              break;
            }

            default: {
              console.log('[onAuthStateChange] Unhandled event:', event);
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
        console.log('[Init] Session not yet processed — retrying getSession');
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            console.log('[Init] Found existing session for:', session.user.email);
            sessionProcessedRef.current = true;
            await handleAuthenticatedUser(session.user, false);
          } else {
            console.log('[Init] No existing session');
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

    // SAFETY NET: Force authLoading off after 6 seconds (fail-fast)
    const safetyTimer = setTimeout(() => {
      setAuthLoading(prev => {
        if (prev) {
          console.warn('[Safety] authLoading still true after 6s — forcing false');
          return false;
        }
        return prev;
      });
    }, 6000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(fallbackTimer);
      clearTimeout(safetyTimer);
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

  // Realtime subscriptions for businesses
  useEffect(() => {
    const channel = supabase
      .channel('realtime-businesses')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'businesses' }, (payload) => {
        const b = payload.new as any;
        const newBiz: Business = {
          id: b.id,
          name: b.name,
          category: b.category,
          description: b.description,
          descriptionFr: b.description_fr || b.description,
          descriptionBi: b.description_bi || b.description,
          image: getBusinessImageUrl(b.image_url || b.image, SUPABASE_URL),
          rating: Number(b.rating) || 0,
          reviewCount: b.review_count || 0,
          discount: b.deal || b.discount || '',
          originalPrice: Number(b.original_price) || 0,
          dealPrice: Number(b.discounted_price ?? b.deal_price) || 0,
          location: b.location || '',
          lat: Number(b.lat) || 0,
          lng: Number(b.lng) || 0,
          mapUrl: b.map_url || null,
          map_url: b.map_url || null,
          website: b.website || null,
          hours: b.opening_hours || b.hours || '',
          phone: b.phone || '',
          contactEmail: b.email || b.contact_email || b.business_email || null,
          whatsappNumber: b.whatsapp_number || null,
          tags: b.tags || [],
          featured: b.featured || false,
          ownerId: b.owner_id || null,
          superStarCount: Number(b.super_star_count) || 0,
          pricingTiers: b.pricing_tiers ?? null,
        };
        setDbBusinesses(prev => {
          if (prev.some(existing => existing.id === newBiz.id)) return prev;
          return [newBiz, ...prev];
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
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
    console.log('[signIn] Attempting sign in for:', email);
    setAuthLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      console.error('[signIn] Error:', error.message);
      setAuthLoading(false);
      toast.error(error.message || 'Sign in failed');
      throw error;
    }

    console.log('[signIn] signInWithPassword succeeded — onAuthStateChange will handle the rest');
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
    console.log('[signUp] START — email:', email, 'type:', type);
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

    console.log('[signUp] Auth user created:', authUser.id, 'hasSession:', hasSession);

    // ─── Step 2: Ensure profile has all columns populated ───
    const isAdmin = ADMIN_EMAILS.includes(email.toLowerCase());
    const effectiveType = isAdmin ? 'admin' : type;

    if (hasSession) {
      // We have a session (JWT), so we can write to the DB via RLS
      console.log('[signUp] Inserting/updating profile — userType:', effectiveType);

      const result = await directProfileInsert({
        userId: authUser.id,
        name: name,
        email: email,
        userType: effectiveType as 'tourist' | 'business' | 'admin',
      });

      if (result.success) {
        console.log('[signUp] Profile ready — name:', result.profile?.name, 'user_type:', result.profile?.user_type);
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
      console.log('[signUp] No session — email confirmation required');
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
    console.log('[signOut] Signing out...');
    lastDbResolvedRoleRef.current = null;
    signInCooldownRef.current = 0;
    authProcessingRef.current = false;
    setUser(null);
    setUserProfile(null);
    setFavorites([]);
    setRedemptions([]);
    setCart(null);
    setCurrentView('home');
    setSidebarOpen(false);

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
  const purchasePass = useCallback(async (passType: 'daily' | 'weekly' | 'monthly' | 'mega_group') => {
    if (!user) {
      setShowAuth(true);
      setAuthMode('signup-tourist');
      return;
    }
    if (user.pass === passType) {
      toast.info('You already have this pass active!');
      return;
    }
    const prices = { daily: 15, weekly: 45, monthly: 99, mega_group: 199 };
    setCart({ passType, price: prices[passType] });
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
        setUser(prev => prev && prev.id === user.id
          ? {
            ...prev,
            superstarCredits: profile.superstar_credits ?? 0,
            shareBonusUnlocked: (profile as any).share_bonus_unlocked ?? false,
          }
          : prev);
      }
    } catch (err) {
      console.error('refreshUserProfile failed:', err);
    }
  }, [user?.id]);

  // ═══════════════════════════════════════════════════════════
  // SUBMIT REVIEW — Direct insert or RPC for Superstar
  // ═══════════════════════════════════════════════════════════
  const submitReview = useCallback(async (businessId: string, rating: number, comment: string, isSuperStar = false) => {
    if (!user) {
      setShowAuth(true);
      return;
    }
    try {
      if (isSuperStar || rating === 6) {
        // Superstar: use RPC (atomic decrement credit + insert)
        const { error } = await supabase.rpc('submit_superstar_review', {
          p_business_id: businessId,
          p_user_name: user.name,
          p_comment: comment,
        });
        if (error) throw error;
      } else {
        // Standard 1-5: direct insert
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

      // Reload from DB instead of optimistic merge — avoids double cards when realtime
      // fires with a slightly different payload shape than the client-built row.
      await loadReviews();

      // Refresh superstar credits after using one
      if (isSuperStar || rating === 6) {
        refreshUserProfile();
      }

      toast.success('Review submitted! Thank you.');
    } catch (err: any) {
      console.error('Submit review error:', err);
      toast.error(err.message || 'Failed to submit review');
      throw err;
    }
  }, [user, refreshUserProfile, loadReviews]);

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
        dbBusinesses, dbReviews, submitReview, dataLoaded,
        refreshBusinesses,
        refreshUserPass,
        refreshRedemptions,
        refreshUserProfile,
        userLocation, locationLoading, locationError,
        requestUserLocation, getDistanceTo,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};
