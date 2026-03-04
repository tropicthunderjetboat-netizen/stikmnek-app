import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { user_email, user_name, receipt_number, pass_label, pass_group, pass_days, amount } = body;

  import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { amount } = await req.json();
    const nAmt = Number(amount);

    // This logic fixes the "7 people" and "6 days" calculation
    const pType = nAmt >= 99 ? 'monthly' : nAmt >= 45 ? 'weekly' : 'daily';
    const passDays = nAmt >= 99 ? 6 : nAmt >= 45 ? 6 : 1;
    const groupSize = nAmt >= 99 ? '7 people' : '4 people';

    return new Response(
      JSON.stringify({
        success: true,
        amount: nAmt,
        passType: pType,
        days: passDays,
        group: groupSize,
        receiptNumber: `REC-${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
        completedAt: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { headers: corsHeaders, status: 400 });
  }
});