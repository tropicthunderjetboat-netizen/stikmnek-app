import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface PaymentData {
  amount: number;
  email: string;
  shared?: boolean;
}

interface PassDetails {
  passLabel: string;
  duration: string;
  group: string;
  isShared: boolean;
}

// Define the logic based on your edits
let details = { label: "Family Explorer Pass", group: "4 people", days: 1 };

if (nAmt >= 99) {
  details = { label: "Ultimate Crew Experience Pass", group: "7 people", days: 6 };
} else if (nAmt >= 45) {
  details = { label: "Extended Group Adventure Pass", group: "4 people", days: 6 };
}

return new Response(
  JSON.stringify({
    success: true,
    amount: nAmt,           // Fixes A$0
    passLabel: details.label, // Fixes "undefined Pass"
    group: details.group,     // Fixes "undefined" capacity
    currency: "AUD",
    validUntil: expiry.toLocaleDateString('en-AU')
  }),
  { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
);

async function sendReceipt(email: string, amount: number, passDetails: PassDetails) {
  const sendGridApiKey = Deno.env.get('SENDGRID_API_KEY');
  if (!sendGridApiKey) return;

  try {
    const dollarAmount = amount > 1000 ? amount / 100 : amount;
    const emailData = {
      personalizations: [{ to: [{ email: email }], subject: 'Payment Confirmation - Stikmnek Adventure Pass' }],
      from: { email: 'stikmnek@gmail.com' }, // Updated to your email
      content: [{
          type: 'text/html',
          value: `<h2>Payment Confirmation</h2>
                  <p>Pass Type: ${passDetails.passLabel}</p>
                  <p>Group Size: ${passDetails.group}</p>
                  <p>Amount Paid: A$${dollarAmount.toFixed(2)}</p>
                  ${passDetails.isShared ? '<p><strong>✓ Shared Group Experience</strong></p>' : ''}`
      }]
    };
    await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${sendGridApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(emailData),
    });
  } catch (error) { console.error('Email failed:', error); }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const paymentData: PaymentData = await req.json();
    if (!paymentData.amount || !paymentData.email) {
      return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400, headers: corsHeaders });
    }

    const passDetails = getPassDetails(paymentData.amount);
    const dollarAmount = paymentData.amount > 1000 ? paymentData.amount / 100 : paymentData.amount;
    
    // Send email without waiting for it to finish
    sendReceipt(paymentData.email, paymentData.amount, passDetails).catch(console.error);

return new Response(
      JSON.stringify({
        success: true,
        amount: nAmt,
        passType: nAmt >= 99 ? 'monthly' : nAmt >= 45 ? 'weekly' : 'daily',
        passLabel: details.label,
        group: details.group,
        currency: "AUD"
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});