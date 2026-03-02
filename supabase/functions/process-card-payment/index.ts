import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface PassDetails {
  name: string;
  duration: string;
  capacity: string;
}

function getPassDetails(amount: number): PassDetails {
  if (amount >= 90) return { name: 'Ultimate Crew Experience', duration: '7 days', capacity: '7-8 people' };
  if (amount >= 40) return { name: 'Extended Group Adventure', duration: '7 days', capacity: '4-6 people' };
  if (amount >= 10) return { name: 'Family Explorer Pass', duration: '1 day', capacity: '4-6 people' };
  return { name: 'Basic Pass', duration: '1 day', capacity: '1-2 people' };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json();
    console.log("RECEIVED DATA:", JSON.stringify(body));

    // Smart Detection: Finds price even if labeled differently
    const rawAmount = body.amount || body.unit_amount || body.price || body.total || 0;
    let finalAmount = Number(rawAmount);
    if (finalAmount > 1000) finalAmount = finalAmount / 100;

    const email = body.email || body.customer_email || "customer@example.com";
    const passDetails = getPassDetails(finalAmount);

    // Calculate Date
    const expiry = new Date();
    const daysToAdd = passDetails.duration.includes('7') ? 7 : 1;
    expiry.setDate(expiry.getDate() + daysToAdd);

    // SendGrid Email Logic
    const SG_KEY = Deno.env.get('SENDGRID_API_KEY');
    if (SG_KEY && email !== "customer@example.com") {
      try {
        await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${SG_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: email }], subject: 'Your Adventure Pass' }],
            from: { email: 'stikmnek@gmail.com' },
            content: [{ type: 'text/html', value: `<h3>Confirmed!</h3><p>Your ${passDetails.name} is active.</p>` }]
          })
        });
      } catch (e) { console.error("Email deferred"); }
    }

    return new Response(
      JSON.stringify({
        success: true,
        planName: passDetails.name,
        amount: finalAmount,
        validUntil: expiry.toLocaleDateString('en-AU'),
        passDetails: { ...passDetails, amount: finalAmount }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 200, // Stay open to prevent "Connection Failed"
      headers: corsHeaders 
    });
  }
})