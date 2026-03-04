import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY');

    if (!SENDGRID_API_KEY) throw new Error('SENDGRID_API_KEY not set in Supabase');

    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: body.user_email }] }],
        from: { email: 'stikmnekgmail.com', name: 'StikmNek Adventure' },
        subject: `Your StikmNek Receipt: ${body.receipt_number}`,
        content: [{
          type: 'text/html',
          value: `
            <div style="font-family: sans-serif; padding: 20px;">
              <h2>Thanks for your purchase, ${body.user_name}!</h2>
              <p><strong>Receipt:</strong> ${body.receipt_number}</p>
              <p><strong>Pass Type:</strong> ${body.pass_label}</p>
              <p><strong>Group Size:</strong> ${body.pass_group}</p>
              <p><strong>Valid For:</strong> ${body.pass_days} day(s)</p>
              <p><strong>Amount Paid:</strong> A$${body.amount}</p>
              <hr />
              <p>Show this email at participating venues in Vanuatu.</p>
            </div>
          `
        }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`SendGrid Error: ${errorText}`);
    }

    return new Response(JSON.stringify({ success: true }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
      status: 200 
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
      status: 400 
    });
  }
});