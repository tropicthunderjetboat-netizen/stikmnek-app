/**
 * StikmNek dynamic pass pricing (single product model).
 * Legacy DB `pass_type` values (daily/weekly/…) remain for existing rows — see `passCatalog.ts`.
 *
 * Formula: BASE + (partySize - 1) * GUEST_FEE + (isExtended ? EXTEND : 0)
 * — Keep in sync with `supabase/functions/_shared/pricingDynamic.ts`.
 */

import {
  passProductIdFromDb,
  type DbPassType,
  type PassProductId,
  PASS_PRODUCT_ORDER,
  toDbPassType,
} from '@/data/passCatalog';

export type { DbPassType, PassProductId };
export { passProductIdFromDb, toDbPassType, PASS_PRODUCT_ORDER };

export const BASE_PRICE_AUD = 15;
export const GUEST_FEE_AUD = 5;
export const EXTEND_FEE_AUD = 10;
export const MIN_PARTY_SIZE = 1;
export const MAX_PARTY_SIZE = 6;

export function clampPartySize(n: number): number {
  if (!Number.isFinite(n)) return MIN_PARTY_SIZE;
  const x = Math.floor(n);
  return Math.min(MAX_PARTY_SIZE, Math.max(MIN_PARTY_SIZE, x));
}

export function calculatePassPrice(partySize: number, isExtended: boolean): number {
  const p = clampPartySize(partySize);
  return BASE_PRICE_AUD + (p - 1) * GUEST_FEE_AUD + (isExtended ? EXTEND_FEE_AUD : 0);
}

/** Inclusive calendar span: 24-hour = 1 day; extended = 14 days. */
export function passInclusiveCalendarDays(isExtended: boolean): number {
  return isExtended ? 14 : 1;
}

/** Offset from start date to `valid_until` (inclusive). */
export function validUntilDayOffset(isExtended: boolean): number {
  return passInclusiveCalendarDays(isExtended) - 1;
}

export function addCalendarDaysIso(startDateIso: string, dayOffset: number): string {
  const d = new Date(startDateIso + 'T00:00:00');
  d.setDate(d.getDate() + dayOffset);
  return d.toISOString().split('T')[0];
}

export function getPassDisplayTitle(
  raw: string | null | undefined,
  lang: 'en' | 'fr' | 'bi' = 'en',
): string {
  const id = passProductIdFromDb(String(raw ?? ''));
  if (id === 'dynamic' || String(raw ?? '').toLowerCase().trim() === 'dynamic') {
    return lang === 'fr' ? 'Pass StikmNek' : lang === 'bi' ? 'StikmNek Pas' : 'StikmNek Pass';
  }
  const legacyTitles: Record<string, { en: string; fr: string; bi: string }> = {
    family_explorer: {
      en: 'Family Explorer Pass',
      fr: 'Pass Explorateur Familial',
      bi: 'Famili Eksplora Pas',
    },
    extended_group_adventure: {
      en: 'Extended Group Adventure Pass',
      fr: 'Pass Aventure Groupe Étendu',
      bi: 'Grup Advenija Pas',
    },
    ultimate_crew_experience: {
      en: 'Ultimate Crew Experience Pass',
      fr: 'Pass Expérience Ultime Équipe',
      bi: 'Ultimet Kru Eksperiens Pas',
    },
    mega_group_experience: {
      en: 'Mega Group Experience Pass',
      fr: 'Pass Expérience Méga Groupe',
      bi: 'Mega Grup Eksperiens Pas',
    },
    daily: { en: 'Family Explorer Pass', fr: 'Pass Explorateur Familial', bi: 'Famili Eksplora Pas' },
    weekly: { en: 'Extended Group Adventure Pass', fr: 'Pass Aventure Groupe Étendu', bi: 'Grup Advenija Pas' },
    monthly: { en: 'Ultimate Crew Experience Pass', fr: 'Pass Expérience Ultime Équipe', bi: 'Ultimet Kru Eksperiens Pas' },
    mega_group: { en: 'Mega Group Experience Pass', fr: 'Pass Expérience Méga Groupe', bi: 'Mega Grup Eksperiens Pas' },
  };
  const key = (id ?? String(raw ?? '')).toLowerCase().trim();
  const row = legacyTitles[key];
  if (row) return lang === 'fr' ? row.fr : lang === 'bi' ? row.bi : row.en;
  return lang === 'fr' ? 'Pass StikmNek' : lang === 'bi' ? 'StikmNek Pas' : 'StikmNek Pass';
}

export function getPassTitle(_passId: PassProductId, lang: 'en' | 'fr' | 'bi' = 'en'): string {
  return getPassDisplayTitle('dynamic', lang);
}

/** @deprecated Catalog removed — use {@link calculatePassPrice}. */
export function getPassPrice(_passId: PassProductId): number {
  return calculatePassPrice(MIN_PARTY_SIZE, false);
}

export function getBasePeople(_passId: PassProductId): number {
  return MAX_PARTY_SIZE;
}

export function getShareBonusTotalPeople(_passId: PassProductId): number {
  return MAX_PARTY_SIZE;
}
