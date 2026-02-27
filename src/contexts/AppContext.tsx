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
  setSelectedBusiness: (b: Business | null) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>('en');
  const [currentView, setCurrentView] = useState<ViewMode>('home');
  const [user, setUser] = useState<User | null>(null);
  const [userPass, setUserPass] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [redemptions, setRedemptions] = useState<any[]>([]);
  const [dbBusinesses, setDbBusinesses] = useState<Business[]>([]);
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  const [showQR, setShowQR] = useState<string | null>(null);

  const loadUserPass = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('user_passes')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();
    if (!error && data) setUserPass(data);
  }, []);

  const loadUserProfile = useCallback(async (userId: string) => {
    const { data } = await supabase.from('profiles').select('*').eq('user_id', userId).single();
    if (data) {
      setUserProfile(data);
      setUser({ id: userId, email: data.email || '', role: data.role });
      await loadUserPass(userId);
    }
    setAuthLoading(false);
  }, [loadUserPass]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) loadUserProfile(session.user.id);
      else setAuthLoading(false);
    });
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
      language, setLanguage, currentView, setCurrentView, user, userPass, 
      userProfile, authLoading, signIn, signOut, favorites, 
      toggleFavorite: (id) => setFavorites(prev => prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]),
      showQR, setShowQR, refreshUserPass, redemptions, dbBusinesses, selectedBusiness, setSelectedBusiness
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) throw new Error('useAppContext must be used within an AppProvider');
  return context;
};
