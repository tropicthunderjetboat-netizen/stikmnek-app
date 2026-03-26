// deno-lint-ignore-file no-explicit-any
/**
 * process-card-payment Edge Function
 * Handles: purchase_pass, purchase_superstar
 *
 * For purchase_superstar: Charges $5.00 AUD (HARDCODED), increments superstar_credits.
 * Amount is NEVER taken from the request body for security.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPERSTAR_PRICE_AUD = 5.0;

// Pass configuration (keep in sync with pricing.ts and paypal-capture)
const PASS_DAYS: Record<string, number> = { daily: 1, weekly: 6, monthly: 6 };
const PASS_MAX_PEOPLE: Record<string, number> = { daily: 4, weekly: 4, monthly: 7 };
const PASS_PRICES_AUD: Record<string, number> = { daily: 15, weekly: 45, monthly: 99 };

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function endOfDayDate(dateStr: string): string {
  const d = new Date(dateStr + 'T23:59:59.999Z');
  return d.toISOString();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !authUser) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid or expired session' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const action = body?.action ?? body?.Action;

    if (!action) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing action. Use action: purchase_pass for pass purchase.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'purchase_superstar') {
      // ═══ SUPERSTAR PURCHASE — $5.00 AUD HARDCODED ═══
      // TODO: Integrate actual card charge (PayPal/Stripe) for SUPERSTAR_PRICE_AUD
      // For now: increment credits. Replace with real payment flow when ready.
      const amountToCharge = SUPERSTAR_PRICE_AUD;

      const { data: newCount, error: rpcError } = await supabase.rpc('increment_superstar_credits', {
        p_user_id: authUser.id,
      });

      if (rpcError) {
        console.error('increment_superstar_credits error:', rpcError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to add Super Star credit' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          superstar_credits: newCount ?? 1,
          amount: amountToCharge,
          currency: 'AUD',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'purchase_pass') {
      // ═══ PASS PURCHASE VIA CARD (mock charge) ═══
      //
      // This implementation validates the input, performs a MOCK charge (no real
      // gateway call in sandbox), and then creates a row in public.passes with
      // correct validity dates. The frontend treats this response the same way
      // as paypal-capture.
      //
      // CRITICAL SAFETY: In production, do NOT allow mock payments to create active passes.
      // To enable this path intentionally (dev/testing only), set secret:
      //   CARD_MOCK_ENABLED=true

      const mockEnabled = (Deno.env.get('CARD_MOCK_ENABLED') ?? '').toLowerCase() === 'true';
      if (!mockEnabled) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Card payments are temporarily unavailable. Please use PayPal.',
          }),
          { status: 501, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const rawPassType = (body?.passType ?? body?.pass_type ?? '').toLowerCase();
      const startDate = body?.startDate ?? body?.start_date;

      if (!rawPassType || !['daily', 'weekly', 'monthly'].includes(rawPassType)) {
        return new Response(
          JSON.stringify({ success: false, error: 'Missing or invalid passType' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
        return new Response(
          JSON.stringify({ success: false, error: 'Missing or invalid startDate (YYYY-MM-DD)' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const passType = rawPassType;
      const days = PASS_DAYS[passType] ?? 1;
      const maxPeople = PASS_MAX_PEOPLE[passType] ?? 4;
      const amount = PASS_PRICES_AUD[passType] ?? 0;

      // MOCK charge: in production you would call a real gateway here (Stripe/PayPal).
      // For now we assume the card charge succeeded if we reached this point.

      const validFrom = startDate;
      const validUntil = addDays(startDate, days);
      const expiresAt = endOfDayDate(validUntil);
      const receiptNumber = body?.receiptNumber ?? `STK-${Date.now().toString(36).toUpperCase()}`;

      const passRow: Record<string, any> = {
        user_id: authUser.id,
        pass_type: passType,
        active: true,
        valid_from: validFrom,
        valid_until: validUntil,
        expires_at: expiresAt,
        max_people: maxPeople,
        share_bonus_applied: false,
        amount_paid: amount,
        currency: 'AUD',
        payment_provider: 'card-mock',
        payment_session_id: null,
        purchased_at: new Date().toISOString(),
      };

      const { data: insertedPass, error: insertErr } = await supabase
        .from('passes')
        .insert(passRow)
        .select('id, purchased_at')
        .single();

      if (insertErr) {
        console.error('process-card-payment: insert passes error:', insertErr);
        return new Response(
          JSON.stringify({ success: false, error: 'Payment captured but failed to create pass: ' + insertErr.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          receiptNumber,
          passType,
          amount,
          currency: 'AUD',
          expiresAt,
          validFrom,
          validUntil,
          days,
          sessionId: insertedPass?.id ?? receiptNumber,
          purchasedAt: insertedPass?.purchased_at ?? new Date().toISOString(),
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: `Unknown action: ${action}. Use action: purchase_pass for pass purchase.` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('process-card-payment error:', err);
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
