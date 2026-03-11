import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const body = await req.json();
    const { user_id, passType, startDate, amount, days, group_size } = body;

    const finalDays = Number(days); 
    const finalGroup = group_size;

    const expiryDate = new Date(startDate);
    expiryDate.setDate(expiryDate.getDate() + finalDays);

    const { data, error } = await supabaseClient
      .from('passes')
      .insert([{
        user_id,
        pass_type: passType,
        total_amount: Number(amount),
        price_paid: Number(amount),
        expires_at: expiryDate.toISOString(),
        group_size: finalGroup,
        status: 'active',
        active: true,
        payment_method: 'card'
      }])
      .select().single();

    if (error) throw error;
    return new Response(JSON.stringify({ success: true, receiptNumber: data.id.slice(0,8).toUpperCase() }), 
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { headers: corsHeaders, status: 400 });
  }
});