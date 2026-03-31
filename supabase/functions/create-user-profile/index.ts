// deno-lint-ignore-file no-explicit-any
/**
 * create-user-profile — creates or updates public.user_profiles for the authenticated user.
 * Expects Authorization: Bearer <user JWT>. Body.user_id must match JWT sub.
 *
 * Body: { user_id, display_name, role: 'tourist' | 'business' | 'admin', email }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * CORS: set CORS_ALLOWED_ORIGINS (comma-separated). If unset, Allow-Origin is *.
 */
function getSafeCorsHeaders(req: Request): Record<string, string> {
  const raw = (Deno.env.get("CORS_ALLOWED_ORIGINS") ?? "").trim();
  const allowed = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const origin = req.headers.get("Origin") ?? "";
  const base: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  };
  if (allowed.length === 0) {
    base["Access-Control-Allow-Origin"] = "*";
    return base;
  }
  base["Access-Control-Allow-Origin"] = allowed.includes(origin) ? origin : allowed[0]!;
  return base;
}

function json(req: Request, data: object, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getSafeCorsHeaders(req), "Content-Type": "application/json" },
  });
}

function errorJson(req: Request, message: string, status: number) {
  return json(req, { success: false, error: message }, status);
}

Deno.serve(async (req) => {
  const corsHeaders = getSafeCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorJson(req, "Method not allowed", 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return errorJson(req, "Missing Authorization header", 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    return errorJson(req, "Server misconfigured: missing Supabase env", 500);
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  const { data: userData, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !userData?.user) {
    return errorJson(req, "Invalid or expired session", 401);
  }
  const user = userData.user;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorJson(req, "Invalid JSON body", 400);
  }

  const userId = String(body?.user_id ?? "");
  const displayName = String(body?.display_name ?? "").trim();
  const roleRaw = String(body?.role ?? "tourist").toLowerCase();
  const email = String(body?.email ?? user.email ?? "").trim();

  if (!userId) {
    return errorJson(req, "Missing user_id", 400);
  }
  if (user.id !== userId) {
    return errorJson(req, "user_id does not match authenticated user", 403);
  }
  if (!displayName) {
    return errorJson(req, "Missing display_name", 400);
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
    return errorJson(req, selErr.message, 500);
  }

  if (existing) {
    const existingRole = String((existing as any).role ?? "").toLowerCase();
    if (existingRole === "admin" && role !== "admin") {
      return json(req, {
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
      return errorJson(req, upErr.message, 500);
    }
    return json(req, { success: true, profile: updated });
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
        return json(req, { success: true, profile: again, message: "Race: profile already existed" });
      }
    }
    console.error("[create-user-profile] insert error:", insErr);
    return errorJson(req, insErr.message, 500);
  }

  return json(req, { success: true, profile: inserted });
});
