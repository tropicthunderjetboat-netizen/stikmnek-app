import React, { useMemo, useState } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import {
  businesses as localBusinesses,
  publicListingBusinesses,
  effectiveListingDealPrice,
  effectiveListingOriginalPrice,
  listingHasActiveDiscount,
  customerFacingListPrice,
} from '@/data/businesses';
import { pickRepresentativeOfferingsPerProfile, profileBusinessIdFor } from '@/lib/businessOfferingMap';
import { Star, TrendingUp, Award, Crown, Sparkles, ArrowRight, ChevronDown, ChevronUp, Flame, Eye, Info, Trophy, Medal } from 'lucide-react';
import { formatVT } from '@/lib/utils';
import { plainTextFromHtml } from '@/lib/businessDescriptionHtml';
import { toast } from 'sonner';

// ─── Leaderboard Scoring Algorithm ───
// Weights for each factor (total = 1.0)
const WEIGHTS = {
  rating: 0.30,        // Overall rating (including super stars)
  reviewCount: 0.20,   // Number of reviews (engagement)
  superStars: 0.20,    // Super Star count (premium signal)
  dealValue: 0.15,     // Discount percentage (deal attractiveness)
  engagement: 0.15,    // Redemption/review activity signal
};

interface ScoredBusiness {
  business: typeof localBusinesses[0];
  score: number;
  rank: number;
  breakdown: {
    ratingScore: number;
    reviewScore: number;
    superStarScore: number;
    dealScore: number;
    engagementScore: number;
  };
}

const FeaturedLeaderboard: React.FC = () => {
  const { language, dbBusinesses, dbReviews, redemptions, setSelectedBusiness, setCurrentView } = useAppContext();
  const [showAll, setShowAll] = useState(false);
  const [showScoring, setShowScoring] = useState(false);

  const allBusinesses = useMemo(() => {
    const raw = publicListingBusinesses(dbBusinesses, localBusinesses);
    if (dbBusinesses.length === 0) return raw;
    return pickRepresentativeOfferingsPerProfile(raw);
  }, [dbBusinesses]);

  // Calculate leaderboard scores
  const leaderboard: ScoredBusiness[] = useMemo(() => {
    // Get max values for normalization
    const maxReviews = Math.max(...allBusinesses.map(b => b.reviewCount), 1);
    const maxSuperStars = Math.max(...allBusinesses.map(b => {
      const pid = profileBusinessIdFor(b);
      const dbCount = b.superStarCount || 0;
      const reviewCount = dbReviews.filter(r => r.business_id === pid && r.has_super_star).length;
      return Math.max(dbCount, reviewCount);
    }), 1);

    const scored = allBusinesses.map(business => {
      const profileId = profileBusinessIdFor(business);
      // 1. Rating score (0-1): normalized from 0-5 scale
      const ratingScore = Math.min(business.rating / 5, 1);

      // 2. Review count score (0-1): logarithmic scale for fairness
      const reviewScore = Math.min(Math.log(business.reviewCount + 1) / Math.log(maxReviews + 1), 1);

      // 3. Super Star score (0-1): premium engagement signal
      const superStarCount = Math.max(
        business.superStarCount || 0,
        dbReviews.filter(r => r.business_id === profileId && r.has_super_star).length
      );
      const superStarScore = maxSuperStars > 0 ? Math.min(superStarCount / maxSuperStars, 1) : 0;

      // 4. Deal value score (0-1): discount percentage (ignore missing/zero deal_price)
      const oOrig = effectiveListingOriginalPrice(business);
      const oDeal = effectiveListingDealPrice(business);
      const discountPct =
        oOrig > 0 && oDeal > 0 && oDeal < oOrig ? (oOrig - oDeal) / oOrig : 0;
      const dealScore = Math.min(discountPct * 2, 1); // 50% discount = max score

      // 5. Engagement score (0-1): recent reviews + redemptions
      const recentReviews = dbReviews.filter(r => {
        if (r.business_id !== profileId) return false;
        const daysSince = (Date.now() - new Date(r.created_at).getTime()) / (1000 * 60 * 60 * 24);
        return daysSince <= 30;
      }).length;
      const bizRedemptions = redemptions.filter(r => r.businessId === profileId).length;
      const engagementRaw = (recentReviews * 2) + bizRedemptions;
      const engagementScore = Math.min(engagementRaw / 20, 1);

      // Composite score
      const score = (
        ratingScore * WEIGHTS.rating +
        reviewScore * WEIGHTS.reviewCount +
        superStarScore * WEIGHTS.superStars +
        dealScore * WEIGHTS.dealValue +
        engagementScore * WEIGHTS.engagement
      );

      return {
        business,
        score,
        rank: 0,
        breakdown: {
          ratingScore,
          reviewScore,
          superStarScore,
          dealScore,
          engagementScore,
        },
      };
    });

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Assign ranks
    scored.forEach((item, idx) => {
      item.rank = idx + 1;
    });

    return scored;
  }, [allBusinesses, dbReviews, redemptions]);

  const displayCount = showAll ? leaderboard.length : 6;
  const topDeals = leaderboard.slice(0, displayCount);

  const handleViewDeal = (biz: typeof localBusinesses[0]) => {
    setSelectedBusiness(biz);
    setCurrentView('business-detail');
  };

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Crown className="w-5 h-5 text-amber-500" />;
    if (rank === 2) return <Trophy className="w-5 h-5 text-gray-400" />;
    if (rank === 3) return <Medal className="w-5 h-5 text-amber-700" />;
    return <span className="text-sm font-bold text-gray-400">#{rank}</span>;
  };

  const getRankBadge = (rank: number) => {
    if (rank === 1) return 'bg-gradient-to-r from-amber-400 to-yellow-500 text-white shadow-lg shadow-amber-200/50';
    if (rank === 2) return 'bg-gradient-to-r from-gray-300 to-gray-400 text-white shadow-lg shadow-gray-200/50';
    if (rank === 3) return 'bg-gradient-to-r from-amber-600 to-amber-700 text-white shadow-lg shadow-amber-200/50';
    return 'bg-gray-100 text-gray-600';
  };

  const getScoreColor = (score: number) => {
    if (score >= 0.8) return 'text-emerald-600';
    if (score >= 0.6) return 'text-teal-600';
    if (score >= 0.4) return 'text-amber-600';
    return 'text-gray-500';
  };

  return (
    <section className="py-16 bg-gradient-to-b from-gray-50 to-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-sm font-semibold mb-4">
            <Flame className="w-4 h-4" />
            {language === 'en' ? 'Live Rankings' : language === 'fr' ? 'Classements en direct' : 'Laev Ranking'}
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-3">
            {language === 'en' ? 'Featured Deals Leaderboard' : language === 'fr' ? 'Classement des offres vedettes' : 'Lidabod blong Fitjad Dils'}
          </h2>
          <p className="text-gray-500 max-w-lg mx-auto mb-4">
            {language === 'en'
              ? 'Top deals ranked by rating, reviews, Super Stars, and value. Updated in real-time.'
              : language === 'fr'
              ? 'Meilleures offres classées par note, avis, Super Stars et valeur.'
              : 'Beswan dils i rank bae reting, riviu, Super Stars, mo valu.'}
          </p>

          {/* Scoring Info Toggle */}
          <button
            onClick={() => setShowScoring(!showScoring)}
            className="inline-flex items-center gap-1.5 text-xs text-teal-600 hover:text-teal-700 font-medium transition-colors"
          >
            <Info className="w-3.5 h-3.5" />
            {showScoring ? 'Hide scoring details' : 'How are rankings calculated?'}
            {showScoring ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {/* Scoring Breakdown */}
          {showScoring && (
            <div className="mt-4 max-w-2xl mx-auto bg-white rounded-xl border border-gray-200 p-5 text-left shadow-sm animate-in slide-in-from-top-2">
              <h4 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                <Award className="w-4 h-4 text-teal-600" />
                Leaderboard Scoring Algorithm
              </h4>
              <div className="space-y-2">
                {[
                  { label: 'Overall Rating', weight: '30%', desc: 'Star rating out of 5', color: 'bg-amber-500' },
                  { label: 'Review Count', weight: '20%', desc: 'Number of customer reviews (log scale)', color: 'bg-blue-500' },
                  { label: 'Super Stars', weight: '20%', desc: 'Premium Super Star reviews received', color: 'bg-purple-500' },
                  { label: 'Deal Value', weight: '15%', desc: 'Discount percentage offered', color: 'bg-emerald-500' },
                  { label: 'Engagement', weight: '15%', desc: 'Recent reviews and redemptions (30 days)', color: 'bg-orange-500' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${item.color} flex-shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-gray-700">{item.label}</span>
                        <span className="text-xs font-bold text-gray-900">{item.weight}</span>
                      </div>
                      <p className="text-[10px] text-gray-400">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-gray-400 mt-3 pt-3 border-t border-gray-100">
                Rankings update in real-time as new reviews, Super Stars, and redemptions are recorded.
              </p>
            </div>
          )}
        </div>

        {/* Leaderboard Grid */}
        <div className="space-y-3">
          {topDeals.map((item, idx) => {
            const { business, score, rank, breakdown } = item;
            const oOrig = effectiveListingOriginalPrice(business);
            const oDeal = effectiveListingDealPrice(business);
            const hasDisc = listingHasActiveDiscount(business);
            const lbDiscountBadge =
              hasDisc && String(business.discount ?? '').trim()
                ? String(business.discount).trim()
                : hasDisc && oOrig > 0
                  ? `${Math.round((1 - oDeal / oOrig) * 100)}% OFF`
                  : null;
            const superStarCount = Math.max(
              business.superStarCount || 0,
              dbReviews.filter(r => r.business_id === profileBusinessIdFor(business) && r.has_super_star).length
            );

            const isTopThree = rank <= 3;

            return (
              <div
                key={business.id}
                onClick={() => handleViewDeal(business)}
                className={`group relative bg-white rounded-xl overflow-hidden border transition-all duration-300 cursor-pointer hover:shadow-lg hover:-translate-y-0.5 ${
                  rank === 1 ? 'border-amber-300 shadow-md shadow-amber-100/50 ring-1 ring-amber-200' :
                  rank === 2 ? 'border-gray-300 shadow-sm' :
                  rank === 3 ? 'border-amber-200 shadow-sm' :
                  'border-gray-100 hover:border-teal-200'
                }`}
              >
                {/* Top 1 special glow */}
                {rank === 1 && (
                  <div className="absolute inset-0 bg-gradient-to-r from-amber-50/50 via-transparent to-amber-50/50 pointer-events-none" />
                )}

                <div className="relative flex flex-col sm:flex-row">
                  {/* Rank Badge */}
                  <div className="absolute top-3 left-3 sm:relative sm:top-auto sm:left-auto sm:flex sm:items-center sm:justify-center sm:w-16 sm:flex-shrink-0 z-10">
                    <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center ${getRankBadge(rank)}`}>
                      {getRankIcon(rank)}
                    </div>
                  </div>

                  {/* Image */}
                  <div className="relative w-full sm:w-44 h-40 sm:h-auto overflow-hidden flex-shrink-0">
                    <img
                      src={business.image}
                      alt={business.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent to-white/20 sm:bg-gradient-to-l" />
                    {lbDiscountBadge && (
                      <div className="absolute top-3 right-3 sm:bottom-3 sm:left-3 sm:top-auto sm:right-auto px-2.5 py-1 rounded-lg bg-gradient-to-r from-orange-500 to-amber-500 text-white text-xs font-bold shadow-lg">
                        {lbDiscountBadge}
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h3 className="font-bold text-gray-900 text-base sm:text-lg group-hover:text-teal-700 transition-colors truncate">
                            {business.name}
                          </h3>
                          {superStarCount > 0 && (
                            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-purple-500 to-violet-600 text-white text-[10px] font-bold shadow-sm shrink-0">
                              <Sparkles className="w-3 h-3" />
                              <span>{superStarCount} Super Star{superStarCount !== 1 ? 's' : ''}</span>
                            </div>
                          )}
                          {business.featured && (
                            <span className="px-2 py-0.5 rounded-md bg-teal-50 text-teal-700 text-[10px] font-semibold uppercase">
                              Featured
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-xs text-gray-400 mb-2">
                          <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 font-medium capitalize">{business.category}</span>
                          <span className="flex items-center gap-1">
                            <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                            {business.rating}
                          </span>
                          <span>{business.reviewCount} reviews</span>
                          <span className="hidden sm:inline">{business.location}</span>
                        </div>

                        <p className="text-sm text-gray-500 line-clamp-1 hidden sm:block">
                          {plainTextFromHtml(
                            language === 'fr'
                              ? business.descriptionFr || ''
                              : language === 'bi'
                                ? business.descriptionBi || ''
                                : business.description || '',
                          )}
                        </p>
                      </div>

                      {/* Score + Price */}
                      <div className="text-right flex-shrink-0">
                        {/* Leaderboard Score */}
                        <div className="mb-2">
                          <div className={`text-lg font-extrabold ${getScoreColor(score)}`}>
                            {Math.round(score * 100)}
                          </div>
                          <div className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Score</div>
                        </div>

                        {/* Price */}
                        <div className="flex items-baseline gap-1.5 justify-end">
                          <span className="text-lg font-bold text-teal-700">{formatVT(customerFacingListPrice(business))}</span>
                        </div>
                        {hasDisc && (
                          <div className="text-xs text-gray-400 line-through">{formatVT(oOrig)}</div>
                        )}
                      </div>
                    </div>

                    {/* Score Breakdown Bar (visible on top 3) */}
                    {isTopThree && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <div className="flex items-center gap-1.5">
                          <div className="flex-1 flex items-center gap-0.5">
                            {[
                              { value: breakdown.ratingScore, color: 'bg-amber-400', label: 'Rating' },
                              { value: breakdown.reviewScore, color: 'bg-blue-400', label: 'Reviews' },
                              { value: breakdown.superStarScore, color: 'bg-purple-400', label: 'Super Stars' },
                              { value: breakdown.dealScore, color: 'bg-emerald-400', label: 'Deal' },
                              { value: breakdown.engagementScore, color: 'bg-orange-400', label: 'Engagement' },
                            ].map((seg, i) => (
                              <div
                                key={i}
                                className="group/tip relative"
                                title={`${seg.label}: ${Math.round(seg.value * 100)}%`}
                              >
                                <div
                                  className={`h-1.5 rounded-full ${seg.color} transition-all`}
                                  style={{ width: `${Math.max(seg.value * 60, 4)}px` }}
                                />
                              </div>
                            ))}
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleViewDeal(business); }}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-teal-50 text-teal-700 text-xs font-semibold hover:bg-teal-100 transition-colors"
                          >
                            View Deal
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Show More / View All */}
        <div className="text-center mt-8 flex items-center justify-center gap-4">
          {leaderboard.length > 6 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white border-2 border-gray-200 text-gray-700 font-bold text-sm hover:border-teal-300 hover:text-teal-700 transition-all"
            >
              {showAll ? (
                <>
                  <ChevronUp className="w-4 h-4" />
                  {language === 'en' ? 'Show Top 6' : 'Voir le Top 6'}
                </>
              ) : (
                <>
                  <TrendingUp className="w-4 h-4" />
                  {language === 'en' ? `View Full Leaderboard (${leaderboard.length})` : `Classement complet (${leaderboard.length})`}
                </>
              )}
            </button>
          )}
          <button
            onClick={() => setCurrentView('deals')}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-teal-600 text-white font-bold text-sm hover:bg-teal-700 transition-all shadow-md shadow-teal-200"
          >
            {language === 'en' ? 'Browse All Deals' : language === 'fr' ? 'Voir toutes les offres' : 'Lukim Olgeta Dils'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </section>
  );
};

export default FeaturedLeaderboard;
