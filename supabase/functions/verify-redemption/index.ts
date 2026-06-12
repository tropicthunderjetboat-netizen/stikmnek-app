// deno-lint-ignore-file no-explicit-any
/**
 * verify-redemption Edge Function
 *
 * Actions:
 * - check_voucher_validity
 *   - Decodes QR payload and checks if the pass is active and within valid dates.
 *   - Returns a ValidityResult-like object used by QRScanner.
 *
 * - verify_and_redeem
 *   - Performs the same checks and, if eligible, inserts a row into public.redemptions.
 *   - Returns a RedemptionResult-like object with basic receipt info.
 *
 * Pass validity uses strict calendar dates (valid_from / valid_until) vs UTC "today";
 * see the block comment before date checks — no in-session grace past the last valid day.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getSafeCorsHeaders } from '../_shared/cors.ts';

/** Pass QR encodes only the pass row UUID; legacy JSON payloads still accepted for migration. */
const PASS_ID_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parsePassIdFromQrData(rawQr: string): string | null {
  const t = rawQr.trim().replace(/^\uFEFF/, '');
  if (PASS_ID_UUID_RE.test(t)) return t;
  // Some scanners prefix/suffix whitespace or non-UUID noise — extract first UUID substring.
  const embedded = t.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  );
  if (embedded && PASS_ID_UUID_RE.test(embedded[0])) return embedded[0];
  try {
    const j = JSON.parse(t) as { passId?: unknown };
    if (j && typeof j.passId === 'string' && PASS_ID_UUID_RE.test(j.passId.trim())) {
      return j.passId.trim();
    }
  } catch {
    /* not JSON */
  }
  return null;
}

/**
 * AppContext treats `user_profiles.user_type` as the source of truth when it disagrees with `role`.
 * Some business accounts historically ended up with `user_type = 'business'` but `role` still `tourist`.
 * Redemption must follow the same rule or legitimate owners get HTTP 403 `scanner_role`.
 */
function resolveScannerAppRole(profile: { role?: unknown; user_type?: unknown } | null | undefined): string | null {
  if (!profile) return null;
  const ut = String(profile.user_type ?? '').trim().toLowerCase();
  const r = String(profile.role ?? '').trim().toLowerCase();
  const preferred = ut || r;
  if (preferred === 'business' || preferred === 'admin' || preferred === 'tourist') return preferred;
  return null;
}

function normalizeDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().split('T')[0];
}

/** Current UTC calendar date (YYYY-MM-DD). Used with normalized pass dates for strict validity — see pass lookup comment block. */
function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

function compareDates(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

// ─── Party + pricing (mirrors src/lib/redemptionSavings.ts & pricingTiers.ts) ───

type PartyCounts = { adults: number; children: number; infants: number };

function partyFromProfileRow(row: {
  num_adults?: number | null;
  num_children?: number | null;
  num_infants?: number | null;
} | null | undefined): PartyCounts {
  if (!row) return { adults: 1, children: 0, infants: 0 };
  const aRaw = row.num_adults;
  const cRaw = row.num_children;
  const iRaw = row.num_infants;
  if (aRaw == null && cRaw == null && iRaw == null) {
    return { adults: 1, children: 0, infants: 0 };
  }
  return {
    adults: Math.max(0, Math.floor(Number(aRaw ?? 0))),
    children: Math.max(0, Math.floor(Number(cRaw ?? 0))),
    infants: Math.max(0, Math.floor(Number(iRaw ?? 0))),
  };
}

function totalPartyPax(p: PartyCounts): number {
  return p.adults + p.children + p.infants;
}

/**
 * Optional merchant override for this visit (savings + stored VT amounts).
 * Prefer activityAdults / activityChildren / activityInfants so tiered per-person rates match.
 * Legacy: activityPax6Plus only → all ages 6+ billed as adults (fine for flat per-person deals).
 */
function resolveActivityRedeemParty(
  body: Record<string, unknown>,
  profileParty: PartyCounts,
  passTypeStr: string,
  passMaxPeople: number | null,
  totalPartySize: number,
): { party: PartyCounts; error: string | null; reason?: string } {
  const profileSixPlus = Math.max(0, profileParty.adults + profileParty.children);
  const profileTotal = Math.max(1, totalPartySize);
  const passCap = passMaxPeople != null && passMaxPeople > 0 ? passMaxPeople : null;

  const maxSixPlusAllowed = (): number => {
    if (passCap != null) return passCap;
    return passTypeStr === 'dynamic' ? Math.max(1, profileSixPlus) : profileTotal;
  };

  const maxTotalPaxAllowed = (): number => {
    if (passCap != null) return passCap;
    return profileTotal;
  };

  const rawA = body.activityAdults ?? body.activity_adults;
  const rawC = body.activityChildren ?? body.activity_children;
  const rawI = body.activityInfants ?? body.activity_infants;

  const activityFieldPresent = (v: unknown) => v !== undefined && v !== null && v !== '';
  const explicitSent =
    activityFieldPresent(rawA) || activityFieldPresent(rawC) || activityFieldPresent(rawI);

  if (explicitSent) {
    const a = Math.max(0, Math.floor(Number(rawA ?? 0)));
    const c = Math.max(0, Math.floor(Number(rawC ?? 0)));
    const inf = Math.max(0, Math.floor(Number(rawI ?? 0)));
    if (a + c < 1) {
      return {
        party: profileParty,
        error: 'This visit needs at least one person ages 6+ (adults or children).',
        reason: 'invalid_activity_party',
      };
    }
    const mx6 = maxSixPlusAllowed();
    if (a + c > mx6) {
      return {
        party: profileParty,
        error:
          passTypeStr === 'dynamic'
            ? `Ages 6+ on this visit (${a + c}) cannot exceed ${mx6} (pass limit).`
            : `People ages 6+ on this visit (${a + c}) cannot exceed ${mx6} (pass limit).`,
        reason: 'activity_pax_over_cap',
      };
    }
    if (inf > profileParty.infants) {
      return {
        party: profileParty,
        error: `Infants on this visit (${inf}) cannot exceed ${profileParty.infants} on the tourist profile.`,
        reason: 'activity_infants_over_profile',
      };
    }
    if (passTypeStr !== 'dynamic') {
      const mtot = maxTotalPaxAllowed();
      if (a + c + inf > mtot) {
        return {
          party: profileParty,
          error: `Total people on this visit (${a + c + inf}) cannot exceed ${mtot} (pass limit).`,
          reason: 'activity_total_over_cap',
        };
      }
    }
    return { party: { adults: a, children: c, infants: inf }, error: null };
  }

  const raw = body.activityPax6Plus ?? body.activity_pax_6_plus;
  if (raw === undefined || raw === null || raw === '') {
    return { party: profileParty, error: null };
  }
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 1) {
    return {
      party: profileParty,
      error: 'Invalid activity party size (activityPax6Plus must be a positive integer).',
      reason: 'invalid_activity_pax',
    };
  }
  const maxAllowed = maxSixPlusAllowed();
  if (n > maxAllowed) {
    return {
      party: profileParty,
      error:
        passTypeStr === 'dynamic'
          ? `This visit cannot include more than ${maxAllowed} people ages 6+ (pass limit).`
          : `This visit cannot include more than ${maxAllowed} people ages 6+ (pass limit).`,
      reason: 'activity_pax_over_cap',
    };
  }
  return { party: { adults: n, children: 0, infants: 0 }, error: null };
}

/** Enforce redemption only when > 0; null = treat as unlimited (legacy row or missing column). */
function resolvePassMaxPeople(passRow: { max_people?: unknown }): number | null {
  const m = passRow.max_people;
  if (typeof m === 'number' && Number.isFinite(m) && m > 0) return Math.floor(m);
  return null;
}

type PricingTierInput = {
  label: string;
  min_pax: number;
  max_pax: number | null;
  original_price_vt: number;
  deal_price_vt: number;
};

function pricingTiersFromDb(value: unknown): PricingTierInput[] {
  if (!value || !Array.isArray(value)) return [];
  const out: PricingTierInput[] = [];
  for (const row of value) {
    if (!row || typeof row !== 'object') continue;
    const o = row as Record<string, unknown>;
    const min = Math.max(0, Math.floor(Number(o.min_pax ?? 0) || 0));
    const maxRaw = o.max_pax;
    const max =
      maxRaw === null || maxRaw === undefined || maxRaw === ''
        ? null
        : Math.max(0, Math.floor(Number(maxRaw) || 0));
    out.push({
      label: String(o.label ?? '').trim(),
      min_pax: min,
      max_pax: max,
      original_price_vt: Math.max(0, Number(o.original_price_vt) || 0),
      deal_price_vt: Math.max(0, Number(o.deal_price_vt) || 0),
    });
  }
  return out;
}

function computeTieredBookingTotals(
  tiers: PricingTierInput[],
  adults: number,
  children: number,
  infants: number,
): { totalStandard: number; totalDeal: number } {
  const a = Math.max(0, adults);
  const ch = Math.max(0, children);
  const inf = Math.max(0, infants);
  const usable = tiers.filter((t) => t.original_price_vt > 0 && t.deal_price_vt >= 0);
  if (usable.length === 0) return { totalStandard: 0, totalDeal: 0 };

  if (usable.length === 1) {
    const t = usable[0];
    const payingPax = Math.max(1, a + ch);
    return {
      totalStandard: payingPax * t.original_price_vt,
      totalDeal: payingPax * t.deal_price_vt,
    };
  }

  const low = (s: string) => s.toLowerCase();
  const pick = (pred: (label: string) => boolean, indexFallback: number): PricingTierInput => {
    const found = usable.find((t) => pred(low(t.label)));
    if (found) return found;
    return usable[Math.min(indexFallback, usable.length - 1)] ?? usable[0];
  };

  const tAdult = pick((l) => /adult|13\+|adulte|senior|grown/.test(l), 0);
  const tChild = pick((l) => /child|kid|enfant|pikinini|minor|2-12|5-12|6-12|7-12|school/.test(l), 1);
  const infantTier = usable.find((t) =>
    /infant|baby|b[eé]b[eé]|0-4|0–4|toddler|smol/.test(low(t.label)),
  );
  const tInfant: PricingTierInput = infantTier ?? {
    label: '',
    min_pax: 0,
    max_pax: null,
    original_price_vt: 0,
    deal_price_vt: 0,
  };

  return {
    totalStandard:
      a * tAdult.original_price_vt + ch * tChild.original_price_vt + inf * tInfant.original_price_vt,
    totalDeal: a * tAdult.deal_price_vt + ch * tChild.deal_price_vt + inf * tInfant.deal_price_vt,
  };
}

function hasUsableTieredPricing(pricingTiers: unknown): boolean {
  const tiers = pricingTiersFromDb(pricingTiers);
  return tiers.some(
    (t) =>
      t.original_price_vt > 0 &&
      t.deal_price_vt >= 0 &&
      t.deal_price_vt < t.original_price_vt,
  );
}

function categoryUsesPerUnitPricing(category: string): boolean {
  const c = (category || '').toLowerCase();
  return c === 'shopping' || c === 'transportation' || c === 'transport';
}

function computeRedemptionSavings(
  biz: { pricing_tiers: unknown; original_price: unknown; deal_price: unknown },
  party: PartyCounts,
  opts?: { category?: string; itemQuantity?: number },
): {
  savedAmount: number;
  totalStandard: number;
  totalDeal: number;
  savingsLine: string;
  isTiered: boolean;
  unitSavings: number;
  itemQuantity?: number;
} {
  if (hasUsableTieredPricing(biz.pricing_tiers)) {
    const tiers = pricingTiersFromDb(biz.pricing_tiers);
    const { totalStandard, totalDeal } = computeTieredBookingTotals(
      tiers,
      party.adults,
      party.children,
      party.infants,
    );
    const ts = Math.round(totalStandard);
    const td = Math.round(totalDeal);
    const saved = Math.max(0, ts - td);
    const savingsLine =
      `Party: ${party.adults} adult(s)` +
      (party.children ? `, ${party.children} child(ren)` : '') +
      (party.infants ? `, ${party.infants} infant(s)` : '') +
      ` — ${ts.toLocaleString()} VT standard → ${td.toLocaleString()} VT StikmNek (${saved.toLocaleString()} VT saved)`;
    return { savedAmount: saved, totalStandard: ts, totalDeal: td, savingsLine, isTiered: true, unitSavings: 0 };
  }

  const o = Number(biz.original_price);
  const d = Number(biz.deal_price);
  const perUnit = categoryUsesPerUnitPricing(String(opts?.category ?? ''));
  const billCount = perUnit
    ? Math.max(1, Math.min(99, Math.floor(Number(opts?.itemQuantity) || 1)))
    : Math.max(1, party.adults + party.children);
  if (!Number.isFinite(o) || !Number.isFinite(d) || o <= d) {
    return {
      savedAmount: 0,
      totalStandard: 0,
      totalDeal: 0,
      savingsLine: '—',
      isTiered: false,
      unitSavings: 0,
      itemQuantity: perUnit ? billCount : undefined,
    };
  }
  const unit = Math.round(o - d);
  const saved = Math.max(0, unit * billCount);
  const cat = String(opts?.category ?? '').toLowerCase();
  const isTransport = cat === 'transportation' || cat === 'transport';
  const perUnitWord = isTransport
    ? (billCount === 1 ? 'trip/day' : 'trips/days')
    : (billCount === 1 ? 'item' : 'items');
  const savingsLine = perUnit
    ? `${unit.toLocaleString()} VT × ${billCount} ${perUnitWord} = ${saved.toLocaleString()} VT total saved`
    : `${unit.toLocaleString()} VT × ${billCount} ${billCount === 1 ? 'person' : 'people'} = ${saved.toLocaleString()} VT total saved`;
  return {
    savedAmount: saved,
    totalStandard: Math.round(o * billCount),
    totalDeal: Math.round(d * billCount),
    savingsLine,
    isTiered: false,
    unitSavings: unit,
    itemQuantity: perUnit ? billCount : undefined,
  };
}

const BEARER_PREFIX = /^Bearer\s+/i;

/**
 * When `deal_amount_vt` exists in code but the project DB or PostgREST schema cache is not updated yet,
 * inserts fail with a message referencing this column. Retry without it so redemptions still work;
 * owner analytics for VT deal volume stay empty until migration + schema reload.
 */
function isRedemptionsDealAmountColumnUnavailable(err: { message?: string; code?: string } | null): boolean {
  const msg = String(err?.message ?? '').toLowerCase();
  if (!msg.includes('deal_amount_vt')) return false;
  return (
    msg.includes('schema cache') ||
    msg.includes('could not find') ||
    msg.includes('does not exist') ||
    msg.includes('unknown column')
  );
}

Deno.serve(async (req) => {
  const corsHeaders = getSafeCorsHeaders(req);
  const jsonResponse = (data: object, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  const errorResponse = (message: string, status = 400, extra?: Record<string, unknown>) =>
    jsonResponse(
      {
        success: false,
        error: message,
        errorCode: status,
        ...extra,
      },
      status,
    );

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return errorResponse('Missing Authorization header', 401);
    }

    const supabaseUrl = (Deno.env.get('SUPABASE_URL') ?? '').trim();
    // Service role key resolution:
    // - Supabase auto-injects `SUPABASE_SERVICE_ROLE_KEY` at runtime — prefer it first so a mistaken
    //   `APP_SUPABASE_SERVICE_ROLE_KEY` (e.g. anon key pasted) cannot override the correct key.
    // - `APP_SUPABASE_SERVICE_ROLE_KEY` is only a fallback for rare Dashboard cases where the reserved
    //   secret cannot be fixed and you must supply the service_role JWT manually under another name.
    const serviceKey =
      (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim() ||
      (Deno.env.get('APP_SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
    // Dashboard secret bug workaround:
    // Some projects cannot edit/delete reserved `SUPABASE_*` secrets in the Dashboard.
    // Prefer a non-reserved secret name for the anon key (used ONLY to validate caller JWT):
    //   APP_SUPABASE_ANON_KEY = <project anon public key>
    // Keep legacy fallbacks for safety.
    const anonKey =
      (Deno.env.get('APP_SUPABASE_ANON_KEY') ?? '').trim() ||
      (Deno.env.get('SUPABASE_ANON_KEY') ?? '').trim() ||
      (Deno.env.get('SUPABASE_ANON_KEY_PUBLIC') ?? '').trim();
    if (!supabaseUrl || !serviceKey) {
      console.error(
        '[verify-redemption] Missing SUPABASE_URL or service role key (SUPABASE_SERVICE_ROLE_KEY / APP_SUPABASE_SERVICE_ROLE_KEY) — cannot read public.passes',
      );
      return errorResponse('Server configuration error', 500, {
        reason: 'missing_supabase_secrets',
      });
    }

    // Use ANON key for validating caller JWT (auth context).
    // Do NOT fall back to service role here—misconfiguration will surface as "Invalid JWT" and block scanning.
    if (!anonKey) {
      console.error('[verify-redemption] APP_SUPABASE_ANON_KEY / SUPABASE_ANON_KEY missing — cannot validate JWT');
      return errorResponse('Server configuration error', 500, {
        reason: 'missing_supabase_anon_key',
      });
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Service role bypasses RLS; public.passes has RLS enabled (see database-setup.sql).
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const token = authHeader.replace(BEARER_PREFIX, '').trim();
    const { data: { user: scannerUser }, error: authError } = await authClient.auth.getUser(token);
    if (authError || !scannerUser) {
      return errorResponse('Missing or invalid authentication token.', 401, {
        reason: 'auth_invalid',
        authError: authError?.message ?? null,
      });
    }

    // ─── AUTHZ: Ensure scanner is a business owner or admin ───
    // NOTE: Do not use `.maybeSingle()` here — if duplicate `user_profiles` rows exist for the same
    // `user_id`, PostgREST returns PGRST116 and `profileErr` is set, which previously surfaced as a
    // misleading HTTP 403 `scanner_role` even when a valid business row exists.
    let profileRows: { role?: unknown; user_type?: unknown }[] | null = null;
    let profileErr: { message?: string; code?: string; details?: string; hint?: string } | null = null;

    {
      const r1 = await supabase
        .from('user_profiles')
        .select('role, user_type')
        .eq('user_id', scannerUser.id)
        .limit(5);
      profileRows = r1.data as typeof profileRows;
      profileErr = r1.error as typeof profileErr;
    }

    if (profileErr) {
      const pe = profileErr;
      const code = String(pe?.code ?? '');
      const msg = String(pe?.message ?? '').toLowerCase();
      // Prod DBs that predate migration `20260403120000_user_profiles_name_full_name_user_type.sql`
      // do not have `user_type` — PostgREST returns 42703 / "column ... does not exist".
      const missingUserTypeColumn =
        code === '42703' || (msg.includes('user_type') && msg.includes('does not exist'));
      if (missingUserTypeColumn) {
        console.warn('[verify-redemption] user_profiles.user_type missing — retrying role-only select');
        const r2 = await supabase
          .from('user_profiles')
          .select('role')
          .eq('user_id', scannerUser.id)
          .limit(5);
        profileRows = r2.data as typeof profileRows;
        profileErr = r2.error as typeof profileErr;
      }
    }

    if (profileErr) {
      const pe = profileErr;
      const msgFull = String(pe?.message ?? '');
      const msgLower = msgFull.toLowerCase();
      // Runtime-confirmed failure mode: PostgREST returns "Invalid API key" when the Edge Function
      // `createClient(SUPABASE_URL, serviceKey)` uses a wrong/non-service key (common secret typo).
      if (msgLower.includes('invalid api key') || msgLower.includes('invalid jwt')) {
        console.error('[verify-redemption] DB client rejected API key (check Edge secrets)', msgFull);
        return errorResponse(
          'Edge Function service role key rejected by Supabase (Invalid API key). Prefer the auto-injected SUPABASE_SERVICE_ROLE_KEY; remove a wrong APP_SUPABASE_SERVICE_ROLE_KEY secret if set, or set APP_SUPABASE_SERVICE_ROLE_KEY to the real service_role JWT from Project Settings → API (same project as SUPABASE_URL).',
          500,
          {
            reason: 'invalid_edge_service_role_key',
            profileError: msgFull,
          },
        );
      }
      console.error(
        '[verify-redemption] scanner profile query failed',
        JSON.stringify({
          code: pe?.code ?? null,
          message: pe?.message ?? null,
          details: pe?.details ?? null,
          hint: pe?.hint ?? null,
        }),
      );
      return errorResponse('Scanner profile lookup failed', 500, {
        reason: 'scanner_profile_query_failed',
        profileError: pe?.message ?? null,
        postgresCode: pe?.code ?? null,
        postgresMessage: pe?.details ?? pe?.message ?? null,
      });
    }

    const rowCount = profileRows?.length ?? 0;
    const scannerProfile = (profileRows?.[0] ?? null) as { role?: unknown; user_type?: unknown } | null;
    if (rowCount > 1) {
      console.warn('[verify-redemption] duplicate user_profiles rows for scanner user_id:', scannerUser.id, {
        rowCount,
      });
    }

    if (!scannerProfile) {
      return errorResponse('Not authorized to verify passes', 403, {
        reason: 'scanner_no_profile',
        scannerUserId: scannerUser.id,
      });
    }

    const scannerRole = resolveScannerAppRole(scannerProfile);
    if (!scannerRole || !['business', 'admin'].includes(scannerRole)) {
      return errorResponse('Not authorized to verify passes', 403, {
        reason: 'scanner_role',
        role: scannerRole ?? null,
        profileRole: scannerProfile?.role ?? null,
        profileUserType: scannerProfile?.user_type ?? null,
        duplicateProfileRows: rowCount > 1 ? rowCount : null,
      });
    }

    const body = await req.json().catch(() => ({}));
    const action = body?.action;
    const rawQr = body?.qrData;
    const businessId = body?.businessId;
    const businessName = body?.businessName ?? '';

    if (!action) return errorResponse('Missing action', 400);
    if (!rawQr || typeof rawQr !== 'string') return errorResponse('Missing qrData', 400);

    const passId = parsePassIdFromQrData(rawQr);
    if (!passId) {
      return errorResponse(
        'Invalid QR payload — expected a pass UUID (use the StikmNek app QR or paste the pass code).',
        400,
      );
    }

    const today = getTodayDate();

    // Source of truth: public.passes.id (UUID) from QR — service role reads bypass RLS.
    const { data: pass, error: passErr } = await supabase
      .from('passes')
      .select('id, user_id, pass_type, active, valid_from, valid_until, expires_at, purchased_at, max_people')
      .eq('id', passId)
      .maybeSingle();

    if (passErr) {
      console.error('[verify-redemption] passes table lookup error:', passErr.code, passErr.message, passErr);
      return errorResponse(
        passErr.message?.includes('JWT') || passErr.message?.includes('permission')
          ? 'Database access error — check Edge Function secrets (SUPABASE_SERVICE_ROLE_KEY)'
          : 'Pass lookup failed',
        500,
        {
          reason: 'passes_query_failed',
          postgresCode: passErr.code ?? null,
          postgresMessage: passErr.message ?? null,
        },
      );
    }
    if (!pass) {
      console.error('[verify-redemption] no row in passes for id:', passId);
      return errorResponse('Pass not found for this QR code', 404, {
        reason: 'pass_not_found',
        passId,
      });
    }

    const touristUserId = pass.user_id as string;

    // ═══════════════════════════════════════════════════════════════════════════
    // PASS VALIDITY — STRICT CALENDAR-DATE ENFORCEMENT (product policy)
    // ═══════════════════════════════════════════════════════════════════════════
    // Pass validity is determined ONLY by calendar dates (YYYY-MM-DD), not by clock
    // time within a day or by "in-session" activity (e.g. a multi-hour visit).
    //
    // - valid_from / valid_until are normalized to ISO date strings and compared to
    //   "today" from getTodayDate() — the current UTC calendar date. Keep purchase
    //   and redemption using the same date convention to avoid off-by-one issues.
    //
    // - Expiration: redemption is blocked when today's date is STRICTLY AFTER
    //   valid_until (passStatus = date_range_expired). The last valid calendar day is
    //   still valid for the whole UTC date; the first moment of the NEXT calendar day
    //   is out of range. There is NO grace period that extends validity past
    //   valid_until for ongoing redemptions, meals, or bookings that cross midnight.
    //
    // - This strict boundary is intentional (predictable pass lifecycle). If UX copy
    //   promises otherwise, align product/docs — do not add implicit grace here
    //   without an explicit product change.
    // ═══════════════════════════════════════════════════════════════════════════

    const validFrom = normalizeDate(pass.valid_from);
    const validUntil = normalizeDate(pass.valid_until);
    const todayStr = today;

    let passStatus: string = 'active';
    let canRedeem = true;
    let message = 'Pass is active and can be redeemed.';

    if (!pass.active) {
      passStatus = 'inactive';
      canRedeem = false;
      message = 'This pass is inactive.';
    } else if (!validFrom || !validUntil) {
      passStatus = 'no_dates';
      canRedeem = false;
      message = 'Pass dates are not set.';
    } else if (compareDates(todayStr, validFrom) < 0) {
      passStatus = 'not_yet_valid';
      canRedeem = false;
      message = 'Pass is not yet valid.';
    } else if (compareDates(todayStr, validUntil) > 0) {
      passStatus = 'date_range_expired';
      canRedeem = false;
      message = 'Pass has expired.';
    }

    // Load tourist profile (party size for savings math + display)
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('name, display_name, email, num_adults, num_children, num_infants')
      .eq('user_id', touristUserId)
      .maybeSingle();

    const party = partyFromProfileRow(profile);
    const totalPartySize = totalPartyPax(party);
    const passMaxPeople = resolvePassMaxPeople(pass as { max_people?: unknown });
    const passTypeStr = String((pass as { pass_type?: unknown }).pass_type ?? '');
    /** Dynamic passes: capacity applies to ages 6+ (adults + children); infants free. Legacy passes: all pax. */
    const headcountAgainstPass =
      passTypeStr === 'dynamic' ? party.adults + party.children : totalPartySize;
    const profileSixPlus = Math.max(0, party.adults + party.children);

    // ─── Party size vs pass capacity (max_people) — server-side enforcement ───
    if (canRedeem && passMaxPeople !== null && headcountAgainstPass > passMaxPeople) {
      passStatus = 'party_exceeds_pass_capacity';
      canRedeem = false;
      message =
        passTypeStr === 'dynamic'
          ? `People ages 6+ in profile (${headcountAgainstPass}) exceed this pass (${passMaxPeople} max). ` +
            'Children under 6 may accompany the group for free. Reduce adults/children in profile or buy a larger pass.'
          : `Party size (${totalPartySize}) exceeds this pass capacity (max ${passMaxPeople}). ` +
            'The tourist should reduce group size in their profile or purchase a pass with a higher limit.';
    }

    const touristName =
      profile?.name ||
      profile?.display_name ||
      (profile?.email ? profile.email.split('@')[0] : null) ||
      'Tourist';
    const touristEmail = profile?.email || '';

    // Redemption history (per business & pass)
    let alreadyRedeemedToday = false;
    /** Count of redemptions at this venue today (local calendar window). Informational only — same-day repeat scans are allowed. */
    let redemptionsTodayCount = 0;
    let totalRedemptionsAtBusiness = 0;
    let lastRedemptions: string[] = [];

    if (businessId) {
      // If scanner is a business user, ensure the businessId belongs to them.
      if (scannerRole === 'business') {
        const { data: ownedBusiness, error: bizErr } = await supabase
          .from('businesses')
          .select('id')
          .eq('id', businessId)
          .eq('owner_id', scannerUser.id)
          .maybeSingle();

        if (bizErr || !ownedBusiness) {
          return errorResponse('You are not authorized to scan for this business', 403, {
            reason: 'business_not_owned',
            businessId,
          });
        }
      }

      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);

      const { data: todayRedemptions } = await supabase
        .from('redemptions')
        .select('id')
        .eq('user_id', touristUserId)
        .eq('business_id', businessId)
        .gte('redeemed_at', startOfDay.toISOString())
        .lte('redeemed_at', endOfDay.toISOString());

      redemptionsTodayCount = todayRedemptions?.length ?? 0;
      alreadyRedeemedToday = redemptionsTodayCount > 0;

      const { count, data: recent } = await supabase
        .from('redemptions')
        .select('redeemed_at', { count: 'exact' })
        .eq('user_id', touristUserId)
        .eq('business_id', businessId)
        .order('redeemed_at', { ascending: false })
        .limit(5);

      totalRedemptionsAtBusiness = count ?? (recent?.length ?? 0);
      lastRedemptions = (recent ?? []).map((r: any) => r.redeemed_at as string);
    }

    if (action === 'check_voucher_validity') {
      const out = {
        success: true,
        action: 'validity_check',
        canRedeem,
        tourist: { name: touristName, email: touristEmail },
        party: {
          adults: party.adults,
          children: party.children,
          infants: party.infants,
        },
        pass: {
          id: pass.id,
          type: pass.pass_type,
          status: passStatus,
          message,
          active: pass.active,
          validFrom,
          validUntil,
          expiresAt: pass.expires_at,
          purchasedAt: pass.purchased_at,
          maxPeople: passMaxPeople,
          /** People ages 6+ this pass was purchased for (same as maxPeople when set). */
          partySize: passMaxPeople,
          profilePartySixPlus: profileSixPlus,
          totalPartySize,
          headcountAgainstPass,
        },
        voucher: null,
        redemptionHistory: {
          alreadyRedeemedToday,
          redemptionsTodayCount,
          totalRedemptionsAtBusiness,
          lastRedemptions,
        },
      };
      return jsonResponse(out, 200);
    }

    if (action === 'verify_and_redeem') {
      if (!businessId) {
        return errorResponse('Missing businessId for redemption', 400);
      }

      if (!canRedeem) {
        return jsonResponse(
          {
            success: false,
            error: message,
            status: passStatus,
            maxPeople: passMaxPeople,
            partySize: passMaxPeople,
            profilePartySixPlus: profileSixPlus,
            totalPartySize,
            headcountAgainstPass,
          },
          200
        );
      }

      const discountLabelRaw = body?.discount ?? body?.discountLabel ?? '';
      const discount_label =
        typeof discountLabelRaw === 'string' ? discountLabelRaw.trim() : String(discountLabelRaw ?? '').trim();

      const { data: bizRow, error: bizLoadErr } = await supabase
        .from('businesses')
        .select('name, pricing_tiers, original_price, deal_price, owner_id')
        .eq('id', businessId)
        .maybeSingle();

      if (bizLoadErr || !bizRow) {
        console.error('[verify-redemption] business load:', bizLoadErr);
        return errorResponse('Business not found', 404, {
          reason: 'business_not_found',
          businessId,
          postgresCode: bizLoadErr?.code ?? null,
        });
      }

      if (scannerRole === 'business' && String((bizRow as { owner_id?: string }).owner_id ?? '') !== String(scannerUser.id)) {
        return errorResponse('You are not authorized to redeem for this business', 403, {
          reason: 'redeem_business_forbidden',
          businessId,
        });
      }

      // Prefer per-listing pricing from `business_offerings` when the client sends a UUID
      // (QR flow); legacy rows redeem against profile `businesses` only.
      const rawOfferingId = (body as Record<string, unknown>)?.offeringId ??
        (body as Record<string, unknown>)?.offering_id;
      const offeringIdCandidate =
        typeof rawOfferingId === 'string' ? rawOfferingId.trim() : '';
      let pricingRow: { pricing_tiers: unknown; original_price: unknown; deal_price: unknown } = bizRow;
      let listingCategory = String((bizRow as { category?: string }).category ?? '');
      let resolvedOfferingId: string | null = null;
      if (offeringIdCandidate && PASS_ID_UUID_RE.test(offeringIdCandidate)) {
        const { data: offRow, error: offErr } = await supabase
          .from('business_offerings')
          .select('id, business_id, pricing_tiers, original_price, deal_price, tags')
          .eq('id', offeringIdCandidate)
          .maybeSingle();
        if (!offErr && offRow && String((offRow as { business_id?: string }).business_id ?? '') === String(businessId)) {
          pricingRow = offRow as typeof pricingRow;
          resolvedOfferingId = String((offRow as { id?: string }).id ?? offeringIdCandidate);
          const tags = (offRow as { tags?: unknown }).tags;
          const tag0 = Array.isArray(tags) && tags.length ? String(tags[0]) : '';
          if (tag0) listingCategory = tag0;
        }
      }

      const bodyObj = body as Record<string, unknown>;
      const activityResolved = resolveActivityRedeemParty(
        bodyObj,
        party,
        passTypeStr,
        passMaxPeople,
        totalPartySize,
      );
      if (activityResolved.error) {
        return errorResponse(activityResolved.error, 400, {
          reason: activityResolved.reason ?? 'bad_activity_pax',
        });
      }
      const redeemParty = activityResolved.party;

      const perUnit = categoryUsesPerUnitPricing(listingCategory);
      let itemQuantity: number | undefined;
      if (perUnit) {
        const rawQty = bodyObj.itemQuantity ?? bodyObj.item_quantity;
        const q = Math.floor(Number(rawQty));
        if (!Number.isFinite(q) || q < 1 || q > 99) {
          const isTransport = listingCategory === 'transportation' || listingCategory === 'transport';
          return errorResponse(
            isTransport
              ? 'Enter how many trips or rental days (1–99) for this transportation redemption.'
              : 'Enter how many items (1–99) for this shopping redemption.',
            400,
            { reason: 'invalid_item_quantity' },
          );
        }
        itemQuantity = q;
      }

      // Server-authoritative savings (ignore client savedAmount to prevent tampering)
      const computed = computeRedemptionSavings(pricingRow, redeemParty, {
        category: listingCategory,
        itemQuantity,
      });
      const savedAmount = computed.savedAmount;
      const dealAmountVt = Math.max(0, Math.round(Number(computed.totalDeal) || 0));

      const insertRow: Record<string, unknown> = {
        user_id: touristUserId,
        business_id: businessId,
        pass_id: pass.id,
        saved_amount: savedAmount,
        deal_amount_vt: dealAmountVt,
      };
      if (resolvedOfferingId) insertRow.offering_id = resolvedOfferingId;
      if (discount_label) insertRow.discount_label = discount_label;
      if (itemQuantity != null) insertRow.item_quantity = itemQuantity;

      const selectWithDeal =
        'id, redeemed_at, saved_amount, deal_amount_vt, discount_label' as const;
      const selectLegacy = 'id, redeemed_at, saved_amount, discount_label' as const;

      const firstAttempt = await supabase
        .from('redemptions')
        .insert(insertRow)
        .select(selectWithDeal)
        .single();

      let redemption: Record<string, unknown> | null =
        (firstAttempt.data as Record<string, unknown> | null) ?? null;
      let redErr = firstAttempt.error;

      if (redErr && isRedemptionsDealAmountColumnUnavailable(redErr)) {
        console.warn(
          '[verify-redemption] deal_amount_vt not available on redemptions (apply migration + reload PostgREST schema); retrying insert without it',
        );
        const { deal_amount_vt: _omit, ...insertWithoutDeal } = insertRow;
        const retry = await supabase
          .from('redemptions')
          .insert(insertWithoutDeal)
          .select(selectLegacy)
          .single();
        redemption = (retry.data as Record<string, unknown> | null) ?? null;
        redErr = retry.error;
      }

      if (redErr || !redemption) {
        console.error('[verify-redemption] insert redemption error:', redErr);
        return errorResponse('Failed to record redemption', 500, {
          reason: 'redemption_insert_failed',
          postgresCode: redErr?.code ?? null,
          postgresMessage: redErr?.message ?? null,
        });
      }

      const { data: bizNameRow } = await supabase
        .from('businesses')
        .select('name')
        .eq('id', businessId)
        .maybeSingle();

      const resolvedBusinessName =
        (typeof businessName === 'string' && businessName.trim()) ||
        (typeof body?.businessName === 'string' && (body.businessName as string).trim()) ||
        bizNameRow?.name ||
        '';

      const appliedDiscount =
        (redemption as any).discount_label ||
        discount_label ||
        (typeof body?.discount === 'string' ? body.discount : '');

      return jsonResponse(
        {
          success: true,
          message: 'Redemption recorded successfully.',
          redemption: {
            id: redemption.id,
            touristName,
            touristEmail,
            passType: pass.pass_type,
            validFrom,
            validUntil,
            businessName: resolvedBusinessName,
            discountApplied: appliedDiscount,
            savedAmount: Number(redemption.saved_amount) || 0,
            redeemedAt: redemption.redeemed_at,
            originalPrice: computed.totalStandard,
            dealPrice: computed.totalDeal,
            savingsLine: computed.savingsLine,
            isTieredPricing: computed.isTiered,
            party: {
              adults: redeemParty.adults,
              children: redeemParty.children,
              infants: redeemParty.infants,
            },
          },
        },
        200
      );
    }

    return errorResponse('Unknown action: ' + action, 400);
  } catch (err: any) {
    console.error('[verify-redemption] unexpected error:', err?.message ?? err, err?.stack ?? '');
    return errorResponse(
      typeof err?.message === 'string' && err.message.length > 0
        ? `Verification failed: ${err.message}`
        : 'Verification failed',
      500,
      { reason: 'unexpected', name: err?.name ?? null },
    );
  }
});

