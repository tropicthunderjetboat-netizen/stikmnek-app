# StikmNek - Vanuatu Tourist Deals Platform

> Free trip planner for Vanuatu — save favorites, build your trip, then unlock partner discounts with a StikmNek Pass. Local businesses list free.

**Canonical pricing source:** `src/data/pricing.ts` (keep Edge `supabase/functions/_shared/pricingDynamic.ts` in sync).  
**Product brief for AI / strategy:** `docs/MASTER_AI_PROMPT.md`

## Table of Contents

- [Overview](#overview)
- [Pass Pricing (live)](#pass-pricing-live)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Edge Functions (API)](#edge-functions-api)
- [Database Schema](#database-schema)
- [Authentication](#authentication)
- [Payment Integration](#payment-integration)
- [Analytics & Monitoring](#analytics--monitoring)
- [PWA & Service Worker](#pwa--service-worker)
- [Internationalization](#internationalization)
- [Deployment](#deployment)
- [Environment Variables](#environment-variables)
- [Testing](#testing)
- [Security](#security)
- [Contributing](#contributing)

---

## Overview

StikmNek is a full-stack web/PWA that connects tourists in Vanuatu with local businesses offering exclusive discounts. Tourists can **browse and plan for free** (heart favorites / My Trip). A digital **StikmNek Pass** unlocks partner discounts and contact details; redemption is by **QR code** scanned by the business. Businesses list **free forever** — revenue is from pass sales (and optional Super Star tips), not listing fees or commissions.

### Key Features

- **Free trip planner**: Browse the vertical swipe feed, heart favorites, and build a trip before buying
- **StikmNek Pass**: Single dynamic product (party size + 1-day or 7-day Holiday) with QR verification — see [Pass Pricing](#pass-pricing-live)
- **Deal discovery**: Swipe feed (primary), `/deals` grid, and Leaflet map; categories include dining, tours, activities, transportation, shopping, spa, accommodation
- **Business Owner Dashboard**: Submit/edit listings (incl. tiered tour pricing), photos, QR scanner, reviews
- **Admin Panel**: Approvals, users, listings, promos, platform stats
- **Reviews**: Star ratings, owner responses, optional paid **Super Star** tip (A$5 AUD)
- **Payments**: PayPal Smart Buttons (sandbox + live); optional FIRST25 free promo via `claim-promo-pass`
- **Email**: Resend transactional mail (pass confirmation, ops digests, etc.)
- **i18n**: English, French, Bislama
- **PWA**: Offline support, installable, service worker caching
- **Monitoring**: Sentry relay + Google Analytics 4 (consent-gated)

---

## Pass Pricing (live)

**Do not** describe Daily / Weekly / Monthly fixed packs — that model is retired. There is one product: **StikmNek Pass**.

| Rule | Amount (AUD) |
|------|----------------|
| First paying guest (ages **6+**) | **A$15** |
| Each additional guest (2–20) | **A$10** |
| Children under 6 | Free (not counted in party) |
| **1-day** (day pass) | Base headcount only |
| **7-day Holiday** add-on | **+A$15** (7 inclusive calendar days) |
| Share bonus (Holiday) | After purchase (or prepurchase share path): unlock **+7 days** → **14 days** total |
| Max party size | **20** per pass |

**Examples:** solo 1-day **A$15** · solo Holiday **A$30** · couple 1-day **A$25** · couple Holiday **A$40**

Prices exclude payment processing fees. Passes are generally **non-refundable once activated** (support handles exceptions). Super Star tips are **A$5 AUD**, separate from the pass.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React SPA)                       │
│  React 18 + TypeScript + Tailwind CSS + shadcn/ui            │
│  Vite build system | React Router | React Query              │
├─────────────────────────────────────────────────────────────┤
│                    Supabase Platform                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  PostgreSQL   │  │ Edge Functions│  │   Storage    │       │
│  │  (Database)   │  │  (Deno API)  │  │  (Photos)    │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│  ┌──────────────┐  ┌──────────────┐                          │
│  │  Auth (GoTrue)│  │  Realtime    │                          │
│  │  Email/OAuth  │  │  WebSocket   │                          │
│  └──────────────┘  └──────────────┘                          │
├─────────────────────────────────────────────────────────────┤
│                  External Services                           │
│  PayPal (Payments) | Resend (Email) | Sentry (Errors)       │
│  Google Analytics (Tracking)                                 │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Tourist browses / plans** → React SPA loads listings (view / `business_offerings` join); hearts can stay local until signup
2. **Tourist buys or claims a pass** → Checkout builds party size + duration → PayPal (`create-checkout` / `paypal-capture`) or FIRST25 (`claim-promo-pass`) → QR pass issued
3. **Business submits listing** → Edge function → `pending_businesses` → Admin approves → live on `businesses` + `business_offerings`
4. **Business edits listing** → Edge function → `pending_edits` → Admin reviews → applied to live listings
5. **Tourist redeems deal** → Business scans QR → `verify-redemption` → redemption recorded
6. **Error occurs** → ErrorLogger → Supabase `error_logs` + Sentry relay edge function

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript 5.5, Vite 8 |
| Styling | Tailwind CSS 3.4, shadcn/ui, Radix UI |
| State | React Context, React Query |
| Routing | React Router 6 |
| Maps | Leaflet, React Leaflet |
| Charts | Recharts |
| Backend | Supabase (PostgreSQL, Edge Functions, Auth, Storage, Realtime) |
| Payments | PayPal REST API v2 |
| Email | Resend REST API |
| Monitoring | Sentry (via relay), Custom ErrorLogger |
| Analytics | Google Analytics 4, Custom analytics module |
| PWA | Service Worker, Web App Manifest |

---

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- A Supabase project (already configured)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd stikmnek-app

# Install dependencies
npm install

# Start development server
npm run dev
```

Production: `https://www.stikmnek.com`.

### Build for Production

```bash
npm run build
npm run preview  # Preview production build locally
```

---

## Project Structure

```
src/
├── components/          # React components
│   ├── ui/              # shadcn/ui base components (Button, Card, Dialog, etc.)
│   ├── AppLayout.tsx    # Main layout orchestrator (renders all views)
│   ├── Navbar.tsx       # Top navigation bar
│   ├── Hero.tsx         # Landing page hero section
│   ├── BusinessGrid.tsx # Business listing grid with filters
│   ├── BusinessCard.tsx # Individual business card component
│   ├── BusinessDetail.tsx # Business detail view
│   ├── BusinessListingForm.tsx # New business submission form
│   ├── BusinessOwnerDashboard.tsx # Business owner management panel
│   ├── EditListingPanel.tsx # Edit existing business listing
│   ├── AdminPanel.tsx   # Admin dashboard
│   ├── AuthModal.tsx    # Sign in / Sign up modal
│   ├── PaymentCheckout.tsx # PayPal checkout flow
│   ├── MapView.tsx      # Interactive Leaflet map
│   ├── QRCodeDisplay.tsx # QR code for pass verification
│   ├── QRScanner.tsx    # QR code scanner for businesses
│   ├── ReviewForm.tsx   # Submit review form
│   ├── ReviewsSection.tsx # Reviews display
│   ├── ErrorBoundary.tsx # React error boundary with Sentry
│   ├── CookieConsent.tsx # GDPR cookie consent banner
│   └── ...              # 40+ more components
├── contexts/
│   └── AppContext.tsx    # Global state management (auth, cart, favorites, etc.)
├── data/
│   ├── businesses.ts    # Business type definitions
│   ├── pricing.ts       # Live StikmNek Pass pricing (AUD) — source of truth
│   ├── passCatalog.ts   # Pass product identity / legacy DB type mapping
│   └── translations.ts  # i18n translation strings (EN/FR/BI)
├── hooks/
│   ├── useGeolocation.ts # Geolocation hook
│   ├── usePassConfig.ts  # Pass configuration hook
│   └── use-toast.ts      # Toast notification hook
├── lib/
│   ├── supabase.ts      # Supabase client initialization
│   ├── analytics.ts     # Analytics tracking (local + GA4)
│   ├── errorLogger.ts   # Error logging (Supabase + Sentry)
│   └── utils.ts         # Utility functions
├── pages/
│   ├── Index.tsx        # Main page wrapper
│   └── NotFound.tsx     # 404 page
├── main.tsx             # App entry point (error logger init, SW registration)
├── App.tsx              # Router setup
└── index.css            # Global styles + Tailwind imports

public/
├── sw.js                # Service worker (caching, offline support)
├── manifest.json        # PWA manifest
├── robots.txt           # Search engine directives
├── sitemap.xml          # XML sitemap
└── placeholder.svg      # Placeholder icon
```

---

## Edge Functions (API)

All server-side logic runs as Supabase Edge Functions (Deno runtime).

### `manage-business`
The primary API endpoint handling 25+ actions:

| Action | Category | Description |
|--------|----------|-------------|
| `get_or_create_profile` | Auth | Create or retrieve user profile |
| `update_profile` | Auth | Update user profile fields |
| `get_profile` | Auth | Get user profile by ID |
| `submit_business` | Business | Submit new business for review |
| `get_owner_businesses` | Business | Get businesses owned by user |
| `get_all_owner_data` | Business | Get all owner data (approved + pending) |
| `submit_edit` | Business | Submit edit request for existing business |
| `get_pending_edits` | Business | Get pending edit requests |
| `submit_review` | Reviews | Submit a business review |
| `get_reviews` | Reviews | Get reviews for a business |
| `respond_to_review` | Reviews | Business owner responds to review |
| `review_business` | Admin | Approve/reject business submission |
| `review_edit` | Admin | Approve/reject edit request |
| `admin_get_stats` | Admin | Get platform dashboard statistics |
| `admin_get_users` | Admin | List all users |
| `admin_update_user` | Admin | Update user role/details |
| `admin_delete_user` | Admin | Delete a user |
| `admin_create_business` | Admin | Create business directly |
| `admin_update_business` | Admin | Update business fields |
| `admin_delete_business` | Admin | Remove one deal: `offeringId` + `businessId`; if `onlyDealOnProfile`, also drops the profile when that was the last offer. Full wipe: `businessId` + `confirmDeleteEntireProfile: true`. |
| `admin_get_businesses` | Admin | List all businesses |

**Rate Limiting**: Built-in per-user rate limiting:
- Read operations: 60 requests/minute
- Write operations: 20 requests/minute
- Submissions: 5 per 5 minutes
- Auth operations: 10 per minute
- Admin operations: 100 per minute

### `create-checkout`
Creates a PayPal order for StikmNek Pass purchase (dynamic party size + duration pricing).

### `paypal-capture`
Captures a PayPal payment after approval and issues/activates the pass.

### `claim-promo-pass`
FIRST25 cold-start promo — claims a free pass when the campaign is active (see `docs/PROMO_FIRST25.md`).

### `extend-pass`
Extends an existing pass duration (share / holiday paths as implemented).

### `verify-redemption`
Verifies QR code and records deal redemption.

### `send-email`
Resend email delivery (pass confirmation, booking inquiries, purchase ops notify, etc.).

### `notify-expiring-deals`
Daily ops digest of deals expiring within 7 days.

### `upload-photo`
Business photo uploads to Supabase Storage.

### `upload-credential`
Business credential uploads (insurance/permits) for trust signals.

### `create-user-profile` / `request-password-reset`
Profile bootstrap and password-reset helpers.

### `trigger-ssg-rebuild`
Called after listing changes to rebuild static SEO pages via Vercel deploy hook.

### `sentry-relay`
Relays frontend errors to Sentry (keeps DSN server-side).

### `process-card-payment`
Legacy/dev card path when PayPal Smart Buttons client ID is unset.

---

## Database Schema

### Core Tables

| Table | Description |
|-------|-------------|
| `businesses` | Business profiles (company-level) |
| `business_offerings` | Live deals / listings shown in Explore (canonical for feed) |
| `pending_businesses` | Business submissions awaiting review |
| `pending_edits` | Edit requests awaiting admin approval |
| `user_profiles` | User profiles (tourist/business/admin) |
| `passes` | Tourist passes (dynamic product; legacy `pass_type` values may exist on old rows) |
| `pass_purchases` | Purchase / promo claim records |
| `redemptions` | Deal redemption records |
| `reviews` | Business reviews |
| `review_responses` | Business owner responses to reviews |
| `favorites` | User favorite listings |
| `business_photos` | Business photo gallery |
| `promo_campaigns` | Promo config (e.g. FIRST25) |
| `error_logs` | Frontend error logs |

Listings for tourists are primarily loaded from `business_listings_view` / `business_offerings` (see `src/lib/loadListings.ts`), not a flat single-row-per-business model.

---

## Authentication

Authentication is handled by Supabase Auth (GoTrue):

- **Email/Password**: Standard signup and signin
- **User Types**: Tourist, Business Owner, Admin
- **Admin Detection**: Hardcoded admin emails auto-elevated to admin role
- **Session Persistence**: localStorage with auto-refresh tokens
- **Profile Management**: Separate `user_profiles` table with extended fields

### Auth Flow

1. User signs up → Supabase creates auth user → `onAuthStateChange` fires
2. App calls `get_or_create_profile` edge function → Creates `user_profiles` record
3. Profile role determines UI access (tourist views, business dashboard, admin panel)

---

## Payment Integration

### StikmNek Pass checkout

Checkout prices from **party size (ages 6+)** and **1-day vs 7-day Holiday** using `calculatePassPrice` in `src/data/pricing.ts`. There are no separate Daily/Weekly/Monthly SKUs.

### PayPal

- **Mode**: Configurable via `PAYPAL_MODE` env var (sandbox/live) on Edge Functions.
- **PayPal Smart Buttons**: When `VITE_PAYPAL_CLIENT_ID` is set, checkout loads the PayPal JS SDK (`components=buttons`). The buyer pays in PayPal’s flow (wallet / card on PayPal); `create-checkout` creates the order and `paypal-capture` runs after approval. Use the same REST app’s **public** Live or Sandbox client ID as on the Edge secrets.
- **Legacy / dev**: If `VITE_PAYPAL_CLIENT_ID` is unset, checkout keeps the older raw card form, which calls `process-card-payment` (mock or disabled unless `CARD_MOCK_ENABLED=true` on that function).

### Environment Variables

```
# Supabase Edge (create-checkout, paypal-capture)
PAYPAL_CLIENT_ID     - PayPal app client ID
PAYPAL_CLIENT_SECRET - PayPal app secret
PAYPAL_MODE          - "sandbox" or "live"

# Vite frontend (public — use sandbox client ID for dev; live for production)
VITE_PAYPAL_CLIENT_ID - Same PayPal app’s public client ID for Smart Buttons SDK
```
---

## Analytics & Monitoring

### Google Analytics 4

- Loaded dynamically when user accepts cookie consent
- Tracks: page views, sign ups, purchases, searches, errors, Web Vitals (LCP, FID, CLS)
- GDPR compliant: No tracking until consent given
- Measurement ID configured via `GA_MEASUREMENT_ID` env var

### Sentry Error Tracking

- Frontend errors sent via `sentry-relay` edge function (DSN stays server-side)
- Captures: runtime errors, unhandled rejections, React ErrorBoundary crashes, API errors
- Severity levels: warning, error, critical (critical = immediate flush)
- Fallback: errors also stored in Supabase `error_logs` table + localStorage

### Custom Analytics

- Local event tracking in localStorage (always active, no consent needed)
- Session tracking, page view counts, commerce events
- Performance monitoring (long tasks, page load times)

---

## PWA & Service Worker

### Features

- **Offline Support**: Cached index.html served when offline
- **Asset Caching**: Cache-first for JS/CSS/fonts, network-first for API calls
- **Image Caching**: CDN images cached for 30 days
- **Auto-update**: Service worker checks for updates hourly
- **Push Ready**: Push notification handlers configured (future use)

### Manifest

```json
{
  "name": "StikmNek - Vanuatu Tourist Deals",
  "short_name": "StikmNek",
  "display": "standalone",
  "theme_color": "#0d9488",
  "start_url": "/"
}
```

---

## Internationalization

Three languages supported:

| Code | Language | Coverage |
|------|----------|----------|
| `en` | English | Full |
| `fr` | French | Full |
| `bi` | Bislama | Full |

Translation strings are in `src/data/translations.ts`. Language selection persists in app state.

---

## Deployment

### Frontend

The app is built with Vite and outputs static files, then a post-build SSG step
(`scripts/ssg/generate-static.mjs`) queries Supabase and writes crawler-readable
HTML for `/`, `/deals`, `/faq`, `/deal/:slug`, and `/partner/:slug`, plus a
dynamic `sitemap.xml`.

```bash
npm run build
# Output: dist/ (SPA assets + static SEO pages)
```

Deploy the `dist/` folder to Vercel (or any static host). Listing changes
trigger a rebuild via the `trigger-ssg-rebuild` Edge Function → Vercel Deploy Hook
(see migration `20260730120000_ssg_rebuild_triggers.sql`).

### Edge Functions

Edge functions are deployed to Supabase:

```bash
supabase functions deploy <function-name>
# SSG rebuild webhook target:
supabase functions deploy trigger-ssg-rebuild
```

### Environment Variables (Edge Functions)

Set via Supabase dashboard or CLI:

```bash
supabase secrets set SENTRY_DSN=<your-dsn>
supabase secrets set GA_MEASUREMENT_ID=<your-id>
supabase secrets set RESEND_API_KEY=<your-key>
supabase secrets set RESEND_FROM_EMAIL=no-reply@yourdomain.com
# Optional: RESEND_FROM_NAME=StikmNek
supabase secrets set PAYPAL_CLIENT_ID=<your-id>
supabase secrets set PAYPAL_CLIENT_SECRET=<your-secret>
supabase secrets set PAYPAL_MODE=live
# SSG auto-rebuild (Database Webhook / pg_net → this function → Vercel)
supabase secrets set VERCEL_DEPLOY_HOOK_URL="https://api.vercel.com/v1/integrations/deploy/..."
supabase secrets set SSG_REBUILD_SECRET="<long random string>"
```

Also add matching Vault secrets so DB triggers can call the function:
`ssg_rebuild_function_url`, `ssg_rebuild_secret` (same secret value).

---

## Environment Variables

### Edge Function Secrets

| Variable | Service | Description |
|----------|---------|-------------|
| `SUPABASE_URL` | Supabase | Auto-provided by Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | Auto-provided by Supabase |
| `PAYPAL_CLIENT_ID` | PayPal | PayPal app client ID |
| `PAYPAL_CLIENT_SECRET` | PayPal | PayPal app secret key |
| `PAYPAL_MODE` | PayPal | "sandbox" or "live" |
| `RESEND_API_KEY` | Resend | Transactional email API key (required for `send-email`, `manage-business`, `paypal-capture`) |
| `RESEND_FROM_EMAIL` | Resend | Verified sender address (e.g. `no-reply@stikmnek.com`) |
| `RESEND_FROM_NAME` | Resend | Display name for the From header (optional) |
| `RESEND_TEMPLATE_*` | Resend | Optional published template ids — see `supabase/resend-templates.md` |
| `PURCHASE_NOTIFY_EMAILS` | Resend | Comma-separated ops inboxes notified on each pass sale (default `stikmnek@gmail.com` if unset) |
| `OPS_NOTIFY_EMAILS` | Resend | Ops inboxes for daily **expiring business deals** digest (falls back to `PURCHASE_NOTIFY_EMAILS`) |
| `CRON_SECRET` | Internal | Optional manual trigger secret for `notify-expiring-deals` (scheduled runs use service role) |
| `SENTRY_DSN` | Sentry | Error tracking DSN |
| `GA_MEASUREMENT_ID` | Google | Analytics measurement ID |
| `GATEWAY_API_KEY` | Internal | API gateway key |

### Expiring business deals (ops email)

The `notify-expiring-deals` Edge Function runs **daily at 07:00 UTC** (see `supabase/config.toml`). It emails your ops inbox with every **active** deal whose `discount_valid_until` falls within the next **7 days**, including business name, deal title, expiry date, and owner contact details so you can chase renewals.

1. Deploy: `npm run functions:deploy:notify-expiring-deals`
2. Set `RESEND_API_KEY` and `OPS_NOTIFY_EMAILS` (or reuse `PURCHASE_NOTIFY_EMAILS`)
3. Manual test: `curl -X POST "$SUPABASE_URL/functions/v1/notify-expiring-deals" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"`

No email is sent when there are zero expiring deals.

### Frontend (Vite / `.env`)

| Variable | Description |
|----------|-------------|
| `VITE_PAYPAL_CLIENT_ID` | Public PayPal client ID for **Smart Buttons** checkout (`components=buttons`). Omit to use the legacy `process-card-payment` form (dev/mock). |

---

## Testing

### Demo tourist pass (business presentations)

For a non-expiring QR pass on a dedicated demo account (`tourist@gmail.com` / **Ima Tourist**):

1. Create the user in **Supabase → Authentication → Users** (email `tourist@gmail.com`, password of your choice).
2. Run `supabase/scripts/seed_demo_tourist_pass.sql` in the **SQL Editor**.
3. Sign in as that user → **My Dashboard** → show the QR code to businesses for scanning.

The script sets `valid_until` and `expires_at` to **2099-12-31** and marks the row with `payment_provider = demo`. Re-run the script anytime to refresh the pass.

### Manual Testing Checklist

- [ ] Tourist signup → Profile creation → Pass purchase → Deal redemption
- [ ] Business signup → Listing submission → Admin approval → Live listing
- [ ] Business edit → Admin review → Changes applied
- [ ] PayPal payment flow (sandbox mode)
- [ ] Email notifications (Resend: domain verified, secrets set)
- [ ] QR code generation and scanning
- [ ] Map view with geolocation
- [ ] Multi-language switching
- [ ] Offline mode (service worker)
- [ ] Error boundary recovery
- [ ] Admin panel: user management, business management, statistics

### Automated Testing (Recommended)

```bash
# Install Playwright
npm install -D @playwright/test

# Run tests
npx playwright test
```

---

## Security

### Implemented

- **Row Level Security (RLS)**: Database-level access control
- **Admin Verification**: Server-side admin role check on all admin endpoints
- **Rate Limiting**: Per-user request throttling on edge functions
- **Request Size Limits**: Max 1MB request body
- **Input Sanitization**: Field whitelisting on all update operations
- **CORS Headers**: Configured on all edge functions
- **CSP Headers**: Content-Security-Policy meta tags
- **No Frontend Secrets**: All API keys stored server-side in edge functions
- **Session Management**: Supabase Auth with auto-refresh tokens

### Headers

```html
<meta http-equiv="X-Content-Type-Options" content="nosniff" />
<meta http-equiv="X-Frame-Options" content="DENY" />
<meta name="referrer" content="strict-origin-when-cross-origin" />
```

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Style

- TypeScript strict mode
- Tailwind CSS for styling (no inline styles)
- Component files in PascalCase
- Utility files in camelCase
- Edge functions in kebab-case

---

## License

Proprietary - All rights reserved.

---

## Support

- **Email**: stikmnek@gmail.com
- **Phone**: +678 7766107
- **Website**: https://www.stikmnek.com
- **Location**: Vanuatu

---

*README pricing & product model last synced with `src/data/pricing.ts` — August 2026. If this file and the app disagree, trust the code.*

