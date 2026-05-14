# StikmNek → Resend dashboard templates

**Ready-to-paste HTML examples** (`supabase/examples/`):

| File | Secret |
|------|--------|
| `resend-pass-confirmation.example.html` | `RESEND_TEMPLATE_PASS_CONFIRMATION` |
| `resend-booking-inquiry.example.html` | `RESEND_TEMPLATE_BOOKING_INQUIRY` |
| `resend-paypal-receipt.example.html` | `RESEND_TEMPLATE_PAYPAL_RECEIPT` |
| `resend-listing-live.example.html` | `RESEND_TEMPLATE_LISTING_LIVE` |
| `resend-business-approved.example.html` | `RESEND_TEMPLATE_BUSINESS_APPROVED` |
| `resend-business-rejected.example.html` | `RESEND_TEMPLATE_BUSINESS_REJECTED` |

Use this when your sending domain is verified in Resend. Create **one published template per row** (or split approved/rejected as below), add variables in the editor (`{{` → variable), then paste the **variable keys** exactly as listed—Edge Functions pass the same keys in the API.

**Activate a template:** set the matching secret in Supabase → Edge Functions → Secrets to the template’s **id** or **alias** (from Resend). If the secret is unset, the app keeps sending **inline HTML** (current behavior).

| Secret (Supabase) | When it’s used |
|-------------------|----------------|
| `RESEND_TEMPLATE_PASS_CONFIRMATION` | `send-email` → `send_pass_confirmation` |
| `RESEND_TEMPLATE_BOOKING_INQUIRY` | `send-email` → `send_booking_inquiry` |
| `RESEND_TEMPLATE_PAYPAL_RECEIPT` | `paypal-capture` → PayPal receipt mail |
| `RESEND_TEMPLATE_LISTING_LIVE` | `manage-business` → first listing live congratulations |
| `RESEND_TEMPLATE_BUSINESS_APPROVED` | `send-email` `send_business_decision` + `manage-business` admin path when approved |
| `RESEND_TEMPLATE_BUSINESS_REJECTED` | same, when rejected |

**Reserved variable names in Resend** (do not use as keys): `FIRST_NAME`, `LAST_NAME`, `EMAIL`, `UNSUBSCRIBE_URL`, `contact`, `this`. This doc uses `GUEST_MAIL` instead of `EMAIL`.

**Syntax in the Resend editor:** use `{{{KEY}}}` for values you expect to contain safe HTML, or `{{KEY}}` for plain text—see [Resend template variables](https://resend.com/docs/dashboard/templates/template-variables).

**Number vs string in Resend:** each variable has a **type** in the template inspector. Match what the Edge Function sends: pure counts like `ADULTS_COUNT` are **numbers**; money/VT lines, names, and URLs are **strings** (even if they look numeric). If you pick **Number** but the API sends a string (e.g. `TOTAL_DEAL_VT`), Resend shows a warning — switch that variable to **String** and use a text fallback like `—` or `0`.

### Clearing “publish” warnings in Resend

Resend often warns until the template has **defaults** for sender, subject, and preview text, and until each variable has a **fallback** (optional value if the API omits it).

| Warning | What to do |
|--------|------------|
| **From address is not set** | In the template’s **Settings** (or envelope fields), set **From** to your verified sender, e.g. `StikmNek <no-reply@stikmnek.com>`. Live sends from our Edge Functions **also** send `from` from `RESEND_FROM_*` secrets; that value **wins** when present. |
| **Subject is not set** | Set a default subject like `Your StikmNek receipt`. The app sends the real subject (`StikmNek receipt — …`) on each request; it **overrides** this default. |
| **Preview text is not set** | Set a short **preview / preheader** line (e.g. `Your purchase receipt and pass details`). Purely for inbox preview; optional but clears the warning. |
| **`FOOTER_YEAR` has no fallback** | Click the **FOOTER_YEAR** variable → in the inspector set **fallback** to the current year (type **number**, e.g. `2026`). Same idea for any other variable Resend flags: give a safe fallback (`—`, `0`, etc.) so test previews work without every variable filled. |

---

## 1. Pass purchase receipt (`RESEND_TEMPLATE_PASS_CONFIRMATION`)

**Subject (API):** still set by code: `StikmNek receipt — StikmNek Pass` (product name is fixed in EN for email).

| Variable | Type | Description |
|----------|------|-------------|
| `USER_NAME` | string | Display name (may be empty) |
| `PASS_LABEL` | string | Always **StikmNek Pass** in EN (matches app; Resend variable name unchanged) |
| `RECEIPT_NUMBER` | string | Receipt id |
| `AMOUNT_FORMATTED` | string | Formatted money, e.g. `AUD 45.00` |
| `PAYMENT_METHOD` | string | e.g. PayPal, Card |
| `VALID_FROM` | string | Human-readable start |
| `VALID_UNTIL` | string | Human-readable end |
| `DURATION_LABEL` | string | e.g. `7 days` |
| `SHARE_BONUS_LABEL` | string | e.g. `Applied ✓` / `Not applied` |
| `PROMO_HEADLINE` | string | Share-bonus promo title |
| `PROMO_BODY` | string | Share-bonus promo copy |
| `FOOTER_YEAR` | number | Copyright year — set a **numeric fallback** in Resend (e.g. current year) to clear publish warnings |

Design tip: mirror the current rich layout (hero, table, promo card, CTA to `https://www.stikmnek.com`).

---

## 2. Booking inquiry to business (`RESEND_TEMPLATE_BOOKING_INQUIRY`)

**Subject (API):** `StikmNek booking inquiry — {listing name}`.

| Variable | Type | Description |
|----------|------|-------------|
| `LISTING_NAME` | string | Business / listing title |
| `VISIT_DATE` | string | Preferred visit date |
| `ADULTS_COUNT` | number | Adults — in Resend set variable type **Number** (fallback `0`) |
| `CHILDREN_COUNT` | number | Children — type **Number** (fallback `0`) |
| `INFANTS_COUNT` | number | Infants — type **Number** (fallback `0`) |
| `TOTAL_STANDARD_VT` | string | Display VT amount — type **String** in Resend (API sends text, not a number) |
| `TOTAL_DEAL_VT` | string | Display VT amount — type **String** |
| `SAVINGS_VT` | string | Display VT amount — type **String** |
| `GUEST_NAME` | string | Tourist name |
| `GUEST_MAIL` | string | Tourist reply address (not named `EMAIL`) |
| `GUEST_WHATSAPP` | string | Optional; empty if none |
| `GUEST_PHONE` | string | Optional; empty if none |
| `GUEST_MESSAGE` | string | Optional; empty if none |

Footer reminder: “Reply directly to this email to reach the guest.” `reply_to` is still set by code from the tourist.

---

## 3. PayPal capture receipt (`RESEND_TEMPLATE_PAYPAL_RECEIPT`)

**Subject (API):** `StikmNek receipt — StikmNek Pass`.

| Variable | Type | Description |
|----------|------|-------------|
| `PASS_LABEL` | string | Always **StikmNek Pass** in EN for receipts |
| `RECEIPT_NUMBER` | string | |
| `VALID_FROM` | string | |
| `VALID_UNTIL` | string | |
| `AMOUNT` | string | Two decimals, e.g. `45.00` |
| `CURRENCY` | string | e.g. `AUD` |

---

## 4. Listing live — owner celebration (`RESEND_TEMPLATE_LISTING_LIVE`)

**Subject (API):** `Congratulations! Your StikmNek Listing is Live!`

| Variable | Type | Description |
|----------|------|-------------|
| `BUSINESS_NAME` | string | Escaped display name |
| `LISTING_URL` | string | Full URL to listing |
| `BADGE_URL` | string | `https://www.stikmnek.com/images/stikmnek-badge.png` |
| `SOCIAL_HASHTAG_LINE` | string | Suggested hashtags line |

Plain-text version: code still sends `text` only for the **inline** path. If you rely entirely on the template, optional plain body can be added later in Resend or we extend the API.

---

## 5. Business decision — approved (`RESEND_TEMPLATE_BUSINESS_APPROVED`)

**Subject (API):** `Your business "{name}" has been approved!`

| Variable | Type | Description |
|----------|------|-------------|
| `BUSINESS_NAME` | string | Escaped |
| `ADMIN_NOTES` | string | Plain text; empty if none |

Body should match current copy: congratulations + live on StikmNek + optional admin note.

---

## 6. Business decision — rejected (`RESEND_TEMPLATE_BUSINESS_REJECTED`)

**Subject (API):** `Update on your business "{name}" listing`

| Variable | Type | Description |
|----------|------|-------------|
| `BUSINESS_NAME` | string | Escaped |
| `ADMIN_NOTES` | string | Plain text; empty if none |

Body: not approved + optional note + contact support.

---

## Workflow checklist

1. Verify domain in Resend.
2. Create each template in **Resend → Templates**; define variables; **Publish**.
3. Copy each template id (or set an **alias** and use that string).
4. `supabase secrets set RESEND_TEMPLATE_PASS_CONFIRMATION=your_alias_or_uuid` (repeat per template you want live).
5. Redeploy edge functions: `send-email`, `manage-business`, `paypal-capture`.
6. Send a test (pass confirmation, booking inquiry, etc.) and confirm **Logs** in Resend.

If a secret is wrong or the template is unpublished, Resend returns an error; the app falls back only when the secret is **unset**, not on API failure.
