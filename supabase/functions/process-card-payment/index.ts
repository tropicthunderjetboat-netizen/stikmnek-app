import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { amount, planType, email, shared } = await req.json()
    let pass = { name: "Tourist Pass", days: 1, people: 4 }

    // Your $15, $45, and $99 Plan Logic
    if (amount === 15) {
      pass = { name: "Family Explorer Pass", days: 1, people: shared ? 6 : 4 }
    } else if (amount === 45) {
      pass = { name: "Extended Group Adventure", days: shared ? 7 : 6, people: shared ? 6 : 4 }
    } else if (amount === 99) {
      pass = { name: "Ultimate Crew Experience", days: shared ? 7 : 6, people: shared ? 8 : 7 }
    }

    const expiryDate = new Date()
    expiryDate.setDate(expiryDate.getDate() + pass.days)

    // Pulls the key safely from Supabase Vault (not from the code text)
    const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY')
    
    await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: email }] }],
        from: { email: 'stikmnek@gmail.com' }, 
        subject: `Your ${pass.name} is ready!`,
        content: [{ type: 'text/plain', value: `Thanks! Your pass for ${pass.people} people is valid until ${expiryDate.toLocaleDateString()}.` }]
      })
    })

    return new Response(
      JSON.stringify({ 
        success: true, 
        amount: amount, 
        planName: pass.name, 
        validUntil: expiryDate.toLocaleDateString() 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    )
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 })
  }
})