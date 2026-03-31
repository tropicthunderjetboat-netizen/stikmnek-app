// deno-lint-ignore-file no-explicit-any
/**
 * create-user-profile — creates or updates public.user_profiles for the authenticated user.
 * Expects Authorization: Bearer <user JWT>. Body.user_id must match JWT sub.
 *
 * Body: { user_id, display_name, role: 'tourist' | 'business' | 'admin', email }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: object, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorJson(message: string, status: number) {
  return json({ success: false, error: message }, status);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorJson("Method not allowed", 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return errorJson("Missing Authorization header", 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    return errorJson("Server misconfigured: missing Supabase env", 500);
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  const { data: userData, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !userData?.user) {
    return errorJson("Invalid or expired session", 401);
  }
  const user = userData.user;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorJson("Invalid JSON body", 400);
  }

  const userId = String(body?.user_id ?? "");
  const displayName = String(body?.display_name ?? "").trim();
  const roleRaw = String(body?.role ?? "tourist").toLowerCase();
  const email = String(body?.email ?? user.email ?? "").trim();

  if (!userId) {
    return errorJson("Missing user_id", 400);
  }
  if (user.id !== userId) {
    return errorJson("user_id does not match authenticated user", 403);
  }
  if (!displayName) {
    return errorJson("Missing display_name", 400);
  }

  const role =
    roleRaw === "business" ? "business"
    : roleRaw === "admin" ? "admin"
    : "tourist";
  const userType = role;

  const now = new Date().toISOString();

  const { data: existing, error: selErr } = await supabase
    .from("user_profiles")
    .select("user_id, role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (selErr) {
    console.error("[create-user-profile] select error:", selErr);
    return errorJson(selErr.message, 500);
  }

  if (existing) {
    const existingRole = String((existing as any).role ?? "").toLowerCase();
    if (existingRole === "admin" && role !== "admin") {
      return json({
        success: true,
        profile: existing,
        message: "Profile exists as admin — role preserved",
      });
    }

    const { data: updated, error: upErr } = await supabase
      .from("user_profiles")
      .update({
        display_name: displayName,
        name: displayName,
        full_name: displayName,
        role,
        user_type: userType,
        email: email || user.email,
        updated_at: now,
      })
      .eq("user_id", user.id)
      .select()
      .single();

    if (upErr) {
      console.error("[create-user-profile] update error:", upErr);
      return errorJson(upErr.message, 500);
    }
    return json({ success: true, profile: updated });
  }

  const { data: inserted, error: insErr } = await supabase
    .from("user_profiles")
    .insert({
      user_id: user.id,
      name: displayName,
      full_name: displayName,
      display_name: displayName,
      role,
      user_type: userType,
      email: email || user.email,
      phone: "",
      onboarding_complete: role !== "business",
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (insErr) {
    if (insErr.code === "23505") {
      const { data: again } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (again) {
        return json({ success: true, profile: again, message: "Race: profile already existed" });
      }
    }
    console.error("[create-user-profile] insert error:", insErr);
    return errorJson(insErr.message, 500);
  }

  return json({ success: true, profile: inserted });
});
