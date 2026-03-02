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
    const { amount } = await req.json();
    const nAmt = Number(amount);

    const pType = nAmt >= 99 ? 'monthly' : nAmt >= 45 ? 'weekly' : 'daily';
    const days = nAmt >= 99 ? 6 : nAmt >= 45 ? 6 : 1;

    return new Response(
      JSON.stringify({
        success: true,
        passType: pType,
        amount: nAmt,
        days: days, // This fixes the "? day" on your receipt
        group: pType === 'monthly' ? '7 people' : '4 people', // This fixes the "4 people" on $99 pass
        receiptNumber: `REC-${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
        completedAt: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});