import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Language } from '@/data/translations';
import { Business } from '@/data/businesses';
import { supabase, directProfileInsert } from '@/lib/supabase';

import { GeoPosition, haversineDistance } from '@/hooks/useGeolocation';
import { errorLogger } from '@/lib/errorLogger';


// ═══════════════════════════════════════════════════════════════
// ADMIN EMAILS: These always get 'admin' role regardless of DB
// ═══════════════════════════════════════════════════════════════
const ADMIN_EMAILS = ['admin@stikmnek.com'];

export type ViewMode = 'home' | 'deals' | 'map' | 'passes' | 'dashboard' | 'admin' | 'business-detail' | 'checkout' | 'payment-confirmation' | 'business-dashboard' | 'help';

export type PassType = 'daily' | 'weekly' | 'monthly' | null;

// ═══════════════════════════════════════════════════════════════
// UserProfile — matches the ACTUAL user_profiles table columns
// ═══════════════════════════════════════════════════════════════
export interface UserProfile {
  id: string;
  user_id: string;
  name: string | null;
  full_name: string | null;
  user_type: string | null;
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
}

export interface CartItem {
  passType: 'daily' | 'weekly' | 'monthly';
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
  purchasePass: (passType: 'daily' | 'weekly' | 'monthly') => void;
  selectedBusiness: Business | null;
  setSelectedBusiness: (biz: Business | null) => void;
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
  submitReview: (businessId: string, rating: number, comment: string) => Promise<void>;
  dataLoaded: boolean;
  refreshBusinesses: () => Promise<void>;
  refreshUserPass: () => Promise<void>;
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
  const [userLocation, setUserLocation] = useState<GeoPosition | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const sessionProcessedRef = useRef(false);
  const lastDbResolvedRoleRef = useRef<'tourist' | 'business' | 'admin' | null>(null);
  const signInCooldownRef = useRef<number>(0);
  const authProcessingRef = useRef<boolean>(false);

  // GEOLOCATION
  const requestUserLocation = useCallback(() => {
    if (!navigator.geolocation) { setLocationError('Geolocation not supported'); return; }
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, timestamp: pos.timestamp }); setLocationLoading(false); },
      (err) => { setLocationLoading(false); setLocationError(err.message); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  const getDistanceTo = useCallback((lat: number, lng: number): number | null => {
    if (!userLocation) return null;
    return haversineDistance(userLocation.lat, userLocation.lng, lat, lng);
  }, [userLocation]);

  // DATA LOADING
  const loadBusinesses = useCallback(async () => {
    const { data } = await supabase.from('businesses').select('*').order('featured', { ascending: false });
    if (data) {
        setDbBusinesses(data.map((b: any) => ({ ...b, rating: Number(b.rating) || 0 })) as any);
        setDataLoaded(true);
    }
  }, []);

  const loadReviews = useCallback(async () => {
    const { data } = await supabase.from('reviews').select('*').order('created_at', { ascending: false });
    if (data) setDbReviews(data as any);
  }, []);

  const loadUserData = useCallback((userId: string) => {
    supabase.from('favorites').select('business_id').eq('user_id', userId).then(({ data }) => { if (data) setFavorites(data.map(f => f.business_id)); });
    supabase.from('passes').select('*').eq('user_id', userId).eq('active', true).limit(1).then(({ data }) => {
       if (data && data[0]) {
         const p = data[0];
         setUser(prev => prev ? { ...prev, pass: p.pass_type as PassType, passId: p.id, passExpiry: p.expires_at } : null);
       }
    });
  }, []);

  const resolveRole = useCallback(async (userId: string, email: string, metadata?: any) => {
    const isAdmin = ADMIN_EMAILS.includes(email.toLowerCase());
    const { data: profile } = await supabase.from('user_profiles').select('*').eq('user_id', userId).maybeSingle();
    let finalRole: 'tourist' | 'business' | 'admin' = profile?.user_type || profile?.role || (metadata?.user_type) || 'tourist';
    if (isAdmin) finalRole = 'admin';
    if (profile) setUserProfile(profile as UserProfile);
    return { role: finalRole, profile: profile as UserProfile };
  }, []);

  const handleAuthenticatedUser = useCallback(async (authUser: any, shouldRedirect: boolean) => {
    if (authProcessingRef.current && !shouldRedirect) { setAuthLoading(false); return; }
    authProcessingRef.current = true;
    setAuthLoading(true);
    try {
      const { role, profile } = await resolveRole(authUser.id, authUser.email, authUser.user_metadata);
      if (!profile) {
        await directProfileInsert({ userId: authUser.id, name: authUser.user_metadata?.name || authUser.email.split('@')[0], email: authUser.email, userType: role });
      }
      setUser({ id: authUser.id, name: profile?.name || authUser.user_metadata?.name || authUser.email.split('@')[0], email: authUser.email, type: role } as any);
      loadUserData(authUser.id);
      if (shouldRedirect) setCurrentView(role === 'admin' ? 'admin' : role === 'business' ? 'business-dashboard' : 'dashboard');
    } finally {
      authProcessingRef.current = false;
      setAuthLoading(false);
    }
  }, [resolveRole, loadUserData]);

  useEffect(() => {
    loadBusinesses();
    loadReviews();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') { setUser(null); setUserProfile(null); setAuthLoading(false); }
      else if (session?.user) await handleAuthenticatedUser(session.user, event === 'SIGNED_IN');
      else setAuthLoading(false);
    });
    const safetyTimer = setTimeout(() => setAuthLoading(false), 10000);
    return () => { subscription.unsubscribe(); clearTimeout(safetyTimer); };
  }, [loadBusinesses, loadReviews, handleAuthenticatedUser]);

  // REALTIME
  useEffect(() => {
    const channel = supabase.channel('realtime').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reviews' }, (payload) => {
        setDbReviews(prev => [payload.new as any, ...prev]);
    }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const toggleSidebar = () => setSidebarOpen(prev => !prev);

  // FIX: Added finally block to prevent hang
  const signIn = useCallback(async (email: string, password: string) => {
    setAuthLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } finally {
      setAuthLoading(false); 
    }
  }, []);

  const signUp = useCallback(async (name: string, email: string, password: string, type: 'tourist' | 'business') => {
    setAuthLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { name, user_type: type } } });
      if (error) throw error;
      if (data.session) await directProfileInsert({ userId: data.user!.id, name, email, userType: type });
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => { await supabase.auth.signOut(); setCurrentView('home'); }, []);
  const updateProfile = useCallback(async (u: any) => { await supabase.from('user_profiles').update(u).eq('user_id', user?.id); }, [user]);
  
  const toggleFavorite = useCallback(async (id: string) => {
    if (!user) return setShowAuth(true);
    const isFav = favorites.includes(id);
    setFavorites(prev => isFav ? prev.filter(f => f !== id) : [...prev, id]);
    isFav ? await supabase.from('favorites').delete().eq('user_id', user.id).eq('business_id', id) : await supabase.from('favorites').insert({ user_id: user.id, business_id: id });
  }, [user, favorites]);

  const purchasePass = useCallback((type: any) => { setCart({ passType: type, price: 0 }); setCurrentView('checkout'); }, []);
  const submitReview = useCallback(async (bizId: string, rating: number, comment: string) => {
    await supabase.from('reviews').insert({ business_id: bizId, user_id: user?.id, rating, comment });
  }, [user]);

  return (
    <AppContext.Provider value={{
      sidebarOpen, toggleSidebar, language, setLanguage, currentView, setCurrentView,
      user, userProfile, authLoading, signIn, signUp, signUpTourist: (n,e,p)=>signUp(n,e,p,'tourist'),
      signUpBusiness: (n,e,p)=>signUp(n,e,p,'business'), signOut, updateProfile, favorites,
      toggleFavorite, cart, setCart, purchasePass, selectedBusiness, setSelectedBusiness,
      showAuth, setShowAuth, authMode, setAuthMode, showQR, setShowQR, searchQuery, setSearchQuery,
      selectedCategory, setSelectedCategory, redemptions, dbBusinesses, dbReviews, submitReview,
      dataLoaded, refreshBusinesses: loadBusinesses, refreshUserPass: ()=>Promise.resolve(),
      userLocation, locationLoading, locationError, requestUserLocation, getDistanceTo
    }}>
      {children}
    </AppContext.Provider>
  );
};