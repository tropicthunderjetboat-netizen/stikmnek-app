import React, { useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import type { Business } from '@/data/businesses';
import { absoluteAssetUrl, buildDealShareMeta, resolveDealOgImageUrl } from '@/lib/shareMeta';

type DealOgHelmetProps = {
  business: Business;
  /** Optional override image (e.g. gallery hero already resolved). */
  imageUrl?: string | null;
};

/**
 * Client-side Open Graph / Twitter tags for a specific deal.
 * Crawlers that don't run JS still get previews via `middleware.ts` on `/deal/:slug`.
 */
const DealOgHelmet: React.FC<DealOgHelmetProps> = ({ business, imageUrl }) => {
  const meta = useMemo(() => {
    const base = buildDealShareMeta(business);
    const override = String(imageUrl ?? '').trim();
    if (override && !override.includes('placeholder')) {
      return { ...base, image: absoluteAssetUrl(override) };
    }
    return { ...base, image: resolveDealOgImageUrl(business.image) };
  }, [business, imageUrl]);

  return (
    <Helmet prioritizeSeoTags>
      <title>{meta.title}</title>
      <meta name="description" content={meta.description} />
      <link rel="canonical" href={meta.url} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="StikmNek" />
      <meta property="og:title" content={meta.title} />
      <meta property="og:description" content={meta.description} />
      <meta property="og:url" content={meta.url} />
      <meta property="og:image" content={meta.image} />
      <meta property="og:image:secure_url" content={meta.image} />
      <meta property="og:image:alt" content={business.name} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={meta.title} />
      <meta name="twitter:description" content={meta.description} />
      <meta name="twitter:image" content={meta.image} />
    </Helmet>
  );
};

export default React.memo(DealOgHelmet);
