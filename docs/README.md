# StikmNek - Vanuatu Tourist Deals Platform

> Discover the best deals on dining, tours, activities, spa & accommodation in Vanuatu. Save up to 35% with your StikmNek pass.

## Table of Contents

- [Overview](#overview)
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

StikmNek is a full-stack web application that connects tourists in Vanuatu with local businesses offering exclusive deals and discounts. Tourists purchase a pass (daily, weekly, or monthly) and unlock savings across dining, tours, activities, spa treatments, and accommodation.

### Key Features

- **Tourist Pass System**: Daily ($15), Weekly ($45), Monthly ($99) passes with QR code verification
- **Business Directory**: Searchable, filterable grid of local businesses with map view
- **Business Owner Dashboard**: Submit listings, manage photos, edit details, view analytics
- **Admin Panel**: Approve/reject listings, manage users, view platform statistics
- **Review System**: Star ratings, text reviews, business owner responses, SuperStar reviews
- **Payment Processing**: PayPal integration (sandbox + live modes)
- **Email Notifications**: SendGrid-powered transactional emails
- **Multi-language Support**: English, French, Bislama
- **Geolocation**: Nearby deals, proximity alerts, interactive Leaflet map
- **PWA**: Offline support, installable, service worker caching
- **Error Monitoring**: Sentry integration via relay edge function
- **Analytics**: Google Analytics 4 with GDPR-compliant consent management

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
│  PayPal (Payments) | SendGrid (Email) | Sentry (Errors)     │
│  Google Analytics (Tracking)                                 │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Tourist browses deals** → React SPA fetches from Supabase DB (direct client)
2. **Tourist purchases pass** → Edge function creates PayPal order → PayPal checkout → Capture webhook
3. **Business submits listing** → Edge function inserts into `pending_businesses` → Admin reviews → Approved to `businesses`
4. **Business edits listing** → Edge function inserts into `pending_edits` → Admin reviews → Applied to `businesses`
5. **Tourist redeems deal** → Edge function verifies pass validity → Records redemption → Updates savings tracker
6. **Error occurs** → ErrorLogger → Supabase `error_logs` table + Sentry relay edge function

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript 5.5, Vite 5 |
| Styling | Tailwind CSS 3.4, shadcn/ui, Radix UI |
| State | React Context, React Query |
| Routing | React Router 6 |
| Maps | Leaflet, React Leaflet |
| Charts | Recharts |
| Backend | Supabase (PostgreSQL, Edge Functions, Auth, Storage, Realtime) |
| Payments | PayPal REST API v2 |
| Email | SendGrid v3 API |
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
cd stikmnek

# Install dependencies
npm install

# Start development server
npm run dev
```

The app will be available at `http://localhost:5173`.

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
| `admin_delete_business` | Admin | Delete business and related data |
| `admin_get_businesses` | Admin | List all businesses |

**Rate Limiting**: Built-in per-user rate limiting:
- Read operations: 60 requests/minute
- Write operations: 20 requests/minute
- Submissions: 5 per 5 minutes
- Auth operations: 10 per minute
- Admin operations: 100 per minute

### `create-checkout`
Creates a PayPal order for pass purchase.

### `paypal-capture`
Captures a PayPal payment after approval.

### `superstar-checkout`
Handles SuperStar review purchases.

### `extend-pass`
Extends an existing pass duration.

### `verify-redemption`
Verifies QR code and records deal redemption.

### `send-email`
SendGrid email delivery for notifications.

### `upload-photo`
Handles business photo uploads to Supabase Storage.

### `sentry-relay`
Relays frontend errors to Sentry (keeps DSN server-side).

### `payment-webhook`
PayPal webhook handler for payment events.

---

## Database Schema

### Core Tables

| Table | Description |
|-------|-------------|
| `businesses` | Approved business listings |
| `pending_businesses` | Business submissions awaiting review |
| `pending_edits` | Edit requests awaiting admin approval |
| `user_profiles` | User profiles (tourist/business/admin) |
| `passes` | Purchased tourist passes |
| `redemptions` | Deal redemption records |
| `reviews` | Business reviews |
| `review_responses` | Business owner responses to reviews |
| `favorites` | User favorite businesses |
| `business_photos` | Business photo gallery |
| `error_logs` | Frontend error logs |

### Key Fields on `businesses`

```sql
id, name, category, description, description_fr, description_bi,
image, rating, review_count, discount, original_price, deal_price,
location, lat, lng, hours, phone, whatsapp_number,
tags, featured, owner_id, map_url, website,
discount_valid_from, discount_valid_until, super_star_count,
created_at
```

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

### PayPal

- **Mode**: Configurable via `PAYPAL_MODE` env var (sandbox/live)
- **Flow**: Create order → PayPal redirect → Capture on return
- **Pass Types**: Daily ($15), Weekly ($45), Monthly ($99)
- **SuperStar Reviews**: Additional purchase option

### Environment Variables

```
PAYPAL_CLIENT_ID     - PayPal app client ID
PAYPAL_CLIENT_SECRET - PayPal app secret
PAYPAL_MODE          - "sandbox" or "live"
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

The app is built with Vite and outputs static files:

```bash
npm run build
# Output: dist/
```

Deploy the `dist/` folder to any static hosting (Netlify, Vercel, Cloudflare Pages, etc.).

### Edge Functions

Edge functions are deployed to Supabase:

```bash
supabase functions deploy <function-name>
```

### Environment Variables (Edge Functions)

Set via Supabase dashboard or CLI:

```bash
supabase secrets set SENTRY_DSN=<your-dsn>
supabase secrets set GA_MEASUREMENT_ID=<your-id>
supabase secrets set SENDGRID_API_KEY=<your-key>
supabase secrets set PAYPAL_CLIENT_ID=<your-id>
supabase secrets set PAYPAL_CLIENT_SECRET=<your-secret>
supabase secrets set PAYPAL_MODE=live
```

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
| `SENDGRID_API_KEY` | SendGrid | Email delivery API key |
| `SENTRY_DSN` | Sentry | Error tracking DSN |
| `GA_MEASUREMENT_ID` | Google | Analytics measurement ID |
| `GATEWAY_API_KEY` | Internal | API gateway key |

---

## Testing

### Manual Testing Checklist

- [ ] Tourist signup → Profile creation → Pass purchase → Deal redemption
- [ ] Business signup → Listing submission → Admin approval → Live listing
- [ ] Business edit → Admin review → Changes applied
- [ ] PayPal payment flow (sandbox mode)
- [ ] Email notifications (SendGrid)
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
- **Website**: https://stikm.nek
- **Location**: Vanuatu

