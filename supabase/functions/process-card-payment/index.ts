import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { amount, planType, shared } = await req.json()
    let passDetails = { name: "Tourist Pass", days: 1, people: 4 }

    // Logic for your 3 specific scenarios
    if (amount === 15) {
      passDetails.name = "Family Explorer Pass";
      passDetails.people = shared ? 6 : 4; // Add 2 extra if shared
    } else if (amount === 45) {
      passDetails.name = "Extended Group Adventure";
      passDetails.days = shared ? 7 : 6;   // Extra day if shared
      passDetails.people = shared ? 6 : 4; // Add 2 extra if shared
    } else if (amount === 99) {
      passDetails.name = "Ultimate Crew Experience";
      passDetails.days = shared ? 7 : 6;   // Extra day if shared
      passDetails.people = shared ? 8 : 7; // Add 1 extra if shared
    }

    const expiryDate = new Date()
    expiryDate.setDate(expiryDate.getDate() + passDetails.days)

    return new Response(
      JSON.stringify({ 
        success: true, 
        amount: amount, 
        planName: passDetails.name, 
        validUntil: expiryDate.toLocaleDateString(),
        peopleCount: passDetails.people,
        message: shared ? "Extras Unlocked!" : "Standard Pass Active"
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    )
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { 
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 
    })
  }
})