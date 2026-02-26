import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { Language } from '@/data/translations';
import { Business } from '@/data/businesses';
import { supabase, directProfileInsert } from '@/lib/supabase';
import { haversineDistance, GeoPosition } from '@/hooks/useGeolocation';

const ADMIN_EMAILS = ['admin@stikmnek.com'];

export type ViewMode = 'home' | 'deals' | 'map' | 'passes' | 'dashboard' | 'admin' | 'business-detail' | 'checkout' | 'payment-confirmation' | 'business-dashboard' | 'help';
export type PassType = 'daily' | 'weekly' | 'monthly' | null;

export interface UserProfile {
  id: string;
  user_id: string;
  name: string | null;
  full_name: string | null;
  email: string | null;
  role: 'tourist' | 'business' | 'admin' | null;
  avatar_url: string | null;
  business_id: string | null;
}

interface User {
  id: string;
  email: string;
  role: 'tourist' | 'business' | 'admin';
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
  signUp: (email: string, role: 'tourist' | 'business') => Promise<void>;
  signUpTourist: (email: string, fullName: string) => Promise<void>;
  signUpBusiness: (email: string, businessName: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  favorites: string[];
  toggleFavorite: (id: string) => void;
  cart: any;
  setCart: (cart: any) => void;
  purchasePass: (type: PassType) => Promise<void>;
  selectedBusiness: Business | null;
  setSelectedBusiness: (biz: Business | null) => void;
  showAuth: boolean;
  setShowAuth: (show: boolean) => void;
  authMode: 'login' | 'signup';
  setAuthMode: (mode: 'login' | 'signup') => void;
  showQR: boolean;
  setShowQR: (show: boolean) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  selectedCategory: string;
  setSelectedCategory: (cat: string) => void;
  redemptions: any[];
  dbBusinesses: Business[];
  dbReviews: any[];
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

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [language, setLanguage] = useState<Language>('en');
  const [currentView, setCurrentView] = useState<ViewMode>('home');
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [userPass, setUserPass] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [cart, setCart] = useState<any>(null);
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [showQR, setShowQR] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [redemptions, setRedemptions] = useState<any[]>([]);
  const [dbBusinesses, setDbBusinesses] = useState<Business[]>([]);
  const [dbReviews, setDbReviews] = useState<any[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [userLocation, setUserLocation] = useState<GeoPosition | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const loadUserPass = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_passes')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      setUserPass(data || null);
    } catch (err) {
      console.error('Pass load error:', err);
    }
  }, []);

  const loadUserProfile = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setUserProfile(data);
        const role = ADMIN_EMAILS.includes(data.email || '') ? 'admin' : (data.role || 'tourist');
        setUser({ id: userId, email: data.email || '', role: role as any });
        await loadUserPass(userId);
      }
    } catch (err) {
      console.error('Profile load error:', err);
    }
  }, [loadUserPass]);

  useEffect(() => {
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) await loadUserProfile(session.user.id);
      setAuthLoading(false);
    };
    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        await loadUserProfile(session.user.id);
      } else {
        setUser(null);
        setUserProfile(null);
        setUserPass(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadUserProfile]);

  const signIn = async (email: string) => {
    try {
      setAuthLoading(true);
      const { error } = await supabase.auth.signInWithOtp({ email });
      if (error) throw error;
      
      const { data: profile } = await supabase.from('user_profiles').select('*').eq('email', email).maybeSingle();
      if (profile) {
        await loadUserProfile(profile.user_id);
        setCurrentView('dashboard');
        toast.success('Signed in successfully');
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const signUpTourist = async (email: string, fullName: string) => {
    try {
      setAuthLoading(true);
      const { error } = await supabase.auth.signInWithOtp({ email });
      if (error) throw error;
      await directProfileInsert(email, fullName, 'tourist');
      toast.success('Account created!');
      setAuthMode('login');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setUserProfile(null);
    setUserPass(null);
    setCurrentView('home');
    toast.success('Signed out');
  };

  const toggleSidebar = () => setSidebarOpen(prev => !prev);
  const toggleFavorite = (id: string) => setFavorites(prev => prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]);
  const purchasePass = async (type: PassType) => { if (user) setCurrentView('checkout'); else setShowAuth(true); };
  
  const refreshUserPass = useCallback(async () => {
    if (user?.id) await loadUserPass(user.id);
  }, [user, loadUserPass]);

  const signUp = async (e: string, r: any) => { /* signUp logic */ };
  const signUpBusiness = async (e: string, b: string) => { /* business logic */ };
  const updateProfile = async (u: any) => { /* update logic */ };
  const refreshBusinesses = async () => { /* refresh logic */ };
  const submitReview = async (b: any, r: any, c: any) => { /* review logic */ };
  const requestUserLocation = () => { /* location logic */ };
  const getDistanceTo = (lat: number, lng: number) => null;

  return (
    <AppContext.Provider
      value={{
        sidebarOpen, toggleSidebar, language, setLanguage,
        currentView, setCurrentView, user, userPass, userProfile, authLoading,
        signIn, signUp, signUpTourist, signUpBusiness, signOut, updateProfile,
        favorites, toggleFavorite, cart, setCart, purchasePass,
        selectedBusiness, setSelectedBusiness, showAuth, setShowAuth,
        authMode, setAuthMode, showQR, setShowQR, searchQuery, setSearchQuery,
        selectedCategory, setSelectedCategory, redemptions,
        dbBusinesses, dbReviews, submitReview, dataLoaded,
        refreshBusinesses, refreshUserPass, userLocation, locationLoading,
        locationError, requestUserLocation, getDistanceTo
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within AppProvider');
  return context;
};
