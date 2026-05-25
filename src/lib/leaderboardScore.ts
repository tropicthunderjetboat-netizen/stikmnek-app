import type { Business } from '@/data/businesses';
import {
  effectiveListingDealPrice,
  effectiveListingOriginalPrice,
} from '@/data/businesses';
import { credentialsLeaderboardScore, type BusinessCredentialsPublic } from '@/lib/businessCredentials';
import { profileBusinessIdFor } from '@/lib/businessOfferingMap';

export const LEADERBOARD_WEIGHTS = {
  rating: 0.27,
  reviewCount: 0.18,
  superStars: 0.18,
  dealValue: 0.14,
  engagement: 0.13,
  credentials: 0.10,
} as const;

export type LeaderboardBreakdown = {
  ratingScore: number;
  reviewScore: number;
  superStarScore: number;
  dealScore: number;
  engagementScore: number;
  credentialsScore: number;
};

export function computeLeaderboardScore(
  business: Business,
  allBusinesses: Business[],
  dbReviews: { business_id?: string; offering_id?: string; has_super_star?: boolean; created_at?: string }[],
  redemptions: { businessId?: string }[],
  credentials?: BusinessCredentialsPublic,
): { score: number; breakdown: LeaderboardBreakdown } {
  const profileId = profileBusinessIdFor(business);
  const maxReviews = Math.max(...allBusinesses.map((b) => b.reviewCount), 1);
  const maxSuperStars = Math.max(
    ...allBusinesses.map((b) => {
      const pid = profileBusinessIdFor(b);
      return dbReviews.filter(
        (r) =>
          r.business_id === pid &&
          r.has_super_star &&
          (r.offering_id ? String(r.offering_id) === String(b.id) : false),
      ).length;
    }),
    1,
  );

  const ratingScore = Math.min(business.rating / 5, 1);
  const reviewScore = Math.min(
    Math.log(business.reviewCount + 1) / Math.log(maxReviews + 1),
    1,
  );
  const superStarCount = dbReviews.filter(
    (r) =>
      r.business_id === profileId &&
      r.has_super_star &&
      (r.offering_id ? String(r.offering_id) === String(business.id) : false),
  ).length;
  const superStarScore = maxSuperStars > 0 ? Math.min(superStarCount / maxSuperStars, 1) : 0;

  const oOrig = effectiveListingOriginalPrice(business);
  const oDeal = effectiveListingDealPrice(business);
  const discountPct =
    oOrig > 0 && oDeal > 0 && oDeal < oOrig ? (oOrig - oDeal) / oOrig : 0;
  const dealScore = Math.min(discountPct * 2, 1);

  const recentReviews = dbReviews.filter((r) => {
    if (r.business_id !== profileId) return false;
    const daysSince =
      (Date.now() - new Date(r.created_at ?? 0).getTime()) / (1000 * 60 * 60 * 24);
    return daysSince <= 30;
  }).length;
  const bizRedemptions = redemptions.filter((r) => r.businessId === profileId).length;
  const engagementRaw = recentReviews * 2 + bizRedemptions;
  const engagementScore = Math.min(engagementRaw / 20, 1);

  const credentialsScore = credentials
    ? credentialsLeaderboardScore(credentials)
    : credentialsLeaderboardScore({
        verifiedTourismPermit: Boolean(business.credVerifiedTourismPermit),
        verifiedLiabilityInsurance: Boolean(business.credVerifiedLiabilityInsurance),
        verifiedAssociationCredentials: Boolean(business.credVerifiedAssociationCredentials),
        verifiedFirstAid: Boolean(business.credVerifiedFirstAid),
        verifiedCount: Number(business.credVerifiedCount) || 0,
      });

  const breakdown: LeaderboardBreakdown = {
    ratingScore,
    reviewScore,
    superStarScore,
    dealScore,
    engagementScore,
    credentialsScore,
  };

  const score =
    ratingScore * LEADERBOARD_WEIGHTS.rating +
    reviewScore * LEADERBOARD_WEIGHTS.reviewCount +
    superStarScore * LEADERBOARD_WEIGHTS.superStars +
    dealScore * LEADERBOARD_WEIGHTS.dealValue +
    engagementScore * LEADERBOARD_WEIGHTS.engagement +
    credentialsScore * LEADERBOARD_WEIGHTS.credentials;

  return { score, breakdown };
}
