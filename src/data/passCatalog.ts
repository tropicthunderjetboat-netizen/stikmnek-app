/**
 * Canonical pass product identities for application code.
 *
 * `public.passes.pass_type` still stores legacy values (`daily`, `weekly`, …) for
 * backwards compatibility — use `toDbPassType` / `passProductIdFromDb` at boundaries.
 */

export const PASS_PRODUCT_ORDER = [
  'family_explorer',
  'extended_group_adventure',
  'ultimate_crew_experience',
  'mega_group_experience',
] as const;

export type PassProductId = (typeof PASS_PRODUCT_ORDER)[number];

/** Stored in Postgres `passes.pass_type` and older APIs */
export type DbPassType = 'daily' | 'weekly' | 'monthly' | 'mega_group';

export const DB_PASS_TYPE_BY_PRODUCT_ID: Record<PassProductId, DbPassType> = {
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
};

const DB_KEYS = new Set<string>(['daily', 'weekly', 'monthly', 'mega_group']);

export function toDbPassType(id: PassProductId): DbPassType {
  return DB_PASS_TYPE_BY_PRODUCT_ID[id];
}

/**
 * Map DB / API string to canonical product id. Accepts legacy `pass_type` or semantic slug.
 */
export function passProductIdFromDb(raw: string | null | undefined): PassProductId | null {
  if (raw == null || String(raw).trim() === '') return null;
  const k = String(raw).toLowerCase().trim();
  if (DB_KEYS.has(k)) return PASS_PRODUCT_ID_BY_DB_TYPE[k as DbPassType];
  if ((PASS_PRODUCT_ORDER as readonly string[]).includes(k)) return k as PassProductId;
  return null;
}

export function isPassProductId(s: string): s is PassProductId {
  return (PASS_PRODUCT_ORDER as readonly string[]).includes(s);
}
