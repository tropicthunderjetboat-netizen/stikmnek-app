-- Run in Supabase Dashboard → SQL Editor (production project hbaflbmfptobyfqbudrt)
-- Use when www.stikmnek.com shows zero listings but offerings exist in the dashboard.

-- 1) Quick check: does the view exist and return rows?
SELECT COUNT(*) AS active_listings
FROM public.business_listings_view
WHERE active = true;

-- 2) If the view is missing or broken, re-apply the credentials migration view block
--    (or run the full migration file: supabase/migrations/20260525120000_business_credentials.sql)

-- 3) Confirm anon can read (required for public site)
GRANT SELECT ON public.business_listings_view TO anon;
GRANT SELECT ON public.business_listings_view TO authenticated;
