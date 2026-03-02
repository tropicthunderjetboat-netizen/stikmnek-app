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

function getPassDetails(nAmt: number): PassDetails {
  const dollarAmount = nAmt > 100 ? nAmt / 100 : nAmt;
  
  if (dollarAmount >= 99) {
    return {
      passLabel: 'Ultimate Crew Experience Pass',
      duration: '7 days',
      group: '7-8 people',
      isShared: true
    };
  } else if (dollarAmount >= 49) {
    return {
      passLabel: 'Extended Group Adventure Pass', 
      duration: '7 days',
      group: '4-6 people',
      isShared: false
    };
  } else if (dollarAmount >= 15) {
    return {
      passLabel: 'Family Explorer Pass',
      duration: '1 day', 
      group: '2 adults & 2 kids',
      isShared: false
    };
  } else {
    return {
      passLabel: 'Basic Pass',
      duration: '1 day',
      group: '1-2 people',
      isShared: false
    };
  }
}
async function sendReceipt(email: string, amount: number, passDetails: PassDetails) {
  const sendGridApiKey = Deno.env.get('SENDGRID_API_KEY');
  
  if (!sendGridApiKey) {
    console.warn('SendGrid API key not configured - skipping email');
    return;
  }

  try {
    const dollarAmount = amount > 100 ? amount / 100 : amount;
    
    const emailData = {
      personalizations: [
        {
          to: [{ email: email }],
          subject: 'Payment Confirmation - Stikmnek Adventure Pass'
        }
      ],
      from: { email: 'noreply@stikmnek.com' },
      content: [
        {
          type: 'text/html',
          value: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2c5530;">Payment Confirmation</h2>
            <p>Thank you for your Stikmnek adventure purchase!</p>
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; border-left: 4px solid #2c5530;">
              <h3 style="margin-top: 0; color: #2c5530;">Purchase Details:</h3>
              <p><strong>Pass Type:</strong> ${passDetails.passLabel}</p>
              <p><strong>Duration:</strong> ${passDetails.duration}</p>
              <p><strong>Group Size:</strong> ${passDetails.group}</p>
              <p><strong>Amount Paid:</strong> A$${dollarAmount.toFixed(2)}</p>
              ${passDetails.isShared ? '<p style="color: #28a745;"><strong>✓ Shared Group Experience</strong></p>' : ''}
            </div>
            <p style="margin-top: 20px;">Your adventure awaits! We will see you soon.</p>
            <p style="color: #666; font-size: 12px;">This is an automated confirmation email.</p>
          </div>`
        }
      ]
    };
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sendGridApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailData),
    });

    if (!response.ok) {
      console.error('SendGrid API error:', await response.text());
    }
  } catch (error) {
    console.error('Error sending email:', error);
  }
}
serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { 
      status: 200, 
      headers: corsHeaders 
    });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { 
          status: 405, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const paymentData: PaymentData = await req.json();
    
    // Validate required fields
    if (!paymentData.amount || !paymentData.email) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: amount and email' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Get pass details based on amount
    const passDetails = getPassDetails(paymentData.amount);
    const dollarAmount = paymentData.amount > 100 ? paymentData.amount / 100 : paymentData.amount;
    
    // Send receipt email (non-blocking)
    sendReceipt(paymentData.email, paymentData.amount, passDetails).catch(error => {
      console.error('Email sending failed:', error);
    });

    // Return success response with required frontend keys
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Payment processed successfully',
        amount: dollarAmount,
        currency: 'AUD',
        passLabel: passDetails.passLabel,
        group: passDetails.group,
        duration: passDetails.duration,
        email: paymentData.email,
        isShared: passDetails.isShared
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    console.error('Error processing payment:', error);

    // Check if the error is due to the inability to reach the payment server
    if (error.message.includes('Unable to reach payment server')) {
      return new Response(
        JSON.stringify({ 
          error: 'Unable to reach payment server. Please check your connection and try again.'
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    } else {
      return new Response(
        JSON.stringify({ error: 'Error processing payment' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }
  }
});

console.log('Stikmnek payment function running');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Payment processed successfully',
        amount: dollarAmount,
        currency: 'AUD',
        passLabel: passDetails.passLabel,
        group: passDetails.group,
        duration: passDetails.duration,
        email: paymentData.email,
        isShared: passDetails.isShared
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );  } catch (error) {
    console.error('Error processing payment:', error);
    return new Response(
      JSON.stringify({ error: 'Error processing payment' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

console.log('Stikmnek payment function running');
