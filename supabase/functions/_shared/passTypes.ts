/**
 * Keep in sync with `src/data/passCatalog.ts`.
 * Normalizes client pass keys (semantic or legacy DB) to `passes.pass_type` values.
 */

export type DbPassType = 'daily' | 'weekly' | 'monthly' | 'mega_group' | 'dynamic';

const SEMANTIC_TO_DB: Record<string, DbPassType> = {
  family_explorer: 'daily',
  extended_group_adventure: 'weekly',
  ultimate_crew_experience: 'monthly',
  mega_group_experience: 'mega_group',
  dynamic: 'dynamic',
};

const LEGACY = new Set<string>(['daily', 'weekly', 'monthly', 'mega_group', 'dynamic']);

export function normalizePassTypeToDb(raw: string): DbPassType | null {
  const k = String(raw ?? '').toLowerCase().trim();
  if (LEGACY.has(k)) return k as DbPassType;
  return SEMANTIC_TO_DB[k] ?? null;
}

/** For API responses / client state — canonical product slug (not always DB `pass_type`). */
const DB_TO_SEMANTIC: Record<DbPassType, string> = {
  daily: 'family_explorer',
  weekly: 'extended_group_adventure',
  monthly: 'ultimate_crew_experience',
  mega_group: 'mega_group_experience',
  dynamic: 'dynamic',
};

export function semanticPassIdFromDb(db: DbPassType): string {
  return DB_TO_SEMANTIC[db];
}
