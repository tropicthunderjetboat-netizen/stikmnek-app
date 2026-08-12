# StikmNek - Vanuatu Tourist Deals Platform

> Free trip planner for Vanuatu — save favorites, build your trip, then unlock discounts with a Holiday Pass. Local businesses list free.

**Canonical pricing source:** `src/data/pricing.ts`  
**Last audited:** 12 August 2026 — Long-stay focus, No QR UI, WhatsApp business onboarding

Keep Edge pricing in sync: `supabase/functions/_shared/pricingDynamic.ts`.

---

## Overview

StikmNek helps **long-stay tourists (about 7–14 days)** plan Vanuatu and save money with local partners. Cruise-day visitors are secondary.

**How it works (simple):**

1. **Free trip planner** — Browse ~63 local spots on the swipe feed. Tap ❤️ to save places under **Saved**.
2. **Holiday Pass** — Buy a party-based Pass (hero: Solo Holiday **A$30** / Couple Holiday **A$40** for 7 days). Save up to **35%** at partners.
3. **Show the Pass** — Visual card only: big name, party size, **VALID UNTIL**, and a live pulsing **✓ VALID** clock. No QR in the UI.
4. **Pay the business direct** — Tourist pays the venue as normal, minus the Pass discount. StikmNek does **not** take commission on those sales and does **not** process business payments.

**Revenue:** Pass sales (AUD via PayPal) + optional **A$5 Super Star** tip. Listings are **free forever**.

**Businesses:** StikmNek team onboards via WhatsApp from `/list-your-business`. No self-serve “list and pay” product; no scanning by staff.

---

## Pass Pricing (live)

Source of truth: **`src/data/pricing.ts`** (mirrored in Edge `pricingDynamic.ts`).

| Rule | Amount (AUD) |
|------|----------------|
| 1st guest (ages **6+**) | **A$15** |
| Each extra guest (2–20) | **A$10** |
| Kids under 6 | Free |
| Max party | **20** |
| 1-day Pass | Headcount only |
| Holiday 7-day add-on | **+A$15** |
| Share bonus (Holiday) | +7 days → **14 days** total |

**Examples**

| Product | Party | Math | Total |
|---------|-------|------|-------|
| Solo 1-day | 1 | A$15 | **A$15** |
| Solo Holiday (hero) | 1 + 7-day | A$15 + A$15 | **A$30** |
| Couple Holiday (hero) | 2 + 7-day | A$15 + A$10 + A$15 | **A$40** |

Prices exclude payment processing fees. Pass is non-transferable; name should match ID. Super Star is **A$5 AUD**, separate from the Pass.

---

## User Flows

### Tourist

1. Open the app → swipe feed of local spots  
2. Tap ❤️ → places land in **Saved**  
3. Buy a **Holiday Pass** (or 1-day) at checkout (PayPal / promo)  
4. Show **PassCard** at the venue (name + party + valid until + live VALID)  
5. Pay the business **direct**, minus discount  
6. Optional: message partners on WhatsApp once Pass is active  

### Business

1. Tap **List your business — free** (home / Hero / Footer)  
2. Open `/list-your-business` — EN 🇦🇺 / FR 🇫🇷 / BI 🇻🇺  
3. Tap **Message us on WhatsApp** (English prefill to StikmNek team)  
4. StikmNek team adds listing (photos, pin, discount) — **free forever**  

### Admin

- Hidden shell at `/admin` (staff / admin roles)  
- Approvals, users, listings, promos, ops  

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend (React SPA / PWA)                                  │
│  SwipeDiscover · Saved · PassCard · Checkout · Map · Deals   │
│  /list-your-business (public, no auth)                       │
├─────────────────────────────────────────────────────────────┤
│  Supabase                                                    │
│  Auth · Postgres · Storage · Edge Functions                  │
├─────────────────────────────────────────────────────────────┤
│  PayPal (Pass + Super Star) · Resend (email) · Sentry / GA4 │
└─────────────────────────────────────────────────────────────┘

DEPRECATED (keep out of tourist/business UI product story):
  · QR scanning UI (QRScanner.tsx)
  · verify-redemption Edge Function (backend may still exist)
  · Business Owner Dashboard as primary onboarding (use WhatsApp page instead)
```

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| UI | React 18, TypeScript, Vite, Tailwind, shadcn/ui |
| Routing | React Router (`App.tsx` + `AppLayout` view modes) |
| Backend | Supabase (Auth, DB, Storage, Edge Functions) |
| Payments | PayPal Smart Buttons (`VITE_PAYPAL_CLIENT_ID` + Edge secrets) |
| Email | Resend |
| Maps | Leaflet |
| PWA | Service worker / installable |
| Monitoring | Sentry relay, GA4 (consent-gated) |

---

## Project Structure

```
src/
  App.tsx                 # Routes: /list-your-business, /* → AppLayout
  pages/
    ListBusiness.tsx      # Public list-free page (EN/FR/BI + WhatsApp)
    ResetPassword.tsx
  components/
    SwipeDiscover.tsx     # Home feed + Saved hearts
    PassCard.tsx          # Visual Pass (no QR)
    PassCards.tsx         # Pricing / purchase marketing
    DealsPricingCard.tsx
    PaymentCheckout.tsx
    PaymentConfirmation.tsx
    MyFavoritesList.tsx   # Saved tab
    Hero.tsx / Footer.tsx / Navbar.tsx / BottomNav.tsx
    Dashboard.tsx         # Tourist profile
    AdminPanel.tsx
    … business hub files (legacy / still routable — see Loose Ends)
  data/
    pricing.ts            # CANONICAL pass pricing
    translations.ts       # Tourist UI: en | fr only
    businesses.ts
  lib/                    # Helpers (trip storage, PayPal SDK, etc.)
supabase/functions/       # Edge API
```

### Deprecated / legacy UI files (do not treat as product truth)

| File | Status |
|------|--------|
| `QRScanner.tsx` | **DEPRECATED** — not wired in BusinessOwnerDashboard UI after long-stay refactor; file still in repo |
| `QRCodeDisplay.tsx` | Re-exports `PassCard` only |
| `PassTicketCard.tsx` | Old cream ticket + optional QR image — superseded by `PassCard` |
| `lib/qrCode.ts` | QR data-URL helper — legacy; Pass UI no longer depends on it for display |
| `BusinessOwnerDashboard.tsx` | Still at `/hub` for signed-in business accounts — **not** the public list path |
| `ForBusinessLanding.tsx` | `/for-business` — still QR / scan / signup oriented copy |
| `verify-redemption` | Edge Function **DEPRECATED** for product UI |

---

## Edge Functions

### Active (product)

| Function | Role |
|----------|------|
| `create-checkout` | Start PayPal Pass order (uses shared pricing) |
| `paypal-capture` | Capture payment, issue Pass |
| `claim-promo-pass` | Free / promo Pass (e.g. FIRST25) |
| `extend-pass` | Share-bonus second week |
| `process-card-payment` | Legacy / mock card path when Smart Buttons unset |
| `create-user-profile` | Profile bootstrap |
| `manage-business` | Listings, analytics, owner ops |
| `upload-photo` / `upload-credential` | Media & credentials |
| `send-email` | Transactional mail |
| `notify-expiring-deals` | Deal expiry ops |
| `request-password-reset` | Auth email |
| `sentry-relay` | Error relay |
| `trigger-ssg-rebuild` | Static rebuild hook |

Shared: `_shared/pricingDynamic.ts`, `passSpan.ts`, `cors.ts`, `resend.ts`, `purchaseNotify.ts`, …

### Deprecated

| Function | Notes |
|----------|--------|
| **`verify-redemption`** | QR / scan redemption API. **Keep in backend if deployed, but treat as DEPRECATED.** Product Pass is visual-only; UI should not call this. |

---

## Routing (current)

| Path | Purpose |
|------|---------|
| `/` | Tourist swipe home |
| `/saved` | Saved places |
| `/deals` · `/map` · `/passes` | Deals grid, map, Pass marketing |
| `/checkout` · `/payment-confirmation` | Buy Pass |
| `/list-your-business` | Public business info + WhatsApp (EN/FR/BI) |
| `/for-business` | Older marketing join page (see Loose Ends) |
| `/business/new` · `/hub` | Listing form / business hub (legacy self-serve) |
| `/admin` | Admin |
| `/help` · `/faq` · `/legal/*` | Help & legal |

---

## Languages

| Surface | Languages |
|---------|-----------|
| Main tourist app (`translations.ts` Language type) | **EN + FR** only |
| `/list-your-business` page-local toggles | **EN + FR + BI** |
| Navbar language switcher | EN + FR |

Dead BI ternaries still exist in many components (never selected when Language is `en` \| `fr`) — see Loose Ends.

---

## Copy rules (product)

**Prefer**

- Save up to 35% with Pass  
- Free to use / Free forever  
- You get paid as normal (tourist pays you direct)  
- Show your Pass / visual Pass  

**Avoid**

- “local prices”  
- “unlock direct discounts” / heavy “unlock” sales speak where avoidable  
- “exclusive”  
- “scan QR” / staff scanning  

---

## Loose Ends Found

Audit vs founder product truth (12 Aug 2026). **App and README disagree here — fix later; README is not claiming these are fixed.**

### QR / redemption (should be out of product UI)

- `src/components/QRScanner.tsx` — full scanner + `verify-redemption` invokes; file remains  
- `supabase/functions/verify-redemption/` — **DEPRECATED** Edge Function still in repo  
- `src/lib/qrCode.ts`, `PassTicketCard.tsx` — QR-era helpers / UI  
- `HowItWorks.tsx` — still says show QR / “exclusive discount”  
- `HelpCenter.tsx` — large sections still teach QR scan for tourists **and** business hub scanning  
- `ForBusinessLanding.tsx` — “scan their pass QR”, dashboard scans  
- `CompleteTouristProfile.tsx` — “QR unlocks WhatsApp”  
- `usePassConfig.ts` — feature copy “QR code redemptions”  
- `Dashboard.tsx` — tourist redemption history / savings tracker still shown; comment about QR offline  
- `BusinessDetail.tsx` / `BusinessCard.tsx` / `MapView.tsx` — “unlock” member rates / contact  

### Business onboarding (should be WhatsApp-first)

- Homepage / Hero / Footer correctly point to `/list-your-business`  
- **`/hub` + `BusinessOwnerDashboard`** still fully available for business users (Navbar “My Business”)  
- **`/business/new` + `BusinessListingForm`** — self-serve listing + auth gates still live  
- **`/for-business` (`ForBusinessLanding`)** — signup-business + QR-era narrative  
- `AuthModal` still supports `signup-business`  
- `ListYourBusinessCta.tsx` — primary CTA goes to list page, but still has “Already have an account? Sign in” (and may reference `setAuthMode` / `setShowAuth`)  
- `AppLayout` still forces complete-business-profile / listing gates for business accounts  

### BI / i18n debt

- Main `Language` is `en` \| `fr` (good)  
- Many components still have `language === 'bi'` branches (dead code): e.g. `MyFavoritesList`, `BusinessDetail`, `BusinessGrid`, `PassEditor`, `categoryPricing`, `Footer` Help labels, etc.  
- BI is **correct** only as local state on `/list-your-business`  

### Pricing / copy drift

- Live math in `pricing.ts` ↔ `pricingDynamic.ts` **matches** (A$15 / A$10 / +A$15 Holiday) — good  
- `PassEditor` / `EmailNotificationCenter` still mention Weekly-style labels in places  
- Share / unlock wording remains in `translations.ts` (`share.*`, about page “unlock fair local deals”)  
- Hero / PassCards / ListBusiness copy largely aligned with long-stay story  

### Saved vs My Trip

- UI labels largely moved to **Saved** (BottomNav, Welcome footer, toasts)  
- No remaining `"My Trip"` string matches in `src/` at audit time  

### Analytics / charts

- `DashboardAnalytics.tsx` simplified for business (no Recharts charts)  
- `AdminPurchaseOverview.tsx` still uses **recharts** (admin-only — OK)  
- Tourist `Dashboard.tsx` still has redemption savings analytics (old scan-era model)  

### `/list-your-business` checklist

- Exists at `src/pages/ListBusiness.tsx`  
- Routed in `App.tsx` + `viewModes`  
- EN / FR / BI flag buttons  
- WhatsApp CTA English-only message to `wa.me/6787766107`  
- No auth required  

---

## Deployment

Typical path: **Vite build → Vercel (or similar) + Supabase** (DB, Auth, Edge Functions, Storage).

```bash
npm install
npm run dev          # local
npm run build        # production + SSG helper
npm run functions:deploy
```

Deploy Edge Functions with Supabase CLI; set secrets for PayPal, Resend, etc.

---

## Environment Variables

### Frontend (Vite) — see `env.example`

| Variable | Purpose |
|----------|---------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Anon key |
| `VITE_SITE_URL` | Canonical site URL (emails / redirects) |
| `VITE_PAYPAL_CLIENT_ID` | Public PayPal client ID for Smart Buttons (must match Edge live/sandbox mode) |

Optional: perf / Sentry flags (`VITE_PERF_*`, `VITE_SENTRY_RELAY_IN_DEV`).

### Edge (Supabase secrets)

| Variable | Purpose |
|----------|---------|
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | PayPal REST app |
| `PAYPAL_MODE` | `sandbox` or `live` |
| Resend / template IDs | Transactional email |
| Service role / ops notify secrets | As configured per function |

If `VITE_PAYPAL_CLIENT_ID` is unset, checkout may fall back to the older card / mock path via `process-card-payment`.

---

## Getting Started (devs)

1. Copy `env.example` → `.env.local` and fill values  
2. `npm install` && `npm run dev`  
3. Point Supabase CLI at the project; deploy functions as needed  
4. For pricing changes: edit **`src/data/pricing.ts`** and mirror **`supabase/functions/_shared/pricingDynamic.ts`**, then redeploy checkout-related functions  

---

## Testing

```bash
npm test
npm run lint
```

Prefer fixing Loose Ends before expanding QR / business-dashboard tests — those paths are not the intended product.

---

## Product north star (founder)

- **Long-stay first** (7–14 day Holiday Pass story)  
- **Free planner → Saved → Holiday Pass → show visual Pass**  
- **Businesses list free** via WhatsApp; pay-direct, no commission  
- **No QR in the UI**  
- **EN + FR** for tourists; **BI** only on the list-business info page  

When code and this README disagree, trust this document’s **Intended product** sections and the **Loose Ends** list — then fix the code.
