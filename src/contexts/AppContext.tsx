import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Language } from '@/data/translations';
import { Business } from '@/data/businesses';
import { supabase, directProfileInsert } from '@/lib/supabase';

import { GeoPosition, haversineDistance } from '@/hooks/useGeolocation';
import { errorLogger } from '@/lib/errorLogger';

const ADMIN_EMAILS = ['admin@stikmnek.com'];

export type ViewMode = 'home' | 'deals' | 'map' | 'passes' | 'dashboard' | 'admin' | 'business-detail' | 'checkout' | 'payment-confirmation' | 'business-dashboard' | 'help';

export type PassType = 'daily' | 'weekly' | 'monthly' | null;

export interface UserProfile {
  id: string;
  user_id: string;
  name: string | null;
  full_name: string | null;
  display_name: string | null;
  email: string | null;
  role: 'tourist' | 'business' | 'admin' | null;
  user_type: string | null;
  avatar_url: string | null;
  business_id: string | null;
}

interface User {
  id: string;
  email: string;
  role: 'tourist' | 'business' | 'admin';
  pass?: PassType;
  passId?: string;
  passExpiry?: string;
  passValidFrom?: string | null;
  passValidUntil?: string | null;
}

interface Redemption {
  id: string;
  businessId: string;
  date: string;
  saved: number;
}

interface AppContextType {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  language: Language;
  setLanguage: (lang: Language) => void;
  currentView: ViewMode;
  setCurrentView: (view: ViewMode) => void;
  user: User | null;
  userPass: any; // Added to interface
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
  redemptions: Redemption[];
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
  const [userPass, setUserPass] = useState<any>(null); // State declared here
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [cart, setCart] = useState<any>(null);
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [showQR, setShowQR] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [dbBusinesses, setDbBusinesses] = useState<Business[]>([]);
  const [dbReviews, setDbReviews] = useState<any[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [userLocation, setUserLocation] = useState<GeoPosition | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);

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
      
      if (data) {
        setUserPass(data);
        setUser(prev => prev ? {
          ...prev,
          pass: data.pass_type as PassType,
          passId: data.id,
          passExpiry: data.valid_until,
          passValidFrom: data.valid_from,
          passValidUntil: data.valid_until,
        } : null);
      } else {
        setUserPass(null);
      }
    } catch (err) {
      console.error('Failed to load pass:', err);
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
        
        setUser(prev => prev ? {
          ...prev,
          role: role as 'tourist' | 'business' | 'admin'
        } : {
          id: userId,
          email: data.email || '',
          role: role as 'tourist' | 'business' | 'admin'
        });
        
        await loadUserPass(userId);
      }
    } catch (err) {
      console.error('Profile load error:', err);
    }
  }, [loadUserPass]);

  useEffect(() => {
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        await loadUserProfile(session.user.id);
      }
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
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [loadUserProfile]);

  const signIn = async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) throw error;
    toast.success('Check your email for the login link!');
  };

  const signUp = async (email: string, role: 'tourist' | 'business') => {
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) throw error;
    toast.success('Verification link sent!');
  };

  const signUpTourist = async (email: string, fullName: string) => {
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) throw error;
    toast.success('Login link sent to your email!');
  };

  const signUpBusiness = async (email: string, businessName: string) => {
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) throw error;
    toast.success('Registration link sent!');
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setUserProfile(null);
    setUserPass(null);
    setCurrentView('home');
    toast.success('Signed out successfully');
  };

  const updateProfile = async (updates: Partial<UserProfile>) => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update(updates)
        .eq('user_id', user.id);

      if (error) throw error;
      setUserProfile(prev => prev ? { ...
