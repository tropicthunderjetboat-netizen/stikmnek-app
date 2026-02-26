import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Language } from '@/data/translations';
import { Business } from '@/data/businesses';
import { supabase, directProfileInsert } from '@/lib/supabase';
import { GeoPosition, haversineDistance } from '@/hooks/useGeolocation';

const ADMIN_EMAILS = ['admin@stikmnek.com'];

export type ViewMode = 'home' | 'deals' | 'map' | 'passes' | 'dashboard' | 'admin' | 'business-detail' | 'checkout' | 'payment-confirmation' | 'business-dashboard' | 'help';
export type PassType = 'daily' | 'weekly' | 'monthly' | null;

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
  userPass: any;
  userProfile: UserProfile | null;
  authLoading: boolean;
  signIn: (email: string) => Promise<void>;
  signUp: (name: string, email: string, type: 'tourist' | 'business') => Promise<void>;
  signUpTourist: (name: string, email: string) => Promise<void>;
  signUpBusiness: (name: string, email: string) => Promise<void>;
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
  const [userPass, setUserPass] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [user, setUser] = useState<User | null>(null);
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

  // Helper extraction logic
  const extractRole = (profile: any): 'tourist' | 'business' | 'admin' => {
    const raw = profile.user_type || profile.role;
    if (raw === 'admin' || raw === 'business' || raw === 'tourist') return raw;
    return 'tourist';
  };

  const extractName = (profile: any, fallbackEmail?: string): string => {
    return profile.name || profile.full_name || profile.display_name || fallbackEmail?.split('@')[0] || 'User';
  };

  const loadUserPass = useCallback(async (userId: string) => {
    try {
      const { data } = await supabase
        .from('user_passes')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) setUserPass(data);
    } catch (err) { console.error('Pass load failed:', err); }
  }, []);

  const loadUserData = useCallback((userId: string) => {
    loadUserPass(userId);
    // Add other user-specific data loads here (favorites, redemptions)
  }, [loadUserPass]);

  const resolveRole = useCallback(async (userId: string, email: string, metadata?: Record<string, any>) => {
    const isAdmin = ADMIN_EMAILS.includes(email.toLowerCase());
    let profile: UserProfile | null = null;
    try {
      const { data } = await supabase.from('user_profiles').select('*').eq('user_id', userId).maybeSingle();
      if (data) profile = data as UserProfile;
    } catch (err) { console.error('Role resolution DB error:', err); }

    let finalRole: 'tourist' | 'business' | 'admin' = isAdmin ? 'admin' : (profile ? extractRole(profile) : (metadata?.user_type || 'tourist'));
    return { role: finalRole, profile };
  }, []);

  const buildUser = useCallback((authUser: any, role: 'tourist' | 'business' | 'admin', profile?: UserProfile | null): User => {
    return {
      id: authUser.id,
      name: profile ? extractName(profile, authUser.email) : (authUser.user_metadata?.name || authUser.email?.split('@')[0]),
      email: authUser.email || '',
      type: role,
      pass: null, passId: null, passExpiry: null, passValidFrom: null, passValidUntil: null
    };
  }, []);

  const handleAuthenticatedUser = useCallback(async (authUser: any, isSignInEvent: boolean) => {
    if (authProcessingRef.current && !isSignInEvent) return;
    authProcessingRef.current = true;

    try {
      const { role, profile } = await resolveRole(authUser.id, authUser.email || '', authUser.user_metadata);
      
      if (!profile && isSignInEvent) {
        await directProfileInsert({
          userId: authUser.id,
          name: authUser.user_metadata?.name || authUser.email?.split('@')[0],
          email: authUser.email || '',
          userType: role
        });
      }

      setUser(buildUser(authUser, role, profile));
      setUserProfile(profile);
      loadUserData(authUser.id);

      if (isSignInEvent) {
        setShowAuth(false);
        if (role === 'admin') setCurrentView('admin');
        else if (role === 'business') setCurrentView('business-dashboard');
        else setCurrentView('dashboard');
        toast.success('Successfully logged in!');
      }
    } finally {
      authProcessingRef.current = false;
      setAuthLoading(false);
    }
  }, [resolveRole, buildUser, loadUserData]);

  useEffect(() => {
    // Initial Session Check
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) handleAuthenticatedUser(session.user, false);
      else setAuthLoading(false);
      sessionProcessedRef.current = true;
    });

    // Auth Change Listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        handleAuthenticatedUser(session.user, true);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setUserProfile(null);
        setUserPass(null);
        setAuthLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [handleAuthenticatedUser]);

  const signIn = async (email: string) => {
    setAuthLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ 
      email, 
      options: { emailRedirectTo: window.location.origin } 
    });
    if (error) { toast.error(error.message); setAuthLoading(false); }
    else toast.success('Magic link sent to your email!');
  };

  const signUp = async (name: string, email: string, type: 'tourist' | 'business') => {
    setAuthLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ 
      email, 
      options: { 
        emailRedirectTo: window.location.origin,
        data: { name, user_type: type }
      } 
    });
    if (error) { toast.error(error.message); setAuthLoading(false); }
    else toast.success('Check your email to confirm signup!');
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setCurrentView('home');
    window.location.reload();
  };

  // Placeholders for remaining interface methods
  const signUpTourist = (n: string, e: string) => signUp(n, e, 'tourist');
  const signUpBusiness = (n: string, e: string) => signUp(n, e, 'business');
  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);
  const setLanguageWrapper = (l: Language) => setLanguage(l);
  const updateProfile = async (u: any) => {};
  const toggleFavorite = (id: string) => {};
  const purchasePass = (t: any) => setCurrentView('checkout');
  const submitReview = async (b: string, r: number, c: string) => {};
  const refreshBusinesses = async () => {};
  const refreshUserPass = async () => { if (user) loadUserPass(user.id); };
  const requestUserLocation = () => {};
  const getDistanceTo = (lat: number, lng: number) => null;

  return (
    <AppContext.Provider value={{
      sidebarOpen, toggleSidebar, language, setLanguage: setLanguageWrapper,
      currentView, setCurrentView, user, userPass, userProfile, authLoading,
      signIn, signUp, signUpTourist, signUpBusiness, signOut, updateProfile,
      favorites, toggleFavorite, cart, setCart, purchasePass,
      selectedBusiness, setSelectedBusiness, showAuth, setShowAuth,
      authMode, setAuthMode, showQR, setShowQR, searchQuery, setSearchQuery,
      selectedCategory, setSelectedCategory, redemptions,
      dbBusinesses, dbReviews, submitReview, dataLoaded,
      refreshBusinesses, refreshUserPass, userLocation, locationLoading,
      locationError, requestUserLocation, getDistanceTo
    }}>
      {children}
    </AppContext.Provider>
  );
};
