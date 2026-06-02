# StikmNek — Canva-Ready Ad One-Pager (Tourist + Business)

Use this document to build print flyers, Meta/Google static ads, and story crops in **Canva**. It mirrors `docs/MASTER_AI_PROMPT.md` §8 (Brand & creative system).

---

## Quick setup in Canva

1. **Create design → Custom size → A4** (2480 × 3508 px) or **US Letter** (2550 × 3300 px) for print.
2. **Brand Kit → Upload logo:** `public/app-icon.png` or https://www.stikmnek.com/app-icon.png
3. **Brand Kit → Colours:** `#0D9488` `#059669` `#F97316` `#111827` `#FFFFFF` `#F0FDFA`
4. **Brand Kit → Font:** Inter (or **Montserrat** / **DM Sans**)
5. Duplicate the page for **1080×1080** (feed) and **1080×1920** (story) — crop zones below.

---

## Master layout — Dual audience (A4 portrait)

**Canvas:** A4 portrait, 2480 × 3508 px, margins 120 px all sides unless noted.

### LAYER 1 — Full-bleed background photo

| Property | Value |
|----------|--------|
| Asset | Vanuatu hero photo (harbour, dining, or tour) — or site OG: https://d64gsuwffb70l.cloudfront.net/698d2153e3f311f6bf471393_1771292371796_03759d98.jpg |
| Fit | Cover full canvas |
| Overlay | Rectangle full canvas, colour `#0F766E`, opacity **55%** |
| Second overlay (optional) | Gradient top→bottom: `#0F766E` 70% at top → transparent 40% at middle |

---

### LAYER 2 — Top header band (full width)

| Property | Value |
|----------|--------|
| Height | 420 px |
| Fill | Gradient L→R: `#0D9488` → `#059669` |
| Position | Y = 0 |

**Elements inside header (left to right):**

| Element | Spec |
|---------|------|
| Logo | `app-icon.png`, 140 × 140 px, corner radius 28 px, X=120, Y=140 |
| Wordmark | Text **StikmNek**, Inter ExtraBold 72 pt, gradient fill `#FFFFFF` → `#D1FAE5` OR solid white |
| Tagline | *Vanuatu's local deals platform*, Inter Medium 28 pt, `#FFFFFF` at 90% opacity, below wordmark |
| Badge (right) | Pill: *100% locally owned*, bg `#FFFFFF` at 15%, border 2 px `#FFFFFF` at 40%, padding 16×32, Inter Semibold 22 pt white |

---

### LAYER 3 — Main headline (centre, over photo)

| Property | Value |
|----------|--------|
| Text | **One platform. Two ways to win.** |
| Font | Inter ExtraBold 64 pt, white `#FFFFFF`, centre align |
| Y position | ~520 px from top |
| Max width | 2200 px |

**Subhead (below, 24 px gap):**

| Text | Font |
|------|------|
| *Tourists save with one pass. Local businesses list free and get scanned foot traffic.* | Inter Regular 32 pt, `#FFFFFF` at 85%, centre |

---

### LAYER 4 — Two columns (split panel)

**Container:** Y starts ~900 px, height ~1650 px, gap between columns 48 px, equal width.

#### LEFT COLUMN — TOURISTS (orange accent)

| Property | Value |
|----------|--------|
| Card bg | `#FFFFFF`, corner radius 40 px |
| Top stripe | 12 px height, `#F97316` full width of card |
| Shadow | Blur 40, Y offset 12, colour `#0D9488` at 20% |

**Card content (padding 56 px):**

| # | Element | Copy / spec |
|---|---------|-------------|
| 1 | Icon | Plane or ticket emoji/icon, 48 px, colour `#F97316` |
| 2 | Label | **FOR TOURISTS**, Inter Bold 24 pt, `#F97316`, letter-spacing 2% |
| 3 | Headline | **Discover Vanuatu's Best Deals**, Inter Bold 44 pt, `#111827` |
| 4 | Bullets | Inter Regular 26 pt, `#374151`, line height 1.45 |
| | • | Save **up to 35%** on dining, tours, activities, spa & accommodation |
| | • | Buy your **StikmNek Pass** (from **A$15** AUD) before you travel |
| | • | Browse deals on your phone — show **QR code** at partners |
| | • | **1-day** or **7-day Holiday Pass** (+ share bonus for extra days) |
| 5 | CTA button | Fill `#F97316`, text **Get Your Pass**, white Inter Bold 28 pt, pill radius 20 px, padding 20×48 |
| 6 | URL | **www.stikmnek.com**, Inter Semibold 22 pt, `#0D9488`, centred under button |

#### RIGHT COLUMN — BUSINESSES (teal accent)

| Property | Value |
|----------|--------|
| Card bg | `#FFFFFF`, corner radius 40 px |
| Top stripe | 12 px height, `#0D9488` full width |
| Shadow | Same as left card |

**Card content (padding 56 px):**

| # | Element | Copy / spec |
|---|---------|-------------|
| 1 | Icon | Store/briefcase icon, 48 px, colour `#0D9488` |
| 2 | Label | **FOR LOCAL BUSINESSES**, Inter Bold 24 pt, `#0D9488` |
| 3 | Headline | **List free. Reach tourists.**, Inter Bold 44 pt, `#111827` |
| 4 | Bullets | Inter Regular 26 pt, `#374151` |
| | • | **No listing fee** — ever |
| | • | Submit your deal with photos & prices (VT) — we approve quality listings |
| | • | Tourists scan your **QR** in the **Business Hub** — proof of visit |
| | • | Dining · Tours · Activities · Spa · Shopping · Accommodation |
| 5 | CTA button | Gradient `#0D9488` → `#059669`, text **List Your Business (Free)**, white Inter Bold 26 pt |
| 6 | URL | **www.stikmnek.com** → sign up as Business, Inter Semibold 22 pt `#0D9488` |

---

### LAYER 5 — How it works (narrow strip)

**Position:** Y ~2680 px, full width minus margins.

| Property | Value |
|----------|--------|
| Background | `#F0FDFA`, radius 32 px, border 2 px `#99F6E4` |
| Title | **How it works**, Inter Bold 32 pt, `#0F766E`, centred |

**Three steps (horizontal, equal columns):**

| Step | Tourist | Business |
|------|---------|----------|
| **1** | Buy **StikmNek Pass** | Sign up **free** |
| **2** | Pick a deal on Map/Deals | Get approved & go live |
| **3** | Show **QR** → save | **Scan QR** → honor deal |

Circle numbers: 56 px, fill gradient teal→emerald, white Bold 28 pt.

---

### LAYER 6 — Footer bar

| Property | Value |
|----------|--------|
| Height | 280 px |
| Fill | `#111827` |
| Y | Bottom of canvas |

| Element | Spec |
|---------|------|
| Logo small | 80 × 80 px, left 120 px, vertically centred |
| Contact block | Inter Regular 24 pt, `#9CA3AF` |
| | **stikmnek@gmail.com** · **+678 7766107** |
| | **www.stikmnek.com** (white Semibold 28 pt) |
| Legal line | Inter Regular 18 pt, `#6B7280` |
| | © 2026 StikmNek Limited · Vanuatu · Pass terms at stikmnek.com/legal/terms |
| QR (optional) | 160 × 160 px, links to https://www.stikmnek.com, right margin 120 px |

---

## Social ad crops (from same design)

### Instagram / Facebook feed — 1080 × 1080

1. Duplicate A4 design → resize canvas to 1080 × 1080.
2. **Crop focus:** Header band + both column cards (hide footer or compress).
3. **Safe zone:** Keep logo and CTAs inside centre 900 × 900 (Meta text overlay safe area).
4. **Primary text (outside image or on image top):**  
   *Save in Vanuatu with StikmNek Pass · Local businesses list free*

### Story / Reels — 1080 × 1920

**Stack vertically (top → bottom):**

| Zone | Height | Content |
|------|--------|---------|
| Header | 280 px | Logo + StikmNek + gradient band |
| Tourist block | 720 px | Orange stripe card — headline + 3 bullets + orange CTA |
| Business block | 720 px | Teal stripe card — headline + 3 bullets + teal CTA |
| Footer | 200 px | www.stikmnek.com + phone |

Background: full-bleed photo + teal overlay 60%.

---

## Alternate: Single-audience variants

Duplicate the master file twice:

| File name | Change |
|-----------|--------|
| `StikmNek-Ad-Tourist` | Full width orange card only; headline *Discover Vanuatu's Best Deals*; CTA *Get Your Pass* |
| `StikmNek-Ad-Business` | Full width teal card only; headline *List free on StikmNek*; CTA *List Your Business (Free)* |

Use for targeted Meta ad sets (AU/NZ/FR tourists vs Vanuatu geo business owners).

---

## French mini-block (optional, bottom of business card or second page)

| Element | Copy |
|---------|------|
| Headline | **Découvrez les meilleures offres du Vanuatu** |
| CTA | **Obtenez votre pass** · **Inscrivez votre entreprise (gratuit)** |

---

## Bislama strip (optional — community / field print)

Pill banner, bg `#0D9488`, white text 22 pt:

*100% lokal · Sapotem smol bisnis blong Vanuatu · Faenem dils long www.stikmnek.com*

---

## Export checklist

- [ ] PNG @2× for digital (1080+, 2480+ width)
- [ ] PDF print — CMYK if printing professionally (Canva Pro)
- [ ] Logo not stretched; corner radius on icon matches site (~20% of icon size)
- [ ] Phone and URL match live site
- [ ] No “100+ deals” unless inventory updated in master prompt metrics
- [ ] Test QR code on phone before print run

---

## Copy-paste block for Canva Magic Write / AI

```
Design a dual-audience A4 flyer for StikmNek, Vanuatu. Brand colors: teal #0D9488, emerald #059669, orange CTA #F97316, dark footer #111827. Font: Inter or Montserrat. Top: gradient header with logo and "StikmNek - Vanuatu's local deals platform". Two white cards side by side: LEFT "FOR TOURISTS" orange accent - Discover Vanuatu's Best Deals, bullets about StikmNek Pass, up to 35% savings, QR redemption, from A$15, CTA Get Your Pass. RIGHT "FOR LOCAL BUSINESSES" teal accent - List free, no listing fee, QR scanner in Business Hub, categories dining tours activities spa shopping accommodation, CTA List Your Business Free. Footer: stikmnek@gmail.com, +678 7766107, www.stikmnek.com. Style: tropical photo background with teal overlay, rounded corners, modern travel app aesthetic, 100% locally owned badge.
```

---

*Aligned with `docs/MASTER_AI_PROMPT.md` · Last updated June 2026*
