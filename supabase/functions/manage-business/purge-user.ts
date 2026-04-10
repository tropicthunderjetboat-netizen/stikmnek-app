// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type SupabaseClient = ReturnType<typeof createClient>;

/**
 * Remove all public (and storage) rows referencing an auth user so `auth.admin.deleteUser` succeeds.
 * Tries SECURITY DEFINER RPC first (includes storage.objects); falls back to Rest deletes.
 */
export async function purgePublicDataForAuthUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const uid = String(userId);

  const { error: rpcErr } = await supabase.rpc('delete_public_app_data_for_user', {
    p_user_id: uid,
  });
  if (!rpcErr) {
    return;
  }
  console.warn(
    '[manage-business] delete_public_app_data_for_user RPC failed; using Rest fallback:',
    rpcErr.message,
  );

  const logSkip = (label: string, err: { message?: string } | null) => {
    if (err?.message) console.warn(`[manage-business] purge ${label}:`, err.message);
  };

  const run = async (
    label: string,
    op: PromiseLike<{ error: { message?: string } | null }>,
  ) => {
    const { error } = await op;
    if (error) logSkip(label, error);
  };

  await run('review_responses', supabase.from('review_responses').delete().eq('user_id', uid));
  await run('reviews', supabase.from('reviews').delete().eq('user_id', uid));
  await run('favorites', supabase.from('favorites').delete().eq('user_id', uid));
  await run('pass_purchases', supabase.from('pass_purchases').delete().eq('user_id', uid));
  await run('payment_sessions', supabase.from('payment_sessions').delete().eq('user_id', uid));
  await run('redemptions', supabase.from('redemptions').delete().eq('user_id', uid));
  await run('passes', supabase.from('passes').delete().eq('user_id', uid));
  await run('search_history', supabase.from('search_history').delete().eq('user_id', uid));

  await run(
    'ticket_responses (responder)',
    supabase.from('ticket_responses').delete().eq('responder_id', uid),
  );
  const { data: userTickets, error: ticketSelErr } = await supabase
    .from('support_tickets')
    .select('id')
    .eq('user_id', uid);
  if (ticketSelErr) logSkip('support_tickets select', ticketSelErr);
  else {
    const ids = (userTickets || []).map((r: { id: string }) => r.id).filter(Boolean);
    if (ids.length > 0) {
      await run(
        'ticket_responses (by ticket)',
        supabase.from('ticket_responses').delete().in('ticket_id', ids),
      );
    }
  }
  await run('support_tickets', supabase.from('support_tickets').delete().eq('user_id', uid));
  await run('notifications', supabase.from('notifications').delete().eq('user_id', uid));
  await run('feedback', supabase.from('feedback').delete().eq('user_id', uid));
  await run('error_logs', supabase.from('error_logs').delete().eq('user_id', uid));
  await run(
    'referrals',
    supabase.from('referrals').delete().or(`referrer_id.eq.${uid},referred_user_id.eq.${uid}`),
  );
  await run('social_activity', supabase.from('social_activity').delete().eq('user_id', uid));

  await run('business_photos', supabase.from('business_photos').delete().eq('uploaded_by', uid));
  await run('pending_edits', supabase.from('pending_edits').delete().eq('owner_id', uid));
  await run('pending_businesses', supabase.from('pending_businesses').delete().eq('owner_id', uid));
  await run('businesses', supabase.from('businesses').delete().eq('owner_id', uid));
  await run('user_profiles', supabase.from('user_profiles').delete().eq('user_id', uid));

  try {
    const anyClient = supabase as unknown as {
      schema?: (name: string) => ReturnType<typeof createClient>;
    };
    if (typeof anyClient.schema === 'function') {
      const { error } = await anyClient.schema('storage').from('objects').delete().eq('owner', uid);
      if (error) logSkip('storage.objects', error);
    }
  } catch (e) {
    console.warn('[manage-business] storage.objects purge skipped:', e);
  }
}
