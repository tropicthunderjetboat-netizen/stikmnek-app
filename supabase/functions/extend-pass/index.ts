// deno-lint-ignore-file no-explicit-any
/**
 * extend-pass Edge Function
 * Applies share bonus to the user's active pass: extra people and/or extra days.
 * Called after the user shares the app (e.g. from PassCards).
 * Body: { user_id?, share_proof?, platform? } — user_id can be omitted (uses JWT).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { inclusiveCalendarDaySpanUtc } from '../_shared/passSpan.ts';

/**
 * CORS: set CORS_ALLOWED_ORIGINS (comma-separated). If unset, Allow-Origin is *.
 */
function getSafeCorsHeaders(req: Request): Record<string, string> {
  const raw = (Deno.env.get('CORS_ALLOWED_ORIGINS') ?? '').trim();
  const allowed = raw.split(',').map((s) => s.trim()).filter(Boolean);
  const origin = req.headers.get('Origin') ?? '';
  const base: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  };
  if (allowed.length === 0) {
    base['Access-Control-Allow-Origin'] = '*';
    return base;
  }
  base['Access-Control-Allow-Origin'] = allowed.includes(origin) ? origin : allowed[0]!;
  return base;
}

/** Option A: Holiday Pass (7 active days) → +7 calendar days from current `valid_until` (14 total). */
function shareBonusForPassRow(pass: {
  pass_type?: string | null;
  valid_from?: string | null;
  valid_until?: string | null;
}): { extraPeople: number; extraDays: number } {
  const pt = String(pass.pass_type ?? '').toLowerCase();
  if (pt === 'dynamic') {
    const from = String(pass.valid_from ?? '').slice(0, 10);
    const to = String(pass.valid_until ?? '').slice(0, 10);
    if (!from || !to) return { extraPeople: 0, extraDays: 0 };
    const span = inclusiveCalendarDaySpanUtc(from, to);
    if (span <= 1) return { extraPeople: 0, extraDays: 0 };
    if (span >= 14) return { extraPeople: 0, extraDays: 0 };
    if (span >= 7) return { extraPeople: 0, extraDays: 7 };
    return { extraPeople: 0, extraDays: 0 };
  }
  const LEGACY: Record<string, { extraPeople: number; extraDays: number }> = {
    daily: { extraPeople: 2, extraDays: 0 },
    weekly: { extraPeople: 2, extraDays: 1 },
    monthly: { extraPeople: 1, extraDays: 1 },
    mega_group: { extraPeople: 0, extraDays: 5 },
  };
  return LEGACY[pt] ?? { extraPeople: 0, extraDays: 0 };
}

function addCalendarDaysUtc(dateStr: string, dayOffset: number): string {
  const raw = String(dateStr ?? '').slice(0, 10);
  const parts = raw.split('-').map((s) => Number(s, 10));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return raw;
  const [y, m, d] = parts;
  const ms = Date.UTC(y, m - 1, d + dayOffset);
  return new Date(ms).toISOString().slice(0, 10);
}

function endOfDayISO(dateStr: string): string {
  const d = new Date(dateStr + 'T23:59:59.999Z');
  return d.toISOString();
}

Deno.serve(async (req) => {
  const corsHeaders = getSafeCorsHeaders(req);
  const jsonResponse = (data: object, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  const errorResponse = (message: string, status = 400, extra?: Record<string, unknown>) =>
    new Response(JSON.stringify({ success: false, error: message, ...extra }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return errorResponse('Missing Authorization header', 401);
    }

    const supabaseUrl = (Deno.env.get('SUPABASE_URL') ?? '').trim();
    // Prefer auto-injected `SUPABASE_SERVICE_ROLE_KEY`; `APP_SUPABASE_SERVICE_ROLE_KEY` only as fallback
    // (see verify-redemption — APP_* must not override a valid reserved secret).
    const serviceKey =
      (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim() ||
      (Deno.env.get('APP_SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
    if (!supabaseUrl) {
      console.error('[extend-pass] SUPABASE_URL is missing');
      return errorResponse('Server configuration error: missing Supabase URL', 500);
    }
    if (!serviceKey) {
      console.error('[extend-pass] missing SUPABASE_SERVICE_ROLE_KEY (or APP_SUPABASE_SERVICE_ROLE_KEY fallback)');
      return errorResponse('Server configuration error: missing service role key', 500);
    }
    const supabase = createClient(supabaseUrl, serviceKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return errorResponse('Invalid or expired session', 401);
    }

    const body = await req.json().catch(() => ({}));
    const userId = body?.user_id ?? user.id;

    if (userId !== user.id) {
      return errorResponse('Cannot extend pass for another user', 403);
    }

    const today = new Date().toISOString().split('T')[0];

    const { data: passes, error: fetchErr } = await supabase
      .from('passes')
      .select('id, pass_type, valid_from, valid_until, expires_at, max_people, share_bonus_applied')
      .eq('user_id', userId)
      .eq('active', true)
      .gte('valid_until', today)
      .order('id', { ascending: false })
      .limit(1);

    if (fetchErr) {
      console.error('[extend-pass] fetch passes error:', fetchErr);
      return errorResponse('Failed to load pass', 500);
    }

    const pass = passes?.[0];
    if (!pass) {
      // Allow pre-purchase share: store a "share bonus unlocked" flag on the user's profile.
      // This will be consumed on the next pass purchase (paypal-capture / process-card-payment).
      const { error: upErr } = await supabase
        .from('user_profiles')
        .update({ share_bonus_unlocked: true, updated_at: new Date().toISOString() })
        .eq('user_id', userId);

      if (upErr) {
        console.error('[extend-pass] prepurchase update user_profiles error:', upErr);
        return errorResponse('No active pass found (and failed to record share bonus). Please try again later.', 500);
      }

      return jsonResponse({
        success: true,
        prepurchase: true,
        message: 'Share bonus unlocked. It will be applied automatically when you purchase your next pass.',
      });
    }

    if (pass.share_bonus_applied === true) {
      return new Response(
        JSON.stringify({ success: false, already_claimed: true, error: 'Share bonus already claimed' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const bonus = shareBonusForPassRow(pass);
    if (bonus.extraPeople === 0 && bonus.extraDays === 0) {
      return jsonResponse({ success: true, bonus: { days: 0, people: 0, kids: 0 } });
    }

    const currentMax = typeof pass.max_people === 'number' ? pass.max_people : 4;
    const newMaxPeople = currentMax + bonus.extraPeople;
    const validUntil = pass.valid_until ?? today;
    const newValidUntil = bonus.extraDays > 0 ? addCalendarDaysUtc(validUntil, bonus.extraDays) : validUntil;
    const newExpiresAt = endOfDayISO(newValidUntil);

    const updates: Record<string, any> = {
      share_bonus_applied: true,
      max_people: newMaxPeople,
      valid_until: newValidUntil,
      expires_at: newExpiresAt,
    };

    // Atomic apply: ensure we only update if bonus wasn't already applied.
    // This prevents double-claim in a race if the button is tapped twice quickly.
    const { data: updated, error: updateErr } = await supabase
      .from('passes')
      .update(updates)
      .eq('id', pass.id)
      .eq('share_bonus_applied', false)
      .select('id, pass_type, valid_until, expires_at, max_people, share_bonus_applied')
      .maybeSingle();

    if (updateErr) {
      console.error('[extend-pass] update error:', updateErr);
      return errorResponse('Failed to apply bonus: ' + updateErr.message, 500);
    }
    if (!updated) {
      // Another request likely applied it first.
      return new Response(
        JSON.stringify({ success: false, already_claimed: true, error: 'Share bonus already claimed' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return jsonResponse({
      success: true,
      bonus: {
        days: bonus.extraDays,
        people: bonus.extraPeople,
        kids: 0,
      },
      pass: updated,
    });
  } catch (err: any) {
    console.error('[extend-pass]', err);
    return errorResponse(err?.message ?? 'Extend pass failed', 500);
  }
});
