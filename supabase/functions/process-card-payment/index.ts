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
    const body = await req.json();
    const { user_email, user_name, receipt_number, pass_label, pass_group, pass_days, amount } = body;

    const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY');

    if (!SENDGRID_API_KEY) {
      throw new Error('SENDGRID_API_KEY not set in Supabase secrets');
    }

    // This is the actual "Mailman" part that was missing
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{
          to: [{ email: user_email, name: user_name }],
        }],
        from: { email: 'Vanuatuwatersports@gmail.com', name: 'StikmNek Adventure' },
        subject: `Your StikmNek Receipt: ${receipt_number}`,
        content: [{
          type: 'text/html',
          value: `
            <h1>Thanks for your purchase, ${user_name}!</h1>
            <p><strong>Receipt:</strong> ${receipt_number}</p>
            <p><strong>Pass:</strong> ${pass_label}</p>
            <p><strong>Group:</strong> ${pass_group}</p>
            <p><strong>Duration:</strong> ${pass_days} day(s)</p>
            <p><strong>Total Paid:</strong> A$${amount}</p>
            <p>Keep this email as your proof of purchase.</p>
          `
        }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`SendGrid Error: ${errorText}`);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});