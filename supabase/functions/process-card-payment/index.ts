import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// These headers allow your website to "talk" to the server without being blocked
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // 1. Handle the "Security Handshake" (CORS)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 2. Get the payment details sent from your website
    const { orderId, amount } = await req.json()
    console.log(`Payment Server reached for order: ${orderId} amount: ${amount}`)
    
    // 3. Send a "Success" message back to the website
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Payment server reached successfully!",
        orderId: orderId 
      }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" }, 
        status: 200 
      }
    )
  } catch (error) {
    // 4. Handle errors if the data is missing
    return new Response(
      JSON.stringify({ error: error.message }), 
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" }, 
        status: 400 
      }
    )
  }
})