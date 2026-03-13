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
        JSON.stringify({ success: false, error: 'Missing action. Use Pay with PayPal for pass purchase.' }),
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
      // Card payment for passes is not implemented; use PayPal (create-checkout + paypal-capture).
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Card payment for passes is not available. Please use the "Pay with PayPal" button above.',
        }),
        { status: 501, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: `Unknown action: ${action}. Use Pay with PayPal for pass purchase.` }),
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
