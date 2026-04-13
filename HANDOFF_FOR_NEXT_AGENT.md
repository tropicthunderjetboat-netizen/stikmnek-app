# Handoff for next agent — StikmNek app (recent fixes & context)

Use this file to sync with work already done in the repo. Paths are relative to the repository root.

---

## 1. Business listing photo upload (`PhotoUploader.tsx`)

**Problem:** Uploads could hang or never fall back to the Edge function.

**Root cause:** `@supabase/storage-js` `upload()` accepts `signal` in `FileOptions`, but `uploadOrUpdate()` does **not** pass `signal` into the internal `post()` call. So `await storage.upload(..., { signal })` **does not cancel** the request; a stalled upload blocks forever and the `upload-photo` fallback never runs.

**Fix:**

- Direct Storage: use **`Promise.race`** between `upload(...)` and a **60s** timer (no reliance on `signal` for Storage).
- Data URL → binary: strip prefix with **`/^data:image\/[^;]+;base64,/`** (not `\w+`, so subtypes like `svg+xml` work).
- Wrap **`atob`** in try/catch with a clear user-facing error.
- Edge fallback: race **`getEdgeAuthHeaders()`** at **30s**; on failure, **`supabase.auth.getSession()`** and set **`Authorization: Bearer <token>`** if present.
- Edge invoke: **`AbortController`** + **`signal`** on **`functions.invoke('upload-photo', …)`** (**60s**). Functions client **does** pass `signal` to `fetch`.

---

## 2. `upload-photo` Edge Function (`supabase/functions/upload-photo/index.ts`)

**Changes:**

- **`BEARER_PREFIX = /^Bearer\s+/i`** when parsing JWT (aligns with `manage-business` / other functions).
- Base64 strip: **`/^data:image\/[^;]+;base64,/`** (same as client).
- **`atob`** for payload decode is wrapped so invalid/corrupt base64 returns **400** with a clear message instead of a generic **500**.

**Deploy:** `supabase functions deploy upload-photo` (required for production to match client behavior).

---

## 3. New listing submit hang (`BusinessListingForm.tsx` + `BusinessOwnerDashboard.tsx`)

**Problem:** “Submit listing” could spin forever.

**Root causes:**

- **`supabase.rpc('insert_pending_business', …)`** had **no timeout** — stalled REST never returned.
- **`invokeWithRetry`** awaited **`getEdgeAuthHeaders()`** with **no cap**, then only raced the invoke — stuck auth/session never reached the invoke timeout.

**Fix:**

- Constants: **`RPC_INSERT_PENDING_TIMEOUT_MS = 90_000`**, **`EDGE_AUTH_HEADER_MS = 20_000`**, **`EDGE_INVOKE_TIMEOUT_MS = 120_000`** — exported from **`src/lib/edgeInvoke.ts`** (single source of truth).
- RPC: **`AbortController`** + **`.abortSignal(controller.signal)`** on the RPC builder; catch abort and surface a clear timeout message; then existing Edge fallback still applies. **Both** the standalone listing form and the in-dashboard submit path use this.
- **`invokeEdgeFunctionWithRetry`** (same module): race **`getEdgeAuthHeaders()`** with **`EDGE_AUTH_HEADER_MS`**; use **`AbortController`** + **`signal`** on **`supabase.functions.invoke`**. **`BusinessListingForm`** and **`BusinessOwnerDashboard`** import this helper so behavior cannot drift.
- **Abort-like invoke errors** (`AbortError` / **`FunctionsFetchError.context`**) **do not retry** — avoids multi-minute “Submitting…” when each attempt hits the invoke timeout.
- **`getEdgeAuthHeaders()`** in **`src/lib/supabase.ts`**: **`getSession()`** is raced with **~12s** so a stuck GoTrue client cannot block edge calls indefinitely (must stay under auth **`lockAcquireTimeout`**).
- **Hard submit deadline (~4 min)** on listing submit (**`BusinessListingForm`**, dashboard submit): **`Promise.race`** so **`setSubmitting(false)`** / **`setLoading(false)`** always run even if some inner promise never settles.

---

## 4. Admin delete user UX (`AdminUserManager.tsx`)

**Problem:** On non-2xx Edge responses, **`functions.invoke`** often returns **`data: null`** and a generic **`error.message`**, while the real JSON (`Unauthorized`, RPC errors, etc.) was in **`error.context` (Response)**.

**Fix:** Helpers **`getInvokeHttpStatus`**, **`getInvokeErrorJson`** (clone response, `json()`), and log/toast using **HTTP status + `body.error`**.

---

## 5. Related areas (from earlier thread — verify if still open)

- **`process-card-payment` / JWT:** Gateway **`401 Invalid JWT`** is Kong, not the Edge handler. Client patterns: **`ensureFreshSession`**, explicit **`Authorization`** on invoke, **`supabase.ts`** in-memory auth lock (no Navigator **LockManager**).
- **`sentry-relay` 502:** Repo returns **200 + `relay_skipped`** on Sentry upstream failure; if production still shows **502**, check deploy version or Edge crash logs.
- **Migrations:** `delete_public_app_data_for_user` + follow-ups (`pass_purchases`, full purge) — needed for **`admin_delete_user`** in **`manage-business`**.

---

## 6. Debug instrumentation

Session **`7b96fa`** NDJSON / `127.0.0.1:7527` ingest was **removed** from **`PhotoUploader`** at user request. **`PaymentCheckout`** / other files may or may not still contain temp debug — grep for **`7527`** or **`agent log`** before adding new probes.

---

## 7. Quick verification checklist

1. **Photos:** Add listing photos → should complete or fall back to **`upload-photo`** within ~60s; check Network for **`/storage/v1/object/...`** then possibly **`/functions/v1/upload-photo`**.
2. **Submit listing:** Submit with terms + photos → RPC or Edge path should finish or error within bounded time (no infinite spinner).
3. **Deploy:** **`upload-photo`** after changing that function.

---

*Generated for continuity of build; update this file when you land further changes.*
