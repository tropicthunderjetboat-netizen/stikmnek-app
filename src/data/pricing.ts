/**
 * StikmNek Pricing & Product Definitions
 * ─────────────────────────────────────
 * Central source of truth for pass types, prices, share bonuses,
 * and micro-transactions. Used across payment, receipts, and UI.
 */

export const SUPERSTAR_PRICE_AUD = 5;

export type PassType = 'daily' | 'weekly' | 'monthly';

export interface ShareBonusConfig {
  extraPeople: number;
  extraDays: number;
  /** Total people after share bonus applied */
  totalPeopleAfterShare: number;
  /** Total days after share bonus applied (for passes that get +1 day) */
  totalDaysAfterShare?: number;
  description: string;
  descriptionFr: string;
  descriptionBi: string;
}

export interface PassProductConfig {
  type: PassType;
  title: string;
  titleFr: string;
  titleBi: string;
  priceAUD: number;
  baseDays: number;
  basePeople: number;
  shareBonus: ShareBonusConfig;
}

/** Product A: 1-Day Pass */
export const FAMILY_EXPLORER_PASS: PassProductConfig = {
  type: 'daily',
  title: 'Family Explorer Pass',
  titleFr: 'Pass Explorateur Familial',
  titleBi: 'Famili Eksplora Pas',
  priceAUD: 15,
  baseDays: 1,
  basePeople: 4,
  shareBonus: {
    extraPeople: 2,
    extraDays: 0,
    totalPeopleAfterShare: 6,
    description: 'Share the app to add 2 more people FREE!',
    descriptionFr: 'Partagez l\'app pour ajouter 2 personnes gratuitement !',
    descriptionBi: 'Serem app blong ademap 2 moa man fri!',
  },
};

/** Product B: 6-Day Pass */
export const EXTENDED_GROUP_ADVENTURE_PASS: PassProductConfig = {
  type: 'weekly',
  title: 'Extended Group Adventure Pass',
  titleFr: 'Pass Aventure Groupe Étendu',
  titleBi: 'Grup Advenija Pas',
  priceAUD: 45,
  baseDays: 6,
  basePeople: 4,
  shareBonus: {
    extraPeople: 2,
    extraDays: 1,
    totalPeopleAfterShare: 6,
    totalDaysAfterShare: 7,
    description: 'Share the app to get +2 people AND a free 7th day!',
    descriptionFr: 'Partagez l\'app pour +2 personnes ET un 7e jour gratuit !',
    descriptionBi: 'Serem app blong kasem +2 man mo wan fri 7th dei!',
  },
};

/** Product C: Group Pass (6 Days) */
export const ULTIMATE_CREW_EXPERIENCE_PASS: PassProductConfig = {
  type: 'monthly',
  title: 'Ultimate Crew Experience Pass',
  titleFr: 'Pass Expérience Ultime Équipe',
  titleBi: 'Ultimet Kru Eksperiens Pas',
  priceAUD: 99,
  baseDays: 6,
  basePeople: 7,
  shareBonus: {
    extraPeople: 1,
    extraDays: 1,
    totalPeopleAfterShare: 8,
    totalDaysAfterShare: 7,
    description: 'Share the app to get +1 person AND a free 7th day!',
    descriptionFr: 'Partagez l\'app pour +1 personne ET un 7e jour gratuit !',
    descriptionBi: 'Serem app blong kasem +1 man mo wan fri 7th dei!',
  },
};

export const PASS_PRODUCTS: Record<PassType, PassProductConfig> = {
  daily: FAMILY_EXPLORER_PASS,
  weekly: EXTENDED_GROUP_ADVENTURE_PASS,
  monthly: ULTIMATE_CREW_EXPERIENCE_PASS,
};

export function getPassTitle(passType: PassType, lang: 'en' | 'fr' | 'bi' = 'en'): string {
  const p = PASS_PRODUCTS[passType];
  if (!p) return passType;
  return lang === 'fr' ? p.titleFr : lang === 'bi' ? p.titleBi : p.title;
}

/**
 * Safe display title for any string coming from DB / API (`daily` | `weekly` | `monthly`).
 * Never surfaces raw keys like "monthly" to users — unknown values fall back to generic StikmNek Pass.
 */
export function getPassDisplayTitle(
  passType: string | null | undefined,
  lang: 'en' | 'fr' | 'bi' = 'en'
): string {
  if (passType == null || String(passType).trim() === '') {
    return lang === 'fr' ? 'Pass StikmNek' : lang === 'bi' ? 'StikmNek Pas' : 'StikmNek Pass';
  }
  const key = String(passType).toLowerCase().trim();
  if (key === 'daily' || key === 'weekly' || key === 'monthly') {
    return getPassTitle(key, lang);
  }
  return lang === 'fr' ? 'Pass StikmNek' : lang === 'bi' ? 'StikmNek Pas' : 'StikmNek Pass';
}

export function getPassPrice(passType: PassType): number {
  return PASS_PRODUCTS[passType]?.priceAUD ?? 0;
}

export function getBasePeople(passType: PassType): number {
  return PASS_PRODUCTS[passType]?.basePeople ?? 4;
}

export function getShareBonusTotalPeople(passType: PassType): number {
  return PASS_PRODUCTS[passType]?.shareBonus.totalPeopleAfterShare ?? 6;
}
