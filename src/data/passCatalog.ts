/**
 * Pass identity mapping: new `dynamic` passes + legacy catalog DB keys.
 */

export const LEGACY_PASS_PRODUCT_ORDER = [
  'family_explorer',
  'extended_group_adventure',
  'ultimate_crew_experience',
  'mega_group_experience',
] as const;

export type LegacyPassProductId = (typeof LEGACY_PASS_PRODUCT_ORDER)[number];

export type PassProductId = 'dynamic' | LegacyPassProductId;

/** Kept for imports that expect `PASS_PRODUCT_ORDER` — dynamic-only catalog. */
export const PASS_PRODUCT_ORDER: readonly PassProductId[] = ['dynamic'];

/** Stored in Postgres `passes.pass_type` */
export type DbPassType = 'daily' | 'weekly' | 'monthly' | 'mega_group' | 'dynamic';

export const DB_PASS_TYPE_BY_PRODUCT_ID: Record<LegacyPassProductId, Exclude<DbPassType, 'dynamic'>> = {
  family_explorer: 'daily',
  extended_group_adventure: 'weekly',
  ultimate_crew_experience: 'monthly',
  mega_group_experience: 'mega_group',
};

export const PASS_PRODUCT_ID_BY_DB_TYPE: Record<DbPassType, PassProductId> = {
  daily: 'family_explorer',
  weekly: 'extended_group_adventure',
  monthly: 'ultimate_crew_experience',
  mega_group: 'mega_group_experience',
  dynamic: 'dynamic',
};

const LEGACY_DB = new Set<string>(['daily', 'weekly', 'monthly', 'mega_group']);

const SEMANTIC_TO_DB: Record<string, DbPassType> = {
  family_explorer: 'daily',
  extended_group_adventure: 'weekly',
  ultimate_crew_experience: 'monthly',
  mega_group_experience: 'mega_group',
  dynamic: 'dynamic',
};

export function toDbPassType(id: PassProductId): DbPassType {
  if (id === 'dynamic') return 'dynamic';
  return DB_PASS_TYPE_BY_PRODUCT_ID[id as LegacyPassProductId];
}

export function passProductIdFromDb(raw: string | null | undefined): PassProductId | null {
  if (raw == null || String(raw).trim() === '') return null;
  const k = String(raw).toLowerCase().trim();
  if (k === 'dynamic') return 'dynamic';
  if (LEGACY_DB.has(k)) return PASS_PRODUCT_ID_BY_DB_TYPE[k as DbPassType];
  if ((LEGACY_PASS_PRODUCT_ORDER as readonly string[]).includes(k)) return k as LegacyPassProductId;
  if (k === 'stikmnek_dynamic') return 'dynamic';
  return null;
}

export function isPassProductId(s: string): s is PassProductId {
  return s === 'dynamic' || (LEGACY_PASS_PRODUCT_ORDER as readonly string[]).includes(s);
}
