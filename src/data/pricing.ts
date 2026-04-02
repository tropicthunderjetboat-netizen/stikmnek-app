/**
 * StikmNek Pricing & Product Definitions
 * ─────────────────────────────────────
 * Pass products are keyed by PassProductId (semantic). DB column `passes.pass_type`
 * uses legacy strings — map with passCatalog helpers.
 */

import {
  type PassProductId,
  type DbPassType,
  passProductIdFromDb,
  toDbPassType,
  PASS_PRODUCT_ORDER,
} from '@/data/passCatalog';

export type { PassProductId, DbPassType };
export { passProductIdFromDb, toDbPassType, PASS_PRODUCT_ORDER };

export const SUPERSTAR_PRICE_AUD = 5;

export interface ShareBonusConfig {
  extraPeople: number;
  extraDays: number;
  totalPeopleAfterShare: number;
  totalDaysAfterShare?: number;
  description: string;
  descriptionFr: string;
  descriptionBi: string;
}

export interface PassProductConfig {
  /** Canonical app identifier */
  id: PassProductId;
  title: string;
  titleFr: string;
  titleBi: string;
  priceAUD: number;
  baseDays: number;
  basePeople: number;
  shareBonus: ShareBonusConfig;
}

export const FAMILY_EXPLORER_PASS: PassProductConfig = {
  id: 'family_explorer',
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

export const EXTENDED_GROUP_ADVENTURE_PASS: PassProductConfig = {
  id: 'extended_group_adventure',
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

export const ULTIMATE_CREW_EXPERIENCE_PASS: PassProductConfig = {
  id: 'ultimate_crew_experience',
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

export const MEGA_GROUP_EXPERIENCE_PASS: PassProductConfig = {
  id: 'mega_group_experience',
  title: 'Mega Group Experience Pass',
  titleFr: 'Pass Expérience Méga Groupe',
  titleBi: 'Mega Grup Eksperiens Pas',
  priceAUD: 199,
  baseDays: 7,
  basePeople: 20,
  shareBonus: {
    extraPeople: 0,
    extraDays: 5,
    totalPeopleAfterShare: 20,
    totalDaysAfterShare: 12,
    description: 'Share the app to unlock 5 extra days FREE!',
    descriptionFr: 'Partagez l\'app pour débloquer 5 jours supplémentaires gratuits !',
    descriptionBi: 'Serem app blong anlokem 5 moa fri dei!',
  },
};

export const PASS_PRODUCTS: Record<PassProductId, PassProductConfig> = {
  family_explorer: FAMILY_EXPLORER_PASS,
  extended_group_adventure: EXTENDED_GROUP_ADVENTURE_PASS,
  ultimate_crew_experience: ULTIMATE_CREW_EXPERIENCE_PASS,
  mega_group_experience: MEGA_GROUP_EXPERIENCE_PASS,
};

/** Ordered list for UI (cards, checkout). */
export const PASS_PRODUCTS_IN_ORDER: PassProductConfig[] = PASS_PRODUCT_ORDER.map((id) => PASS_PRODUCTS[id]);

/** @deprecated Use PassProductId — same union, semantic names */
export type PassType = PassProductId;

export function getPassTitle(passId: PassProductId, lang: 'en' | 'fr' | 'bi' = 'en'): string {
  const p = PASS_PRODUCTS[passId];
  if (!p) return passId;
  return lang === 'fr' ? p.titleFr : lang === 'bi' ? p.titleBi : p.title;
}

/**
 * Display title for DB legacy key, semantic id, or unknown string.
 */
export function getPassDisplayTitle(
  raw: string | null | undefined,
  lang: 'en' | 'fr' | 'bi' = 'en',
): string {
  if (raw == null || String(raw).trim() === '') {
    return lang === 'fr' ? 'Pass StikmNek' : lang === 'bi' ? 'StikmNek Pas' : 'StikmNek Pass';
  }
  const id = passProductIdFromDb(String(raw));
  if (id) return getPassTitle(id, lang);
  return lang === 'fr' ? 'Pass StikmNek' : lang === 'bi' ? 'StikmNek Pas' : 'StikmNek Pass';
}

export function getPassPrice(passId: PassProductId): number {
  return PASS_PRODUCTS[passId]?.priceAUD ?? 0;
}

export function getBasePeople(passId: PassProductId): number {
  return PASS_PRODUCTS[passId]?.basePeople ?? 4;
}

export function getShareBonusTotalPeople(passId: PassProductId): number {
  return PASS_PRODUCTS[passId]?.shareBonus.totalPeopleAfterShare ?? 6;
}
