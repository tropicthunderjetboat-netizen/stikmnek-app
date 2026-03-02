import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { amount, details } = await req.json();
    const nAmt = Number(amount);

    // This ensures the server sends back the NEW group sizes for the receipt
    const data = {
      success: true,
      amount: nAmt,
      passType: nAmt >= 99 ? 'monthly' : nAmt >= 45 ? 'weekly' : 'daily',
      passLabel: details?.label || 'Pass',
      group: nAmt >= 99 ? '7 people' : '4 people',
      receiptNumber: `REC-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
      completedAt: new Date().toISOString()
    };

    return new Response(
      JSON.stringify(data),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
        status: 200 
      }
    );

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
        status: 400 
      }
    );
  }
});