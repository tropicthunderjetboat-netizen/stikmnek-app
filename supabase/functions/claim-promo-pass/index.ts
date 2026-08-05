// deno-lint-ignore-file no-explicit-any
/**
 * claim-promo-pass — First 25 travelers free (or other promo_campaigns).
 * Atomically reserves a slot via reserve_promo_claim(), then inserts a pass
 * with is_promo_free=true / amount_paid=0 (skips PayPal).
 */

import {
  createEdgeClients,
  errorResponse,
  getAuthUserFromRequest,
  getSafeCorsHeaders,
  jsonResponse,
} from '../_shared/cors.ts';
import { transactionalPassProductNameEn } from '../_shared/passDisplay.ts';
import { semanticPassIdFromDb, type DbPassType } from '../_shared/passTypes.ts';
import {
  addCalendarDaysIso,
  calculatePassPriceAud,
  dynamicPassInclusiveDays,
  endOfDayUtcIso,
  parsePartySizeAndExtended,
  validatePassStartDateIso,
  validUntilOffsetDays,
} from '../_shared/pricingDynamic.ts';
import { notifyAdminsOfPassPurchase } from '../_shared/purchaseNotify.ts';

const DEFAULT_CAMPAIGN = 'FIRST25';

function receiptNumberFromPassId(passId: string): string {
  return `STK-${passId.replace(/-/g, '').slice(0, 12).toUpperCase()}`;
}

type ReserveRow = {
  ok: boolean;
  reason: string;
  campaign_id: string | null;
  claims_count: number | null;
  max_claims: number | null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getSafeCorsHeaders(req) });
  }

  try {
    const clients = createEdgeClients();
    if (!clients) {
      return errorResponse(req, 'Server configuration error', 500, { reason: 'missing_supabase_secrets' });
    }
    const { authClient, serviceClient } = clients;

    const authResult = await getAuthUserFromRequest(authClient, req);
    if ('response' in authResult) return authResult.response;
    const user = authResult.user;

    const email = (user.email ?? '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      return errorResponse(
        req,
        'An email on your account is required to claim a free pass. Sign in with email and try again.',
        400,
        { reason: 'email_required' },
      );
    }

    const body = await req.json().catch(() => ({}));
    const bodyObj = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
    const campaignCode = String(bodyObj.campaignCode ?? bodyObj.campaign_code ?? DEFAULT_CAMPAIGN)
      .trim()
      .toUpperCase() || DEFAULT_CAMPAIGN;

    const startCheck = validatePassStartDateIso(bodyObj.startDate ?? bodyObj.start_date);
    if (!startCheck.ok) {
      return errorResponse(req, startCheck.error, 400);
    }
    const startDate = startCheck.startDate;

    const parsed = parsePartySizeAndExtended(bodyObj);
    if (!parsed) {
      return errorResponse(
        req,
        'Missing or invalid partySize (1–20). Confirm how many people (ages 6+), then try again.',
        400,
      );
    }
    const { partySize, isExtended } = parsed;
    const originalPrice = calculatePassPriceAud(partySize, isExtended);

    // Block if user already has an active non-expired pass
    const nowIso = new Date().toISOString();
    const { data: existingActive, error: activeErr } = await serviceClient
      .from('passes')
      .select('id')
      .eq('user_id', user.id)
      .eq('active', true)
      .gt('expires_at', nowIso)
      .limit(1)
      .maybeSingle();
    if (activeErr) {
      console.error('[claim-promo-pass] active pass check', activeErr);
      return errorResponse(req, 'Could not verify existing pass. Try again.', 500);
    }
    if (existingActive?.id) {
      return errorResponse(
        req,
        'You already have an active pass. Promo claims are one per account.',
        409,
        { reason: 'already_has_pass', fallbackToPaid: false },
      );
    }

    const { data: reserveData, error: reserveErr } = await serviceClient.rpc('reserve_promo_claim', {
      p_campaign_code: campaignCode,
      p_user_id: user.id,
      p_email: email,
    });

    if (reserveErr) {
      console.error('[claim-promo-pass] reserve_promo_claim', reserveErr);
      return errorResponse(req, 'Could not reserve promo slot. Try again.', 500);
    }

    const row = (Array.isArray(reserveData) ? reserveData[0] : reserveData) as ReserveRow | null;
    if (!row?.ok) {
      const reason = row?.reason ?? 'full';
      // Soft fallback to paid checkout for full / inactive (spec: no hard error for race)
      if (reason === 'full' || reason === 'inactive' || reason === 'not_found') {
        return jsonResponse(req, {
          success: false,
          reason,
          fallbackToPaid: true,
          claims_count: row?.claims_count ?? null,
          max_claims: row?.max_claims ?? null,
          message:
            reason === 'full'
              ? 'Ah, just missed it — the free passes are gone, but here is your pass at full price.'
              : 'This free pass offer is not available right now. Continue with paid checkout.',
        });
      }
      if (reason === 'already_claimed') {
        return errorResponse(
          req,
          'This email has already claimed a free traveler pass.',
          409,
          { reason: 'already_claimed', fallbackToPaid: true },
        );
      }
      return errorResponse(req, 'Could not claim free pass.', 400, { reason, fallbackToPaid: true });
    }

    const campaignId = String(row.campaign_id);
    const paymentSessionId = `promo_${campaignCode}_${user.id}`;

    // Idempotent: if we already created this promo pass, return it
    const { data: existingPromo } = await serviceClient
      .from('passes')
      .select('*')
      .eq('user_id', user.id)
      .eq('payment_session_id', paymentSessionId)
      .maybeSingle();

    if (existingPromo?.id) {
      await serviceClient.rpc('attach_promo_claim_pass', {
        p_campaign_id: campaignId,
        p_user_id: user.id,
        p_pass_id: existingPromo.id,
      });
      const ep = existingPromo as Record<string, unknown>;
      const passId = String(ep.id);
      return jsonResponse(req, {
        success: true,
        isPromoFree: true,
        campaignCode,
        receiptNumber: receiptNumberFromPassId(passId),
        passType: semanticPassIdFromDb('dynamic'),
        passLabel: transactionalPassProductNameEn(),
        amount: 0,
        originalPrice: Number(ep.original_price) || originalPrice,
        currency: 'AUD',
        paymentMethod: 'promo',
        expiresAt: ep.expires_at,
        validFrom: ep.valid_from,
        validUntil: ep.valid_until,
        days: dynamicPassInclusiveDays(isExtended, Boolean(ep.share_bonus_applied)),
        shareBonusApplied: Boolean(ep.share_bonus_applied),
        group: `Up to ${Number(ep.max_people) || partySize} people (ages 6+)`,
        partySize: Number(ep.max_people) || partySize,
        isExtended,
        sessionId: passId,
        productType: 'pass',
        claims_count: row.claims_count,
        max_claims: row.max_claims,
      });
    }

    let grantSecondWeek = false;
    if (isExtended) {
      const { data: profRow } = await serviceClient
        .from('user_profiles')
        .select('share_bonus_unlocked')
        .eq('user_id', user.id)
        .maybeSingle();
      grantSecondWeek = !!(profRow as { share_bonus_unlocked?: boolean } | null)?.share_bonus_unlocked;
    }

    const shareBonusApplied = isExtended && grantSecondWeek;
    const validFrom = startDate;
    const validUntil = addCalendarDaysIso(startDate, validUntilOffsetDays(isExtended, grantSecondWeek));
    const expiresAt = endOfDayUtcIso(validUntil);
    const inclusiveDays = dynamicPassInclusiveDays(isExtended, grantSecondWeek);

    const passRow = {
      user_id: user.id,
      pass_type: 'dynamic' as DbPassType,
      active: true,
      valid_from: validFrom,
      valid_until: validUntil,
      expires_at: expiresAt,
      max_people: partySize,
      share_bonus_applied: shareBonusApplied,
      amount_paid: 0,
      currency: 'AUD',
      payment_provider: 'promo',
      payment_session_id: paymentSessionId,
      purchased_at: new Date().toISOString(),
      promo_campaign_id: campaignId,
      is_promo_free: true,
      original_price: originalPrice,
    };

    const { data: insertedPass, error: insertErr } = await serviceClient
      .from('passes')
      .insert(passRow)
      .select('id')
      .single();

    if (insertErr) {
      console.error('[claim-promo-pass] insert pass', insertErr);
      try {
        await serviceClient.rpc('release_promo_claim', {
          p_campaign_id: campaignId,
          p_user_id: user.id,
        });
      } catch (relErr) {
        console.error('[claim-promo-pass] release after insert fail', relErr);
      }
      return errorResponse(req, 'Could not create your free pass. Please try again.', 500);
    }

    const passId = String(insertedPass?.id ?? '');

    if (grantSecondWeek) {
      await serviceClient
        .from('user_profiles')
        .update({ share_bonus_unlocked: false, updated_at: new Date().toISOString() })
        .eq('user_id', user.id);
    }

    await serviceClient.rpc('attach_promo_claim_pass', {
      p_campaign_id: campaignId,
      p_user_id: user.id,
      p_pass_id: passId,
    });

    const receiptNumber = passId ? receiptNumberFromPassId(passId) : `STK-PROMO-${Date.now().toString(36).toUpperCase()}`;

    try {
      await notifyAdminsOfPassPurchase({
        receiptNumber,
        amount: 0,
        currency: 'AUD',
        paymentMethod: `Promo (${campaignCode})`,
        buyerEmail: email,
        validFrom,
        validUntil,
        partySize,
        userId: user.id,
      });
    } catch (notifyErr: unknown) {
      console.error('[claim-promo-pass] admin notify', notifyErr);
    }

    return jsonResponse(req, {
      success: true,
      isPromoFree: true,
      campaignCode,
      receiptNumber,
      passType: semanticPassIdFromDb('dynamic'),
      passLabel: transactionalPassProductNameEn(),
      amount: 0,
      originalPrice,
      currency: 'AUD',
      paymentMethod: 'promo',
      expiresAt,
      validFrom,
      validUntil,
      days: inclusiveDays,
      shareBonusApplied,
      group: `Up to ${partySize} people (ages 6+)`,
      partySize,
      isExtended,
      sessionId: passId || receiptNumber,
      productType: 'pass',
      claims_count: row.claims_count,
      max_claims: row.max_claims,
    });
  } catch (err: unknown) {
    console.error('[claim-promo-pass] unhandled', err);
    return errorResponse(
      req,
      err instanceof Error ? err.message : 'Unexpected error claiming free pass',
      500,
    );
  }
});
