import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // This allows your app to talk to the function
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function getAdmin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

function genReceipt(): string {
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let r = "SNK-";
  for (let i = 0; i < 8; i++) r += c.charAt(Math.floor(Math.random() * c.length));
  return r;
}

async function getUser(req: Request) {
  const ah = req.headers.get("Authorization");
  if (!ah) return null;
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data: { user } } = await sb.auth.getUser(ah.replace("Bearer ", ""));
  return user;
}

async function getPPToken(): Promise<string> {
  const cid = Deno.env.get("PAYPAL_CLIENT_ID");
  const sec = Deno.env.get("PAYPAL_CLIENT_SECRET");
  const mode = Deno.env.get("PAYPAL_MODE") || "sandbox";
  const base = mode === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
  
  console.log(`[Diagnostic] Attempting Auth with Mode: ${mode}`);

  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/x-www-form-urlencoded", 
      Authorization: "Basic " + btoa(`${cid}:${sec}`) 
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    const errorText = await res.text();
    // THIS WILL FINALLY SHOW THE ERROR IN YOUR LOGS
    console.error(`[CRITICAL] PayPal Auth Failed: ${res.status}`, errorText);
    throw new Error(`PayPal auth failed: ${res.status}`);
  }
  
  const data = await res.json();
  console.log("[Diagnostic] Auth Successful");
  return data.access_token;
}

function getPPBase(): string {
  const mode = Deno.env.get("PAYPAL_MODE") || "sandbox";
  return mode === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

const PASSES: Record<string, { price: number; days: number; groupSize: number; label: string }> = {
  daily: { price: 15, days: 1, groupSize: 6, label: "Family Explorer Pass" },
  weekly: { price: 45, days: 7, groupSize: 6, label: "Extended Group Adventure Pass" },
  monthly: { price: 99, days: 7, groupSize: 8, label: "Ultimate Crew Experience Pass" },
};
function passTypeFromAmount(amount: number): string | null {
  for (const [key, cfg] of Object.entries(PASSES)) {
    if (Math.abs(cfg.price - amount) < 0.01) return key;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const user = await getUser(req);
    if (!user) return json({ error: "Not authenticated" }, 401);

    const body = await req.json();
    const { paypalOrderId, receiptNumber } = body;
    if (!paypalOrderId) return json({ error: "Missing paypalOrderId" }, 400);

    console.log(`[paypal-capture] User ${user.id} capturing order ${paypalOrderId}`);
    const sb = getAdmin();
    const ppToken = await getPPToken();
    const base = getPPBase();

    // Get order status
    const orderRes = await fetch(`${base}/v2/checkout/orders/${paypalOrderId}`, {
      method: "GET",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ppToken}` },
    });
    if (!orderRes.ok) return json({ error: "Failed to retrieve PayPal order" }, 502);
    const orderData = await orderRes.json();

    let capturedAmount = 0;
    let capturedCurrency = "AUD";
    let captureId = "";

    if (orderData.status === "COMPLETED") {
      const pu = orderData.purchase_units?.[0];
      const cap = pu?.payments?.captures?.[0];
      capturedAmount = parseFloat(cap?.amount?.value || pu?.amount?.value || "0");
      capturedCurrency = cap?.amount?.currency_code || pu?.amount?.currency_code || "AUD";
      captureId = cap?.id || paypalOrderId;
    } else if (orderData.status === "APPROVED") {
      const captureRes = await fetch(`${base}/v2/checkout/orders/${paypalOrderId}/capture`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${ppToken}` },
      });
      const captureData = await captureRes.json();
      if (!captureRes.ok || captureData.status !== "COMPLETED") {
        return json({ error: captureData.details?.[0]?.description || captureData.message || "Capture failed" }, 400);
      }
      const pu = captureData.purchase_units?.[0];
      const cap = pu?.payments?.captures?.[0];
      capturedAmount = parseFloat(cap?.amount?.value || pu?.amount?.value || "0");
      capturedCurrency = cap?.amount?.currency_code || pu?.amount?.currency_code || "AUD";
      captureId = cap?.id || paypalOrderId;
    } else {
      return json({ error: `Unexpected order status: ${orderData.status}` }, 400);
    }

    // Determine pass type
    const passType = passTypeFromAmount(capturedAmount);
    if (!passType) return json({ error: `Captured A$${capturedAmount} but could not match pass type. Contact support.` }, 400);
   const passCfg = PASSES[passType];
    const rn = receiptNumber || genReceipt();

    // Check idempotency
    if (receiptNumber) {
      const { data: existing } = await sb.from("payment_sessions").select("*").eq("receipt_number", receiptNumber).eq("user_id", user.id).single();
      if (existing && existing.status === "completed") {
        const { data: ep } = await sb.from("passes").select("*").eq("user_id", user.id).eq("active", true).order("created_at", { ascending: false }).limit(1).single();
        return json({ success: true, receiptNumber: rn, passType, amount: capturedAmount, expiresAt: ep?.expires_at, validFrom: ep?.valid_from, validUntil: ep?.valid_until, days: passCfg.days, sessionId: existing.id, paypalOrderId, alreadyProcessed: true });
      }
    }

    // Create dates
const now = new Date();
const validFrom = now.toISOString().split("T")[0];
const vud = new Date(now);
vud.setDate(vud.getDate() + passCfg.days); // This now uses 1 or 7 days correctly
const validUntil = vud.toISOString().split("T")[0];
const expiresAt = vud.toISOString();

    // Upsert payment session
    let sessionId = "";
    const { data: existSess } = await sb.from("payment_sessions").select("id, metadata").eq("receipt_number", rn).eq("user_id", user.id).maybeSingle();
    if (existSess) {
      await sb.from("payment_sessions").update({ status: "completed", paypal_order_id: paypalOrderId, completed_at: now.toISOString(), metadata: { ...(existSess.metadata || {}), paypalOrderId, captureId, capturedAmount, validFrom, validUntil } }).eq("id", existSess.id);
      sessionId = existSess.id;
    } else {
      const { data: sess, error: se } = await sb.from("payment_sessions").insert({ user_id: user.id, pass_type: passType, amount: capturedAmount, currency: capturedCurrency, payment_method: "paypal", paypal_order_id: paypalOrderId, receipt_number: rn, status: "completed", completed_at: now.toISOString(), metadata: { paypalOrderId, captureId, capturedAmount, validFrom, validUntil } }).select().single();
      if (se) return json({ error: "Payment captured but session creation failed. Receipt: " + rn }, 500);
      sessionId = sess.id;
    }

    // Deactivate old passes, create new
    await sb.from("passes").update({ active: false }).eq("user_id", user.id).eq("active", true);
    // This replaces the old 'const { data: pass... }' block

const { data: pass, error: pe } = await sb.from("passes").insert({
  user_id: user.id,
  pass_type: passType,
  active: true,
  purchased_at: now.toISOString(),
  expires_at: expiresAt,
  valid_from: validFrom,
  valid_until: validUntil,
  group_size: passCfg.groupSize, // Matches the new column we just added
  qr_code_data: JSON.stringify({ 
    receipt: rn, 
    pass: passType, 
    people: passCfg.groupSize,
    days: passCfg.days 
  })
}).select().single();

if (pe) console.error("INSERT ERROR:", pe.message); // This will show in your Supabase logs
    if (pe) return json({ error: "Payment captured but pass creation failed. Receipt: " + rn }, 500);

    // Send confirmation email (non-blocking)
    try {
      const { data: profile } = await sb.from("user_profiles").select("full_name").eq("user_id", user.id).single();
      const userName = profile?.full_name || user.email?.split("@")[0] || "there";
      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
        body: JSON.stringify({ action: "send_pass_confirmation", user_email: user.email, user_name: userName, receipt_number: rn, pass_type: passCfg.label, group_size: passCfg.groupSize, amount: String(capturedAmount), currency: capturedCurrency, payment_method: "PayPal", valid_from: validFrom, valid_until: validUntil }),
      });
    } catch (emailErr: any) {
      console.warn("[paypal-capture] Email failed (non-critical):", emailErr.message);
    }

    return json({ success: true, receiptNumber: rn, passType, amount: capturedAmount, expiresAt, validFrom, validUntil, days: passCfg.days, sessionId, paypalOrderId, captureId });
  } catch (err: any) {
    console.error("[paypal-capture] Error:", err);
    return json({ error: err.message || "Internal server error" }, 500);
  }
});