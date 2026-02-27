import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Language } from '@/data/translations';
import { Business } from '@/data/businesses';
import { supabase, directProfileInsert } from '@/lib/supabase';
import { GeoPosition, haversineDistance } from '@/hooks/useGeolocation';
import { errorLogger } from '@/lib/errorLogger';

const ADMIN_EMAILS = ['admin@stikmnek.com', 'nzboardtours@yahoo.com'];

export type ViewMode = 'home' | 'deals' | 'map' | 'passes' | 'dashboard' | 'admin' | 'business-detail' | 'checkout' | 'payment-confirmation' | 'business-dashboard' | 'help';
export type PassType = 'daily' | 'weekly' | 'monthly' | null;
export type UserRole = 'tourist' | 'business' | 'admin';

export interface UserProfile {
  id: string;
  user_id: string;
  name: string | null;
  full_name: string | null;
  email: string | null;
  role: UserRole;
  avatar_url: string | null;
  pass_type: PassType;
  pass_expiry: string | null;
}

interface AppContextType {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  language: Language;
  setLanguage: (lang: Language) => void;
  currentView: ViewMode;
  setCurrentView: (view: ViewMode) => void;
  user: any;
  userProfile: UserProfile | null;
  authLoading: boolean;
  signIn: (email: string, pass: string) => Promise<void>;
  signOut: () => Promise<void>;
  favorites: string[];
  toggleFavorite: (id: string) => void;
  redemptions: any[];
  dbBusinesses: Business[];
  dataLoaded: boolean;
  [key: string]: any;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [language, setLanguage] = useState<Language>('en');
  const [currentView, setCurrentView] = useState<ViewMode>('home');
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [redemptions, setRedemptions] = useState<any[]>([]);
  const [dbBusinesses, setDbBusinesses] = useState<Business[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);

  const resolveRole = useCallback(async (userId: string, email: string): Promise<UserRole> => {
    console.log('[resolveRole] Checking role for:', email);
    if (ADMIN_EMAILS.includes(email.toLowerCase())) return 'admin';

    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;
      return (data?.role as UserRole) || 'tourist';
    } catch (err) {
      console.error('[resolveRole] Fallback to tourist:', err);
      return 'tourist';
    }
  }, []);

  const handleAuthenticatedUser = useCallback(async (sessionUser: any) => {
    setAuthLoading(true);
    try {
      const role = await resolveRole(sessionUser.id, sessionUser.email);
      setUser(sessionUser);
      setUserProfile({
        id: sessionUser.id,
        user_id: sessionUser.id,
        email: sessionUser.email,
        role: role,
        name: null,
        full_name: null,
        avatar_url: null,
        pass_type: null,
        pass_expiry: null
      });
    } catch (err) {
      console.error('[handleAuthenticatedUser] Error:', err);
    } finally {
      // CRITICAL: This line stops the spinning "hang" no matter what
      setAuthLoading(false);
    }
  }, [resolveRole]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        handleAuthenticatedUser(session.user);
      } else {
        setAuthLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        handleAuthenticatedUser(session.user);
      } else {
        setUser(null);
        setUserProfile(null);
        setAuthLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [handleAuthenticatedUser]);

  const signIn = async (email: string, pass: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (error) throw error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setCurrentView('home');
    toast.success('Signed out');
  };

  const toggleFavorite = (id: string) => {
    setFavorites(prev => prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]);
  };

  // Dummy functions to match your previous context signature if needed
  const loadBusinesses = useCallback(async () => { setDataLoaded(true); }, []);

  return (
    <AppContext.Provider value={{
      sidebarOpen, toggleSidebar,
      language, setLanguage,
      currentView, setCurrentView,
      user, userProfile, authLoading,
      signIn, signOut,
      favorites, toggleFavorite,
      redemptions, dbBusinesses, dataLoaded,
      refreshBusinesses: loadBusinesses
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within AppProvider');
  return context;
};