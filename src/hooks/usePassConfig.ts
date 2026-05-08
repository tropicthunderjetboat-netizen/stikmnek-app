import { useState, useCallback, useEffect } from 'react';
import { calculatePassPrice, MAX_PARTY_SIZE } from '@/data/pricing';
import { passProductIdFromDb, type PassProductId } from '@/data/passCatalog';

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
  type: PassProductId;
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
  adults: number;
  kids: number;
  totalPeople: number | null;
  baseDays: number;
  fullDays: number;
  shareBonus: ShareBonus;
}

const EMPTY_SHARE: ShareBonus = {
  extraDays: 0,
  extraPeople: 0,
  extraKids: 0,
  description: '',
  descriptionFr: '',
  descriptionBi: '',
};

/** Normalize legacy DB / semantic pass strings to the single StikmNek Pass product. */
function passProductIdFromLegacyOrId(raw: string): PassProductId | null {
  return passProductIdFromDb(raw);
}

export const PASS_NAMES: Record<PassProductId, { en: string; fr: string; bi: string; short: string }> = {
  dynamic: {
    en: 'StikmNek Pass',
    fr: 'Pass StikmNek',
    bi: 'StikmNek Pas',
    short: 'StikmNek',
  },
};

export function getPassDisplayName(passType: string, language: 'en' | 'fr' | 'bi' = 'en'): string {
  const id = passProductIdFromLegacyOrId(passType);
  const names = id ? PASS_NAMES[id] : undefined;
  if (!names) return passType;
  return names[language] || names.en;
}

export function getPassShortName(passType: string): string {
  const id = passProductIdFromLegacyOrId(passType);
  return id ? PASS_NAMES[id]?.short ?? passType : passType;
}

const DEFAULT_PASSES: PassConfig[] = [
  {
    id: 'pass-dynamic',
    type: 'dynamic',
    name: 'StikmNek Pass',
    nameFr: 'Pass StikmNek',
    nameBi: 'StikmNek Pas',
    price: calculatePassPrice(1, false),
    period: 'from $15 AUD',
    periodFr: 'dès 15 $ AUD',
    periodBi: 'from $15 AUD',
    colorFrom: 'teal-500',
    colorTo: 'emerald-600',
    shadowColor: 'teal-200',
    icon: 'star',
    features: [
      {
        id: 'f1',
        text: 'Covers up to 6 people per pass',
        textFr: 'Jusqu’à 6 personnes par pass',
        textBi: 'Kasem antap 6 man long wan pas',
      },
      { id: 'f2', text: '24-hour day pass or 7-day holiday pass', textFr: 'Pass 24 h ou pass vacances 7 jours', textBi: '24 owa o 7 dei holiday pas' },
      { id: 'f3', text: 'QR code redemptions', textFr: 'Utilisations QR code', textBi: 'QR kod' },
      { id: 'f4', text: 'Map & savings tracker', textFr: 'Carte et suivi', textBi: 'Map mo save' },
    ],
    popular: false,
    active: true,
    description: 'Dynamic pricing based on your group size and trip length',
    descriptionFr: 'Tarification selon la taille du groupe et la durée',
    descriptionBi: 'Prais blong grup mo taem blong trip',
    maxRedemptionsPerDay: 10,
    sortOrder: 1,
    adults: MAX_PARTY_SIZE,
    kids: 0,
    totalPeople: MAX_PARTY_SIZE,
    baseDays: 1,
    fullDays: 7,
    shareBonus: {
      extraDays: 7,
      extraPeople: 0,
      extraKids: 0,
      description: 'Share the app after purchase for 7 extra days free — 14 days of deals on your Holiday Pass.',
      descriptionFr: 'Partagez l’app après l’achat pour 7 jours supplémentaires gratuits — 14 jours d’offres au total sur votre pass vacances.',
      descriptionBi: 'Serem app afta bai blong 7 dei moa blong free — 14 dei long dils long Holiday Pas blong yu.',
    },
  },
];

const STORAGE_KEY = 'stikmnek-pass-config';
const CONFIG_VERSION = 10;
const VERSION_KEY = 'stikmnek-pass-config-version';

function loadFromStorage(): PassConfig[] {
  try {
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
        const migrated = parsed.map((p: any, idx: number) => {
          const defaultPass = DEFAULT_PASSES.find(d => d.id === p.id) || DEFAULT_PASSES[0];
          const migratedType = passProductIdFromLegacyOrId(p.type) ?? defaultPass?.type ?? 'dynamic';
          return {
            ...defaultPass,
            ...p,
            type: migratedType,
            popular: false,
            adults: p.adults ?? defaultPass?.adults ?? MAX_PARTY_SIZE,
            kids: p.kids ?? defaultPass?.kids ?? 0,
            totalPeople: p.totalPeople !== undefined ? p.totalPeople : (defaultPass?.totalPeople ?? MAX_PARTY_SIZE),
            baseDays: p.baseDays ?? defaultPass?.baseDays ?? 1,
            fullDays: p.fullDays ?? defaultPass?.fullDays ?? 14,
            shareBonus: p.shareBonus ?? defaultPass?.shareBonus ?? { ...EMPTY_SHARE },
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

  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          setPasses(JSON.parse(e.newValue));
        } catch {
          /* ignore */
        }
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const updatePass = useCallback((id: string, updates: Partial<PassConfig>) => {
    setPasses(prev => {
      const next = prev.map(p => (p.id === id ? { ...p, ...updates } : p));
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
          features: p.features.map(f => (f.id === featureId ? { ...f, ...updates } : f)),
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
    resetToDefaults,
  };
}

export { DEFAULT_PASSES };
