// deno-lint-ignore-file no-explicit-any
/**
 * sentry-relay — forwards diagnostic/error payloads to Sentry using SENTRY_DSN.
 * Actions: health | capture_message | capture_error
 *
 * Secrets: SENTRY_DSN (https://PUBLIC_KEY@oORG.ingest.sentry.io/PROJECT_ID)
 * CORS enabled for browser invokes.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSafeCorsHeaders } from "../_shared/cors.ts";

// NOTE: sentry-relay should never block the app on auth problems.
// Auth is OPTIONAL: if Authorization is present and valid, we attach user.id.
// If missing/invalid, we still relay the event (with no user context).
const BEARER_PREFIX = /^Bearer\s+/i;

async function tryGetUserIdFromAuthHeader(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.trim()) return null;

  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const anonKey =
    (Deno.env.get("APP_SUPABASE_ANON_KEY") ?? "").trim() ||
    (Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim() ||
    (Deno.env.get("SUPABASE_ANON_KEY_PUBLIC") ?? "").trim();

  if (!supabaseUrl || !anonKey) return null;

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const token = authHeader.replace(BEARER_PREFIX, "").trim();
  const { data: { user }, error } = await authClient.auth.getUser(token);
  if (error || !user) return null;
  return user.id ?? null;
}

function parseDsn(dsn: string): { publicKey: string; host: string; projectId: string } | null {
  try {
    const u = new URL(dsn.trim());
    const publicKey = decodeURIComponent(u.username || "");
    const host = u.host;
    const projectId = u.pathname.replace(/^\//, "").split("/")[0] || "";
    if (!publicKey || !host || !projectId) return null;
    return { publicKey, host, projectId };
  } catch {
    return null;
  }
}

async function sendSentryEvent(
  dsn: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; text: string }> {
  const parsed = parseDsn(dsn);
  if (!parsed) {
    return { ok: false, status: 0, text: "Invalid SENTRY_DSN" };
  }
  const { publicKey, host, projectId } = parsed;
  const url =
    `https://${host}/api/${projectId}/store/?sentry_key=${encodeURIComponent(publicKey)}&sentry_version=7`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Sentry-Auth":
        `Sentry sentry_version=7, sentry_key=${publicKey}, sentry_client=stikmnek-relay/1.0`,
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text().catch(() => "");
  return { ok: res.ok, status: res.status, text: text.slice(0, 500) };
}

Deno.serve(async (req) => {
  const corsHeaders = getSafeCorsHeaders(req);
  const json = (data: object, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const dsn = Deno.env.get("SENTRY_DSN") ?? "";

  try {
    const body = await req.json().catch(() => ({}));
    const action = body?.action ?? "health";

    if (action === "health") {
      const sentryConfigured = Boolean(dsn && parseDsn(dsn));
      return json({
        success: true,
        sentry_configured: sentryConfigured,
        message: sentryConfigured
          ? "Sentry DSN is set and parseable"
          : "SENTRY_DSN missing or invalid",
      });
    }

    if (!dsn || !parseDsn(dsn)) {
      return json(
        { success: false, error: "SENTRY_DSN not configured or invalid" },
        503,
      );
    }

    if (action === "capture_message") {
      const message = String(body?.message ?? "");
      const level = String(body?.level ?? "info");
      const tags = (body?.tags && typeof body.tags === "object")
        ? body.tags as Record<string, string>
        : {};
      const extra = (body?.extra && typeof body.extra === "object")
        ? body.extra as Record<string, unknown>
        : {};
      const userId =
        (body?.user_id ? String(body.user_id) : undefined) ||
        (await tryGetUserIdFromAuthHeader(req) ?? undefined);

      const event = {
        message,
        level,
        platform: "javascript",
        environment: Deno.env.get("SENTRY_ENVIRONMENT") ?? "production",
        timestamp: Math.floor(Date.now() / 1000),
        tags: { ...tags, source: tags.source ?? "stikmnek-frontend" },
        extra,
        user: userId ? { id: userId } : undefined,
      };

      const result = await sendSentryEvent(dsn, event);
      if (!result.ok) {
        console.warn("[sentry-relay] capture_message failed:", result.status, result.text);
        // HTTP 200 so supabase.functions.invoke does not treat this as Edge failure (avoids client 502 storms).
        return json({
          success: false,
          relay_skipped: true,
          error: `Sentry HTTP ${result.status}`,
          detail: result.text,
        });
      }
      return json({ success: true });
    }

    if (action === "capture_error") {
      const error_message = String(body?.error_message ?? "Error");
      const error_stack = body?.error_stack
        ? String(body.error_stack)
        : undefined;
      const error_type = String(body?.error_type ?? "error");
      const severity = String(body?.severity ?? "error");
      const component = body?.component ? String(body.component) : undefined;
      const page_url = body?.page_url ? String(body.page_url) : undefined;
      const user_agent = body?.user_agent ? String(body.user_agent) : undefined;
      const metadata = (body?.metadata && typeof body.metadata === "object")
        ? body.metadata as Record<string, unknown>
        : {};
      const userId =
        (body?.user_id ? String(body.user_id) : undefined) ||
        (await tryGetUserIdFromAuthHeader(req) ?? undefined);
      const tags = (body?.tags && typeof body.tags === "object")
        ? body.tags as Record<string, string>
        : {};

      const event: Record<string, unknown> = {
        message: error_message,
        level: severity === "critical" ? "fatal" : "error",
        platform: "javascript",
        environment: Deno.env.get("SENTRY_ENVIRONMENT") ?? "production",
        timestamp: Math.floor(Date.now() / 1000),
        tags: {
          ...tags,
          error_type,
          component: component ?? "",
        },
        extra: {
          ...metadata,
          error_stack,
          page_url,
          user_agent,
        },
        user: userId ? { id: userId } : undefined,
      };

      if (error_stack) {
        event.exception = {
          values: [{
            type: error_type,
            value: error_message,
            stacktrace: { frames: [] },
          }],
        };
      }

      const result = await sendSentryEvent(dsn, event);
      if (!result.ok) {
        console.warn("[sentry-relay] capture_error failed:", result.status, result.text);
        return json({
          success: false,
          relay_skipped: true,
          error: `Sentry HTTP ${result.status}`,
          detail: result.text,
        });
      }
      return json({ success: true });
    }

    return json({ success: false, error: "Unknown action: " + String(action) }, 400);
  } catch (err: any) {
    console.error("[sentry-relay]", err);
    return json(
      { success: false, error: err?.message ?? "sentry-relay failed" },
      500,
    );
  }
});
