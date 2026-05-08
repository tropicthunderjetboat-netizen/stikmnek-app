/**
 * Pass identity: single StikmNek Pass product (`dynamic` in DB).
 * Legacy DB values and old semantic slugs still map to `dynamic` for UI and pricing.
 */

export type PassProductId = 'dynamic';

export const PASS_PRODUCT_ORDER: readonly PassProductId[] = ['dynamic'];

/** Stored in Postgres `passes.pass_type` */
export type DbPassType = 'daily' | 'weekly' | 'monthly' | 'mega_group' | 'dynamic';

export const PASS_PRODUCT_ID_BY_DB_TYPE: Record<DbPassType, PassProductId> = {
  daily: 'dynamic',
  weekly: 'dynamic',
  monthly: 'dynamic',
  mega_group: 'dynamic',
  dynamic: 'dynamic',
};

const LEGACY_DB = new Set<string>(['daily', 'weekly', 'monthly', 'mega_group']);
const LEGACY_SEMANTIC = new Set<string>([
  'family_explorer',
  'extended_group_adventure',
  'ultimate_crew_experience',
  'mega_group_experience',
]);

export function toDbPassType(_id: PassProductId): DbPassType {
  return 'dynamic';
}

export function passProductIdFromDb(raw: string | null | undefined): PassProductId | null {
  if (raw == null || String(raw).trim() === '') return null;
  const k = String(raw).toLowerCase().trim();
  if (k === 'dynamic' || k === 'stikmnek_dynamic') return 'dynamic';
  if (LEGACY_DB.has(k)) return 'dynamic';
  if (LEGACY_SEMANTIC.has(k)) return 'dynamic';
  return null;
}

export function isPassProductId(s: string): s is PassProductId {
  return passProductIdFromDb(s) != null;
}
