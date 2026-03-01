import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { amount, planName } = await req.json()
    
    // This calculates today's date + 7 days for the "Valid Until" box
    const expiryDate = new Date()
    expiryDate.setDate(expiryDate.getDate() + 7)

    return new Response(
      JSON.stringify({ 
        success: true, 
        amount: amount || 25.00, 
        planName: planName || "StikmNek Tourist Pass", 
        validUntil: expiryDate.toLocaleDateString() 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    )
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { 
      headers: { ...corsHeaders, "Content-Type": "application/json" }, 
      status: 400 
    })
  }
})