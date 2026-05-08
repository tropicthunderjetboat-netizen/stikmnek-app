/**
 * Hand-maintained types for DB objects not yet covered by `supabase gen types`.
 * After running migrations, regenerate Supabase types if your workflow uses them,
 * and merge any overlapping definitions here.
 */

/** Matches `public.pass_duration_enum` (migration `20260504140000_user_profiles_pass_preferences`). */
export type PassDuration = 'short' | 'extended';

export const PASS_DURATION_VALUES: readonly PassDuration[] = ['short', 'extended'] as const;

export function isPassDuration(value: unknown): value is PassDuration {
  return value === 'short' || value === 'extended';
}
