import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { Language } from '@/data/translations';
import { Business } from '@/data/businesses';
import { supabase } from '@/lib/supabase';

export type ViewMode = 'home' | 'deals' | 'map' | 'passes' | 'dashboard' | 'admin' | 'business-detail' | 'checkout' | 'business-dashboard';

export interface UserProfile {
  id: string;
  user_id: string;
  name: string | null;
  email: string | null;
  role: 'tourist' | 'business' | 'admin';
}

interface User {
  id: string;
  email: string;
  role: 'tourist' | 'business' | 'admin';
}

interface AppContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  currentView: ViewMode;
  setCurrentView: (view: ViewMode) => void;
  user: User | null;
  userPass: any;
  userProfile: UserProfile | null;
  authLoading: boolean;
  signIn: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  favorites: string[];
  toggleFavorite: (id: string) => void;
  showQR: string | null;
  setShowQR: (id: string | null) => void;
  refreshUserPass: () => Promise<void>;
  redemptions: any[];
  dbBusinesses: Business[];
  selectedBusiness: Business | null;
  setSelectedBusiness: (business: Business | null) => void;
}

// 1. Define the default state explicitly
const defaultContext: AppContextType = {
  language: 'en',
  setLanguage: () => {},
  currentView: 'home',
  setCurrentView: () => {},
  user: null,
  userPass: null,
  userProfile: null,
  authLoading: true,
  signIn: async () => {},
  signOut: async () => {},
  favorites: [],
  toggleFavorite: () => {},
  showQR: null,
  setShowQR: () => {},
  refreshUserPass: async () => {},
  redemptions: [],
  dbBusinesses: [],
  selectedBusiness: null,
  setSelectedBusiness: () => {},
};

const AppContext = createContext<AppContextType>(defaultContext);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>('en');
  const [currentView, setCurrentView] = useState<ViewMode>('home');
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [userPass, setUserPass] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showQR, setShowQR] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [redemptions, setRedemptions] = useState<any[]>([]);
  const [dbBusinesses, setDbBusinesses] = useState<Business[]>([]);
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);

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
      setUserPass(data || null);
    } catch (e) { console.error(e); }
  }, []);

  const loadUserProfile = useCallback(async (userId: string) => {
    try {
      const { data } = await supabase.from('user_profiles').select('*').eq('user_id', userId).maybeSingle();
      if (data) {
        setUserProfile(data);
        setUser({ id: userId, email: data.email || '', role: data.role || 'tourist' });
        await loadUserPass(userId);
      }
    } catch (e) { console.error(e); }
  }, [loadUserPass]);

  useEffect(() => {
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) await loadUserProfile(session.user.id);
      setAuthLoading(false);
    };
    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        await loadUserProfile(session.user.id);
        if (event === 'SIGNED_IN') setCurrentView('dashboard');
      } else {
        setUser(null);
        setUserPass(null);
        setUserProfile(null);
      }
    });
    return () => subscription.unsubscribe();
  }, [loadUserProfile]);

  const signIn = async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
    if (error) toast.error(error.message);
    else toast.success('Check your email!');
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setCurrentView('home');
    window.location.reload();
  };

  const refreshUserPass = async () => {
    if (user?.id) await loadUserPass(user.id);
  };

  return (
    <AppContext.Provider value={{
      ...defaultContext, // Fallback base
      language, setLanguage, currentView, setCurrentView, user, userPass, 
      userProfile, authLoading, signIn, signOut, 
      favorites: favorites ?? [], 
      redemptions: redemptions ?? [], 
      dbBusinesses: dbBusinesses ?? [],
      toggleFavorite: (id) => setFavorites(prev => prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]),
      showQR, setShowQR, refreshUserPass, selectedBusiness, setSelectedBusiness
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => useContext(AppContext);
