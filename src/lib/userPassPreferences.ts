import { supabase } from '@/lib/supabase';
import type { PassDuration } from '@/types/database.types';
import { isPassDuration } from '@/types/database.types';

export type UpdatePassPreferencesInput = {
  partySize?: number | null;
  preferredDuration?: PassDuration | null;
};

/**
 * Persists checkout defaults on `user_profiles`. Uses `user_id` (auth user id), not profile `id`.
 * RLS: caller must be authenticated as that user (or admin).
 */
export async function updateUserPassPreferences(
  userId: string,
  data: UpdatePassPreferencesInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (data.partySize != null) {
    if (!Number.isInteger(data.partySize) || data.partySize < 1 || data.partySize > 6) {
      return { ok: false, error: 'party_size must be an integer from 1 to 6, or null' };
    }
  }
  if (data.preferredDuration != null && !isPassDuration(data.preferredDuration)) {
    return { ok: false, error: 'preferredDuration must be short, extended, or null' };
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if ('partySize' in data) patch.party_size = data.partySize;
  if ('preferredDuration' in data) patch.preferred_pass_duration = data.preferredDuration;

  const { error } = await supabase.from('user_profiles').update(patch).eq('user_id', userId);

  if (error) {
    console.error('[updateUserPassPreferences]', error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
