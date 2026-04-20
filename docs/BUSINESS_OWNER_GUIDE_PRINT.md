# Printable Business Owner Guide

**File:** `public/business-owner-guide-print.html`

**Live URL (after deploy):**  
https://www.stikmnek.com/business-owner-guide-print.html

## How to use

1. Open the URL in **Chrome** or **Edge** (best PDF output).
2. Press **Ctrl+P** (Windows) or **Cmd+P** (Mac), or use the **Print or save as PDF** button on the page.
3. Choose **Save as PDF** (or Microsoft Print to PDF) to hand out a file, or print on paper.

The on-screen toolbar is hidden when printing.

## Keeping copy in sync

The printable HTML mirrors the in-app **Help Center → Business Owner Guide** (`src/components/HelpCenter.tsx`, `businessGuide` array). When you change the guide text for owners, update **both** places so the website and the printable handout stay aligned.

**Tourist copy** (Getting Started overview, **Tourist FAQ**, troubleshooting entries for travelers) lives only in `src/components/HelpCenter.tsx` — there is no separate printable HTML for tourists; use Help Center in the app or print that page from the browser if needed.
