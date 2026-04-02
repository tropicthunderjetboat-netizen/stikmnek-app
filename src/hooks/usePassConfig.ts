import { useState, useCallback, useEffect } from 'react';
import {
  FAMILY_EXPLORER_PASS,
  EXTENDED_GROUP_ADVENTURE_PASS,
  ULTIMATE_CREW_EXPERIENCE_PASS,
  MEGA_GROUP_EXPERIENCE_PASS,
  type PassProductId,
  PASS_PRODUCT_ORDER,
} from '@/data/pricing';

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
  /** Canonical product id (same as `PassProductConfig.id`; DB stores legacy `pass_type` — map at boundaries). */
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

/** Migrate stored admin config or URLs that still use legacy DB pass_type strings. */
function passProductIdFromLegacyOrId(raw: string): PassProductId | null {
  const k = String(raw).toLowerCase().trim();
  const legacy: Record<string, PassProductId> = {
    daily: 'family_explorer',
    weekly: 'extended_group_adventure',
    monthly: 'ultimate_crew_experience',
    mega_group: 'mega_group_experience',
  };
  if (legacy[k]) return legacy[k];
  if ((PASS_PRODUCT_ORDER as readonly string[]).includes(k)) return k as PassProductId;
  return null;
}

// ─── Pass name helpers (from pricing.ts) ───
export const PASS_NAMES: Record<PassProductId, { en: string; fr: string; bi: string; short: string }> = {
  family_explorer: {
    en: FAMILY_EXPLORER_PASS.title,
    fr: FAMILY_EXPLORER_PASS.titleFr,
    bi: FAMILY_EXPLORER_PASS.titleBi,
    short: 'Family Explorer',
  },
  extended_group_adventure: {
    en: EXTENDED_GROUP_ADVENTURE_PASS.title,
    fr: EXTENDED_GROUP_ADVENTURE_PASS.titleFr,
    bi: EXTENDED_GROUP_ADVENTURE_PASS.titleBi,
    short: 'Group Adventure',
  },
  ultimate_crew_experience: {
    en: ULTIMATE_CREW_EXPERIENCE_PASS.title,
    fr: ULTIMATE_CREW_EXPERIENCE_PASS.titleFr,
    bi: ULTIMATE_CREW_EXPERIENCE_PASS.titleBi,
    short: 'Crew Experience',
  },
  mega_group_experience: {
    en: MEGA_GROUP_EXPERIENCE_PASS.title,
    fr: MEGA_GROUP_EXPERIENCE_PASS.titleFr,
    bi: MEGA_GROUP_EXPERIENCE_PASS.titleBi,
    short: 'Mega Group',
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

// Map pricing product to usePassConfig ShareBonus format (extraKids=0 for people-only)
function toShareBonus(sb: { extraPeople: number; extraDays: number; description: string; descriptionFr: string; descriptionBi: string }): ShareBonus {
  return {
    extraDays: sb.extraDays,
    extraPeople: sb.extraPeople,
    extraKids: 0,
    description: sb.description,
    descriptionFr: sb.descriptionFr,
    descriptionBi: sb.descriptionBi,
  };
}

const DEFAULT_PASSES: PassConfig[] = [
  {
    id: 'pass-daily',
    type: 'family_explorer',
    name: FAMILY_EXPLORER_PASS.title,
    nameFr: FAMILY_EXPLORER_PASS.titleFr,
    nameBi: FAMILY_EXPLORER_PASS.titleBi,
    price: FAMILY_EXPLORER_PASS.priceAUD,
    period: '/1 day',
    periodFr: '/1 jour',
    periodBi: '/1 dei',
    colorFrom: 'sky-500',
    colorTo: 'blue-600',
    shadowColor: 'sky-200',
    icon: 'zap',
    features: [
      { id: 'f1', text: 'Valid for up to 4 people', textFr: 'Valable pour jusqu\'à 4 personnes', textBi: '4 man' },
      { id: 'f2', text: 'Access all deals for 1 day', textFr: 'Accès à toutes les offres pendant 1 jour', textBi: 'Akses olgeta dils blong 1 dei' },
      { id: 'f3', text: 'QR code coupons', textFr: 'Coupons QR code', textBi: 'QR kod kupons' },
      { id: 'f4', text: 'Map navigation', textFr: 'Navigation carte', textBi: 'Map navigesen' },
      { id: 'f5', text: 'Share app to add 2 more people FREE!', textFr: 'Partagez l\'app pour ajouter 2 personnes gratuitement !', textBi: 'Serem app blong ademap 2 moa man fri!' },
    ],
    popular: false,
    active: true,
    description: 'Perfect for families exploring for a day',
    descriptionFr: 'Parfait pour les familles qui explorent pendant une journée',
    descriptionBi: 'Gud blong famili we i eksplor blong wan dei',
    maxRedemptionsPerDay: 5,
    sortOrder: 1,
    adults: 4,
    kids: 0,
    totalPeople: 4,
    baseDays: 1,
    fullDays: 1,
    shareBonus: toShareBonus(FAMILY_EXPLORER_PASS.shareBonus),
  },
  {
    id: 'pass-weekly',
    type: 'extended_group_adventure',
    name: EXTENDED_GROUP_ADVENTURE_PASS.title,
    nameFr: EXTENDED_GROUP_ADVENTURE_PASS.titleFr,
    nameBi: EXTENDED_GROUP_ADVENTURE_PASS.titleBi,
    price: EXTENDED_GROUP_ADVENTURE_PASS.priceAUD,
    period: '/6 days',
    periodFr: '/6 jours',
    periodBi: '/6 dei',
    colorFrom: 'teal-500',
    colorTo: 'emerald-600',
    shadowColor: 'teal-200',
    icon: 'star',
    features: [
      { id: 'f1', text: 'Valid for up to 4 people', textFr: 'Valable pour jusqu\'à 4 personnes', textBi: '4 man' },
      { id: 'f2', text: '6 days of unlimited deals', textFr: '6 jours d\'offres illimitées', textBi: '6 dei blong dils we i no gat limit' },
      { id: 'f3', text: 'QR code coupons', textFr: 'Coupons QR code', textBi: 'QR kod kupons' },
      { id: 'f4', text: 'Map navigation', textFr: 'Navigation carte', textBi: 'Map navigesen' },
      { id: 'f7', text: 'Share app: +2 people AND free 7th day!', textFr: 'Partagez: +2 personnes ET 7e jour gratuit !', textBi: 'Serem: +2 man mo fri 7th dei!' },
    ],
    popular: true,
    active: true,
    description: 'Best value for group adventures over 6 days',
    descriptionFr: 'Meilleur rapport qualité-prix pour les aventures de groupe sur 6 jours',
    descriptionBi: 'Beswan valu blong grup advenija blong 6 dei',
    maxRedemptionsPerDay: 10,
    sortOrder: 2,
    adults: 4,
    kids: 0,
    totalPeople: 4,
    baseDays: 6,
    fullDays: 7,
    shareBonus: toShareBonus(EXTENDED_GROUP_ADVENTURE_PASS.shareBonus),
  },
  {
    id: 'pass-monthly',
    type: 'ultimate_crew_experience',
    name: ULTIMATE_CREW_EXPERIENCE_PASS.title,
    nameFr: ULTIMATE_CREW_EXPERIENCE_PASS.titleFr,
    nameBi: ULTIMATE_CREW_EXPERIENCE_PASS.titleBi,
    price: ULTIMATE_CREW_EXPERIENCE_PASS.priceAUD,
    period: '/6 days',
    periodFr: '/6 jours',
    periodBi: '/6 dei',
    colorFrom: 'orange-500',
    colorTo: 'amber-600',
    shadowColor: 'orange-200',
    icon: 'crown',
    features: [
      { id: 'f1', text: 'Valid for up to 7 people', textFr: 'Valable pour jusqu\'à 7 personnes', textBi: '7 man' },
      { id: 'f2', text: '6 days of unlimited deals', textFr: '6 jours d\'offres illimitées', textBi: '6 dei blong dils we i no gat limit' },
      { id: 'f3', text: 'QR code coupons', textFr: 'Coupons QR code', textBi: 'QR kod kupons' },
      { id: 'f4', text: 'Map navigation', textFr: 'Navigation carte', textBi: 'Map navigesen' },
      { id: 'f8', text: 'Share app: +1 person AND free 7th day!', textFr: 'Partagez: +1 personne ET 7e jour gratuit !', textBi: 'Serem: +1 man mo fri 7th dei!' },
    ],
    popular: false,
    active: true,
    description: 'Ultimate experience for crews of 7 over 6 days',
    descriptionFr: 'Expérience ultime pour des équipes de 7 sur 6 jours',
    descriptionBi: 'Ultimet eksperiens blong 7 man blong 6 dei',
    maxRedemptionsPerDay: 999,
    sortOrder: 3,
    adults: 7,
    kids: 0,
    totalPeople: 7,
    baseDays: 6,
    fullDays: 7,
    shareBonus: toShareBonus(ULTIMATE_CREW_EXPERIENCE_PASS.shareBonus),
  },
  {
    id: 'pass-mega-group',
    type: 'mega_group_experience',
    name: MEGA_GROUP_EXPERIENCE_PASS.title,
    nameFr: MEGA_GROUP_EXPERIENCE_PASS.titleFr,
    nameBi: MEGA_GROUP_EXPERIENCE_PASS.titleBi,
    price: MEGA_GROUP_EXPERIENCE_PASS.priceAUD,
    period: '/7 days',
    periodFr: '/7 jours',
    periodBi: '/7 dei',
    colorFrom: 'fuchsia-600',
    colorTo: 'purple-700',
    shadowColor: 'fuchsia-200',
    icon: 'crown',
    features: [
      { id: 'f1', text: 'Valid for up to 20 people', textFr: 'Valable pour jusqu\'à 20 personnes', textBi: '20 man' },
      { id: 'f2', text: '7 days of unlimited deals', textFr: '7 jours d\'offres illimitées', textBi: '7 dei blong dils we i no gat limit' },
      { id: 'f3', text: 'QR code coupons', textFr: 'Coupons QR code', textBi: 'QR kod kupons' },
      { id: 'f4', text: 'Map navigation', textFr: 'Navigation carte', textBi: 'Map navigesen' },
      { id: 'f9', text: 'Share app: +5 FREE days (12 total)', textFr: 'Partagez : +5 jours GRATUITS (12 total)', textBi: 'Serem: +5 fri dei (12 evriwan)' },
    ],
    popular: false,
    active: true,
    description: 'Built for very large groups with extended trip coverage',
    descriptionFr: 'Conçu pour les très grands groupes avec une couverture prolongée',
    descriptionBi: 'I gud blong bigfala grup wetem moa dei blong yusum',
    maxRedemptionsPerDay: 9999,
    sortOrder: 4,
    adults: 20,
    kids: 0,
    totalPeople: 20,
    baseDays: 7,
    fullDays: 12,
    shareBonus: toShareBonus(MEGA_GROUP_EXPERIENCE_PASS.shareBonus),
  },
];

const STORAGE_KEY = 'stikmnek-pass-config';
const CONFIG_VERSION = 6; // v6: Pass `type` uses PassProductId (semantic), not legacy weekly/monthly keys
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
          const defaultPass = DEFAULT_PASSES.find(d => d.id === p.id) || DEFAULT_PASSES[idx];
          const migratedType = passProductIdFromLegacyOrId(p.type) ?? defaultPass?.type ?? 'family_explorer';
          return {
            ...defaultPass,
            ...p,
            type: migratedType,
            adults: p.adults ?? defaultPass?.adults ?? 4,
            kids: p.kids ?? defaultPass?.kids ?? 0,
            totalPeople: p.totalPeople !== undefined ? p.totalPeople : (defaultPass?.totalPeople ?? 4),
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
