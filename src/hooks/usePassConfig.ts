import { useState, useCallback, useEffect } from 'react';

export interface PassFeature {
  id: string;
  text: string;
  textFr: string;
  textBi: string;
}

export interface ShareBonus {
  extraDays: number;
  extraPeople: number;
  extraKids: number;
  description: string;
  descriptionFr: string;
  descriptionBi: string;
}

export interface PassConfig {
  id: string;
  type: 'daily' | 'weekly' | 'monthly';
  name: string;
  nameFr: string;
  nameBi: string;
  price: number;
  period: string;
  periodFr: string;
  periodBi: string;
  colorFrom: string;
  colorTo: string;
  shadowColor: string;
  icon: 'zap' | 'star' | 'crown';
  features: PassFeature[];
  popular: boolean;
  active: boolean;
  description: string;
  descriptionFr: string;
  descriptionBi: string;
  maxRedemptionsPerDay: number;
  sortOrder: number;
  // Group structure
  adults: number;
  kids: number;
  totalPeople: number | null; // null means use adults+kids, number means a flat total
  baseDays: number;
  fullDays: number; // days after share bonus
  shareBonus: ShareBonus;
}

// ─── Pass name helpers ───
export const PASS_NAMES: Record<string, { en: string; fr: string; bi: string; short: string }> = {
  daily: {
    en: 'Family Explorer Pass',
    fr: 'Pass Explorateur Familial',
    bi: 'Famili Eksplora Pas',
    short: 'Family Explorer',
  },
  weekly: {
    en: 'Extended Group Adventure Pass',
    fr: 'Pass Aventure Groupe Étendu',
    bi: 'Grup Advenija Pas',
    short: 'Group Adventure',
  },
  monthly: {
    en: 'Ultimate Crew Experience Pass',
    fr: 'Pass Expérience Ultime Équipe',
    bi: 'Ultimet Kru Eksperiens Pas',
    short: 'Crew Experience',
  },
};

export function getPassDisplayName(passType: string, language: 'en' | 'fr' | 'bi' = 'en'): string {
  const names = PASS_NAMES[passType];
  if (!names) return passType;
  return names[language] || names.en;
}

export function getPassShortName(passType: string): string {
  return PASS_NAMES[passType]?.short || passType;
}

const DEFAULT_PASSES: PassConfig[] = [
  {
    id: 'pass-daily',
    type: 'daily',
    name: 'Family Explorer Pass',
    nameFr: 'Pass Explorateur Familial',
    nameBi: 'Famili Eksplora Pas',
    price: 15,
    period: '/1 day',
    periodFr: '/1 jour',
    periodBi: '/1 dei',
    colorFrom: 'sky-500',
    colorTo: 'blue-600',
    shadowColor: 'sky-200',
    icon: 'zap',
    features: [
      { id: 'f1', text: 'Valid for 4 people', textFr: 'Valable pour 4 personnes', textBi: '4 man' },
      { id: 'f2', text: 'Access all deals for 1 day', textFr: 'Accès à toutes les offres pendant 1 jour', textBi: 'Akses olgeta dils blong 1 dei' },
      { id: 'f3', text: 'QR code coupons', textFr: 'Coupons QR code', textBi: 'QR kod kupons' },
      { id: 'f4', text: 'Map navigation', textFr: 'Navigation carte', textBi: 'Map navigesen' },
      { id: 'f5', text: 'Share app to add 2 more people', textFr: 'Partagez l\'app pour ajouter 2 personnes', textBi: 'Serem app blong ademap 2 moa man' },
    ],
    popular: false,
    active: true,
    description: 'Perfect for families exploring for a day',
    descriptionFr: 'Parfait pour les familles qui explorent pendant une journée',
    descriptionBi: 'Gud blong famili we i eksplor blong wan dei',
    maxRedemptionsPerDay: 5,
    sortOrder: 1,
    Adults: 0,
kids: 0,
      totalPeople: 4,
    baseDays: 1,
    fullDays: 1,
    shareBonus: {
      extraDays: 0,
      extraPeople: 2,
      extraKids: 0,
      description: 'Share the app to add 2 more people to your pass',
      descriptionFr: 'Partagez l\'application pour ajouter 2 personnes à votre pass',
      descriptionBi: 'Serem app blong ademap 2 moa man long pas blong yu',
    },
  },
  {
    id: 'pass-weekly',
    type: 'weekly',
    name: 'Extended Group Adventure Pass',
    nameFr: 'Pass Aventure Groupe Étendu',
    nameBi: 'Grup Advenija Pas',
    price: 45,
    period: '/6 days',
    periodFr: '/6 jours',
    periodBi: '/6 dei',
    colorFrom: 'teal-500',
    colorTo: 'emerald-600',
    shadowColor: 'teal-200',
    icon: 'star',
    features: [
      { id: 'f1', text: 'Valid for 4 people', textFr: 'Valable pour 4 personnes', textBi: '4 man' },
      { id: 'f2', text: '6 days of unlimited deals', textFr: '6 jours d\'offres illimitées', textBi: '6 dei blong dils we i no gat limit' },
      { id: 'f3', text: 'QR code coupons', textFr: 'Coupons QR code', textBi: 'QR kod kupons' },
      { id: 'f4', text: 'Map navigation', textFr: 'Navigation carte', textBi: 'Map navigesen' },
      { id: 'f7', text: 'Share app: +1 free day & +2 kids', textFr: 'Partagez: +1 jour gratuit et +2 enfants', textBi: 'Serem: +1 fri dei mo +2 pikinini' },
    ],

    popular: true,
    active: true,
    description: 'Best value for group adventures over 6 days',
    descriptionFr: 'Meilleur rapport qualité-prix pour les aventures de groupe sur 6 jours',
    descriptionBi: 'Beswan valu blong grup advenija blong 6 dei',
    maxRedemptionsPerDay: 10,
    sortOrder: 2,
    adults: 0,
kids: 0, 
    totalPeople: 4,
    baseDays: 6,
    fullDays: 7,
    shareBonus: {
      extraDays: 1,
      extraPeople: 0,
      extraKids: 2,
      description: 'Share the app to get 1 extra day free (7 total) and add 2 people',
      descriptionFr: 'Partagez l\'app pour obtenir 1 jour gratuit (7 au total) et ajouter 2 personnes',
      descriptionBi: 'Serem app blong kasem 1 fri dei (7 totol) mo ademap 2 moa man',
    },
  },
  {
    id: 'pass-monthly',
    type: 'monthly',
    name: 'Ultimate Crew Experience Pass',
    nameFr: 'Pass Expérience Ultime Équipe',
    nameBi: 'Ultimet Kru Eksperiens Pas',
    price: 99,

    period: '/6 days',
    periodFr: '/6 jours',
    periodBi: '/6 dei',
    colorFrom: 'orange-500',
    colorTo: 'amber-600',
    shadowColor: 'orange-200',
    icon: 'crown',
    features: [
      { id: 'f1', text: 'Valid for 7 people', textFr: 'Valable pour 7 personnes', textBi: '7 man' },
      { id: 'f2', text: '6 days of unlimited deals', textFr: '6 jours d\'offres illimitées', textBi: '6 dei blong dils we i no gat limit' },
      { id: 'f3', text: 'QR code coupons', textFr: 'Coupons QR code', textBi: 'QR kod kupons' },
      { id: 'f4', text: 'Map navigation', textFr: 'Navigation carte', textBi: 'Map navigesen' },
      { id: 'f8', text: 'Share app: +1 free day & +1 person', textFr: 'Partagez: +1 jour gratuit et +1 personne', textBi: 'Serem: +1 fri dei mo +1 man' },
    ],

    popular: false,
    active: true,
    description: 'Ultimate experience for crews of 7 over 6 days',
    descriptionFr: 'Expérience ultime pour des équipes de 7 sur 6 jours',
    descriptionBi: 'Ultimet eksperiens blong 7 man blong 6 dei',
    maxRedemptionsPerDay: 999,
    sortOrder: 3,
    people: 7,
        totalPeople: 7,
    baseDays: 6,
    fullDays: 7,
    shareBonus: {
      extraDays: 1,
      extraPeople: 1,
      extraKids: 0,
      description: 'Share the app to get 1 extra day free (7 total) and add 1 more person',
      descriptionFr: 'Partagez l\'app pour obtenir 1 jour gratuit (7 au total) et ajouter 1 personne',
      descriptionBi: 'Serem app blong kasem 1 fri dei (7 totol) mo ademap 1 moa man',
    },
  },
];

const STORAGE_KEY = 'stikmnek-pass-config';
const CONFIG_VERSION = 2; // Bump this when default features change
const VERSION_KEY = 'stikmnek-pass-config-version';

function loadFromStorage(): PassConfig[] {
  try {
    // If config version changed, reset to defaults to pick up feature changes
    const storedVersion = localStorage.getItem(VERSION_KEY);
    if (storedVersion !== String(CONFIG_VERSION)) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.setItem(VERSION_KEY, String(CONFIG_VERSION));
      return DEFAULT_PASSES;
    }

    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Migrate old configs that don't have the new fields
        const migrated = parsed.map((p: any, idx: number) => {
          const defaultPass = DEFAULT_PASSES.find(d => d.id === p.id) || DEFAULT_PASSES[idx];
          return {
            ...defaultPass,
            ...p,
            adults: p.adults ?? defaultPass?.adults ?? 2,
            kids: p.kids ?? defaultPass?.kids ?? 2,
            totalPeople: p.totalPeople !== undefined ? p.totalPeople : (defaultPass?.totalPeople ?? null),
            baseDays: p.baseDays ?? defaultPass?.baseDays ?? 1,
            fullDays: p.fullDays ?? defaultPass?.fullDays ?? 1,
            shareBonus: p.shareBonus ?? defaultPass?.shareBonus ?? {
              extraDays: 0, extraPeople: 0, extraKids: 0,
              description: '', descriptionFr: '', descriptionBi: '',
            },
          };
        });
        return migrated;
      }
    }
  } catch (err) {
    console.error('[usePassConfig] Failed to load from localStorage:', err);
  }
  return DEFAULT_PASSES;
}

function saveToStorage(configs: PassConfig[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
  } catch (err) {
    console.error('[usePassConfig] Failed to save to localStorage:', err);
  }
}


export function usePassConfig() {
  const [passes, setPasses] = useState<PassConfig[]>(loadFromStorage);

  // Sync across tabs
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          setPasses(JSON.parse(e.newValue));
        } catch {}
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const updatePass = useCallback((id: string, updates: Partial<PassConfig>) => {
    setPasses(prev => {
      const next = prev.map(p => p.id === id ? { ...p, ...updates } : p);
      saveToStorage(next);
      return next;
    });
  }, []);

  const updatePassFeature = useCallback((passId: string, featureId: string, updates: Partial<PassFeature>) => {
    setPasses(prev => {
      const next = prev.map(p => {
        if (p.id !== passId) return p;
        return {
          ...p,
          features: p.features.map(f => f.id === featureId ? { ...f, ...updates } : f),
        };
      });
      saveToStorage(next);
      return next;
    });
  }, []);

  const updateShareBonus = useCallback((passId: string, updates: Partial<ShareBonus>) => {
    setPasses(prev => {
      const next = prev.map(p => {
        if (p.id !== passId) return p;
        return {
          ...p,
          shareBonus: { ...p.shareBonus, ...updates },
        };
      });
      saveToStorage(next);
      return next;
    });
  }, []);

  const addFeature = useCallback((passId: string) => {
    setPasses(prev => {
      const next = prev.map(p => {
        if (p.id !== passId) return p;
        const newFeature: PassFeature = {
          id: `f-${Date.now()}`,
          text: 'New feature',
          textFr: 'Nouvelle fonctionnalité',
          textBi: 'Niu fija',
        };
        return { ...p, features: [...p.features, newFeature] };
      });
      saveToStorage(next);
      return next;
    });
  }, []);

  const removeFeature = useCallback((passId: string, featureId: string) => {
    setPasses(prev => {
      const next = prev.map(p => {
        if (p.id !== passId) return p;
        return { ...p, features: p.features.filter(f => f.id !== featureId) };
      });
      saveToStorage(next);
      return next;
    });
  }, []);

  const setPopular = useCallback((passId: string) => {
    setPasses(prev => {
      const next = prev.map(p => ({ ...p, popular: p.id === passId }));
      saveToStorage(next);
      return next;
    });
  }, []);

  const resetToDefaults = useCallback(() => {
    setPasses(DEFAULT_PASSES);
    saveToStorage(DEFAULT_PASSES);
  }, []);

  const activePasses = passes
    .filter(p => p.active)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return {
    passes,
    activePasses,
    updatePass,
    updatePassFeature,
    updateShareBonus,
    addFeature,
    removeFeature,
    setPopular,
    resetToDefaults,
  };
}

export { DEFAULT_PASSES };
