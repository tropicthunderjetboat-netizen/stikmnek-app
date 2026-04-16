import React, { useState, useMemo, useCallback } from 'react';
import { useAppContext, ViewMode } from '@/contexts/AppContext';
import { t } from '@/data/translations';
import {
  categories,
  Business,
  effectiveListingDealPrice,
  effectiveListingOriginalPrice,
  effectiveListingDescriptionPlain,
  touristFacingOfferings,
  businessListingHasWhatsApp,
  businessListingWhatsAppRaw,
} from '@/data/businesses';
import { profileBusinessIdFor } from '@/lib/businessOfferingMap';
import BusinessCard from './BusinessCard';
import AdvancedSearch, { SortOption } from './AdvancedSearch';
import { Search, SlidersHorizontal, LayoutGrid, List, Navigation, Loader2, Award } from 'lucide-react';
import { haversineDistance } from '@/hooks/useGeolocation';
import { effectiveBusinessCoords } from '@/lib/urlHelpers';
import { plainTextFromHtml } from '@/lib/businessDescriptionHtml';

interface BusinessGridProps {
  showFeaturedOnly?: boolean;
  title?: string;
}

// WhatsApp SVG icon component (small, for filter chip)
const WhatsAppFilterIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

// ─── Leaderboard scoring (same algorithm as FeaturedLeaderboard) ───
function computeLeaderboardScore(
  biz: Business,
  allBusinesses: Business[],
  dbReviews: any[],
  redemptions: any[]
): number {
  const profileId = profileBusinessIdFor(biz);
  const maxReviews = Math.max(...allBusinesses.map(b => b.reviewCount), 1);
  const maxSuperStars = Math.max(...allBusinesses.map(b => {
    const pid = profileBusinessIdFor(b);
    const dbCount = b.superStarCount || 0;
    const reviewCount = dbReviews.filter(r => r.business_id === pid && r.has_super_star).length;
    return Math.max(dbCount, reviewCount);
  }), 1);

  const ratingScore = Math.min(biz.rating / 5, 1);
  const reviewScore = Math.min(Math.log(biz.reviewCount + 1) / Math.log(maxReviews + 1), 1);
  const superStarCount = Math.max(
    biz.superStarCount || 0,
    dbReviews.filter(r => r.business_id === profileId && r.has_super_star).length
  );
  const superStarScore = maxSuperStars > 0 ? Math.min(superStarCount / maxSuperStars, 1) : 0;
  const oDeal = effectiveListingDealPrice(biz);
  const oOrig = effectiveListingOriginalPrice(biz);
  const discountPct =
    oOrig > 0 && oDeal > 0 && oDeal < oOrig ? (oOrig - oDeal) / oOrig : 0;
  const dealScore = Math.min(discountPct * 2, 1);
  const recentReviews = dbReviews.filter(r => {
    if (r.business_id !== profileId) return false;
    const daysSince = (Date.now() - new Date(r.created_at).getTime()) / (1000 * 60 * 60 * 24);
    return daysSince <= 30;
  }).length;
  const bizRedemptions = redemptions.filter(r => r.businessId === profileId).length;
  const engagementRaw = (recentReviews * 2) + bizRedemptions;
  const engagementScore = Math.min(engagementRaw / 20, 1);

  return (
    ratingScore * 0.30 +
    reviewScore * 0.20 +
    superStarScore * 0.20 +
    dealScore * 0.15 +
    engagementScore * 0.15
  );
}

// ─── Fuzzy/partial matching helper ───
function fuzzyMatch(query: string, text: string | null | undefined): boolean {
  if (text == null) return false;
  const q = (query ?? '').toLowerCase();
  const t = String(text).toLowerCase();

  // Direct substring match
  if (t.includes(q)) return true;

  // Word-level partial matching
  const queryWords = q.split(/\s+/).filter(w => w.length > 0);
  const textWords = t.split(/\s+/);

  // All query words must partially match some text word
  return queryWords.every(qw =>
    textWords.some(tw => tw.startsWith(qw) || tw.includes(qw))
  );
}

const BusinessGrid: React.FC<BusinessGridProps> = ({ showFeaturedOnly = false, title }) => {
  const { language, searchQuery, setSearchQuery, selectedCategory, setSelectedCategory, setCurrentView, dbBusinesses, dbReviews, redemptions, dataLoaded, userLocation, getDistanceTo, refreshBusinesses } = useAppContext();

  // Refresh public listings when deals view is shown (e.g. after admin approval or "view on live site")
  React.useEffect(() => {
    refreshBusinesses?.();
  }, [refreshBusinesses]);

  const [sortBy, setSortBy] = useState<SortOption>('featured');
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 50000]);
  const [minRating, setMinRating] = useState(0);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [whatsappFilter, setWhatsappFilter] = useState(false);

  /** Turning on WhatsApp filter must clear category — otherwise we intersect e.g. "Accommodation" with WA and show 0 while the chip still says (8). */
  const setWhatsappFilterWrapped = useCallback(
    (value: React.SetStateAction<boolean>) => {
      setWhatsappFilter((prev) => {
        const next = typeof value === 'function' ? (value as (p: boolean) => boolean)(prev) : value;
        if (next) setSelectedCategory('all');
        return next;
      });
    },
    [setSelectedCategory],
  );

  const allBusinesses = useMemo(() => touristFacingOfferings(dbBusinesses), [dbBusinesses]);

  const maxPrice = useMemo(() => Math.max(...allBusinesses.map(b => b.dealPrice || b.originalPrice), 50000), [allBusinesses]);

  // Count businesses with WhatsApp for the filter chip badge
  const whatsappCount = useMemo(() => {
    return allBusinesses.filter(businessListingHasWhatsApp).length;
  }, [allBusinesses]);

  const filtered = useMemo(() => {
    let result = allBusinesses.filter(biz => {
      if (showFeaturedOnly && !biz.featured) return false;
      if (selectedCategory !== 'all' && biz.category !== selectedCategory) return false;

      // WhatsApp filter
      if (whatsappFilter && !businessListingHasWhatsApp(biz)) return false;

      if (searchQuery) {
        const q = searchQuery.toLowerCase();

        // Special: searching for 'whatsapp' shows businesses with WhatsApp numbers
        const isWhatsAppSearch = q === 'whatsapp' || q === 'wa' || q === 'whats app' || q.includes('whatsapp');
        if (isWhatsAppSearch) {
          return businessListingHasWhatsApp(biz);
        }

        // Enhanced search: name, description, location, tags, category, whatsappNumber
        const nameMatch = fuzzyMatch(q, biz.name);
        const descMatch = fuzzyMatch(q, plainTextFromHtml(effectiveListingDescriptionPlain(biz)));
        const locationMatch = fuzzyMatch(q, biz.location);
        const categoryMatch = (biz.category ?? '').toLowerCase().includes(q);
        const tagMatch = (biz.tags ?? []).some(tag => {
          const tagLower = String(tag).toLowerCase();
          return tagLower.includes(q) || q.includes(tagLower) || fuzzyMatch(q, tagLower);
        });

        // WhatsApp number in search index
        const wa = businessListingWhatsAppRaw(biz);
        const whatsappMatch = wa.length > 0 ? wa.toLowerCase().includes(q) : false;

        // Also check phonetic-like matching (first 3 chars)
        const phoneticMatch = q.length >= 3 && (
          (biz.name ?? '').toLowerCase().startsWith(q.substring(0, 3)) ||
          (biz.tags ?? []).some(tag => String(tag).toLowerCase().startsWith(q.substring(0, 3)))
        );

        if (!nameMatch && !descMatch && !locationMatch && !categoryMatch && !tagMatch && !phoneticMatch && !whatsappMatch) return false;
      }
      // Price range filter
      const price = effectiveListingDealPrice(biz) || effectiveListingOriginalPrice(biz);
      if (price < priceRange[0] || price > priceRange[1]) return false;
      // Rating filter
      if (biz.rating < minRating) return false;
      return true;
    });

    // Sort
    switch (sortBy) {
      case 'leaderboard':
        result.sort((a, b) => {
          const scoreA = computeLeaderboardScore(a, allBusinesses, dbReviews, redemptions);
          const scoreB = computeLeaderboardScore(b, allBusinesses, dbReviews, redemptions);
          return scoreB - scoreA;
        });
        break;
      case 'price-low':
        result.sort((a, b) =>
          (effectiveListingDealPrice(a) || effectiveListingOriginalPrice(a)) -
          (effectiveListingDealPrice(b) || effectiveListingOriginalPrice(b)),
        );
        break;
      case 'price-high':
        result.sort((a, b) =>
          (effectiveListingDealPrice(b) || effectiveListingOriginalPrice(b)) -
          (effectiveListingDealPrice(a) || effectiveListingOriginalPrice(a)),
        );
        break;
      case 'rating':
        result.sort((a, b) => b.rating - a.rating);
        break;
      case 'savings':
        result.sort(
          (a, b) =>
            effectiveListingOriginalPrice(b) - effectiveListingDealPrice(b) -
            (effectiveListingOriginalPrice(a) - effectiveListingDealPrice(a)),
        );
        break;
      case 'reviews':
        result.sort((a, b) => b.reviewCount - a.reviewCount);
        break;
      case 'near-me':
        if (userLocation) {
          result.sort((a, b) => {
            const ca = effectiveBusinessCoords(a);
            const cb = effectiveBusinessCoords(b);
            if (!ca && !cb) return 0;
            if (!ca) return 1;
            if (!cb) return -1;
            const distA = haversineDistance(userLocation.lat, userLocation.lng, ca.lat, ca.lng);
            const distB = haversineDistance(userLocation.lat, userLocation.lng, cb.lat, cb.lng);
            return distA - distB;
          });
        }
        break;
      case 'featured':
      default:
        result.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
        break;
    }

    return result;
  }, [allBusinesses, showFeaturedOnly, selectedCategory, searchQuery, priceRange, minRating, sortBy, userLocation, dbReviews, redemptions, whatsappFilter]);


  const categoryIcons: Record<string, React.ReactNode> = {
    all: <SlidersHorizontal className="w-4 h-4" />,
    dining: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path d="M18 8h1a4 4 0 010 8h-1M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z" />
        <path d="M6 1v3M10 1v3M14 1v3" />
      </svg>
    ),
    activities: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
      </svg>
    ),
    tours: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="12" r="10" />
        <path d="M16.24 7.76a6 6 0 010 8.49m-8.48-.01a6 6 0 010-8.49" />
      </svg>
    ),
    shopping: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18M16 10a4 4 0 01-8 0" />
      </svg>
    ),
    spa: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
      </svg>
    ),
    accommodation: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        <path d="M9 22V12h6v10" />
      </svg>
    ),
  };

  // Compute real-time category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const biz of allBusinesses) {
      const cat = biz.category ?? 'other';
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [allBusinesses]);

  return (
    <section className="py-16 bg-gray-50/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-3">
            {title || (showFeaturedOnly ? t('biz.featured', language) : t('biz.all', language))}
          </h2>
          <p className="text-gray-500 max-w-lg mx-auto">
            {language === 'en' ? 'Discover amazing deals from local businesses across Vanuatu' :
             language === 'fr' ? 'Découvrez des offres incroyables des entreprises locales à travers le Vanuatu' :
             'Faenem nambawan dils from lokal bisnis long Vanuatu'}
          </p>

          {dbBusinesses.length > 0 && (
            <p className="text-xs text-teal-600 mt-2 flex items-center justify-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              {language === 'en' ? 'Live data synced' : 'Données synchronisées'}
            </p>
          )}
        </div>

        {!showFeaturedOnly && (
          <div className="mb-8 space-y-4">
            {/* Advanced Search */}
            <AdvancedSearch
              sortBy={sortBy}
              setSortBy={setSortBy}
              priceRange={priceRange}
              setPriceRange={setPriceRange}
              minRating={minRating}
              setMinRating={setMinRating}
              maxPrice={maxPrice}
              whatsappFilter={whatsappFilter}
              setWhatsappFilter={setWhatsappFilterWrapped}
            />

            {/* Category Filters + WhatsApp Chip + View Toggle */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedCategory('all')}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    selectedCategory === 'all'
                      ? 'bg-teal-600 text-white shadow-md shadow-teal-200'
                      : 'bg-white text-gray-600 border border-gray-200 hover:border-teal-300 hover:text-teal-700'
                  }`}
                >
                  {categoryIcons.all}
                  {t('cat.all', language)}
                  <span className="text-[10px] opacity-70">({allBusinesses.length})</span>
                </button>
                {categories.map(cat => (
                  <button
                    key={cat.key}
                    onClick={() => setSelectedCategory(cat.key)}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                      selectedCategory === cat.key
                        ? 'bg-teal-600 text-white shadow-md shadow-teal-200'
                        : 'bg-white text-gray-600 border border-gray-200 hover:border-teal-300 hover:text-teal-700'
                    }`}
                  >
                    {categoryIcons[cat.key]}
                    {language === 'fr' ? cat.labelFr : language === 'bi' ? cat.labelBi : cat.label}
                    <span className="text-[10px] opacity-70">({categoryCounts[cat.key] || 0})</span>
                  </button>
                ))}

                {/* ── Green WhatsApp Filter Chip ── */}
                {whatsappCount > 0 && (
                  <button
                    onClick={() => setWhatsappFilterWrapped((prev) => !prev)}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                      whatsappFilter
                        ? 'bg-green-600 text-white shadow-md shadow-green-200'
                        : 'bg-white text-green-700 border border-green-300 hover:bg-green-50 hover:border-green-400'
                    }`}
                    title={language === 'en' ? 'Show only businesses with WhatsApp' : 'Afficher uniquement les entreprises avec WhatsApp'}
                  >
                    <WhatsAppFilterIcon className="w-4 h-4" />
                    <span className="hidden sm:inline">
                      {language === 'en' ? 'WhatsApp' : 'WhatsApp'}
                    </span>
                    <span className="text-[10px] opacity-70">({whatsappCount})</span>
                  </button>
                )}
              </div>

              {/* View Toggle + Results Count */}
              <div className="flex items-center gap-3">
                {sortBy === 'leaderboard' && (
                  <span className="flex items-center gap-1 text-xs text-amber-600 font-semibold">
                    <Award className="w-3.5 h-3.5" />
                    Ranked
                  </span>
                )}
                {whatsappFilter && (
                  <span className="flex items-center gap-1 text-xs text-green-600 font-semibold">
                    <WhatsAppFilterIcon className="w-3.5 h-3.5" />
                    WhatsApp only
                  </span>
                )}
                <span className="text-sm text-gray-400 font-medium">
                  {filtered.length} {language === 'en' ? 'results' : 'résultats'}
                </span>
                <div className="flex items-center bg-white rounded-lg border border-gray-200 p-0.5">
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-teal-100 text-teal-700' : 'text-gray-400 hover:text-gray-600'}`}
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-teal-100 text-teal-700' : 'text-gray-400 hover:text-gray-600'}`}
                  >
                    <List className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {filtered.length > 0 ? (
          <div className={
            viewMode === 'grid'
              ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6'
              : 'space-y-4'
          }>
            {filtered.map(biz => (
              <BusinessCard key={biz.id} business={biz} listView={viewMode === 'list'} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
              <Search className="w-7 h-7 text-gray-400" />
            </div>
            <p className="text-gray-500 text-lg">
              {language === 'en' ? 'No deals found. Try adjusting your filters.' :
               language === 'fr' ? 'Aucune offre trouvée. Essayez d\'ajuster vos filtres.' :
               'No gat dil i faenem. Traem narafala sej.'}
            </p>
            {searchQuery && (
              <p className="text-sm text-gray-400 mt-2">
                {language === 'en'
                  ? `No results for "${searchQuery}". Try searching by business name, tag, or category.`
                  : `Aucun résultat pour "${searchQuery}".`}
              </p>
            )}
            {whatsappFilter && (
              <p className="text-sm text-green-600 mt-2 flex items-center justify-center gap-1.5">
                <WhatsAppFilterIcon className="w-4 h-4" />
                {language === 'en'
                  ? 'WhatsApp filter is active. Some businesses may not have WhatsApp yet.'
                  : 'Le filtre WhatsApp est actif. Certaines entreprises n\'ont pas encore WhatsApp.'}
              </p>
            )}
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('all');
                setSortBy('featured');
                setPriceRange([0, maxPrice]);
                setMinRating(0);
                setWhatsappFilter(false);
              }}
              className="mt-4 px-6 py-2 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 transition-colors"
            >
              {language === 'en' ? 'Clear All Filters' : 'Effacer les filtres'}
            </button>
          </div>
        )}

        {showFeaturedOnly && (
          <div className="text-center mt-10">
            <button
              onClick={() => setCurrentView('deals')}
              className="px-8 py-3 rounded-xl bg-white border-2 border-teal-200 text-teal-700 font-bold text-sm hover:bg-teal-50 hover:border-teal-300 transition-all"
            >
              {language === 'en' ? 'View All Deals' : language === 'fr' ? 'Voir toutes les offres' : 'Lukim Olgeta Dils'}
            </button>
          </div>
        )}
      </div>
    </section>
  );
};

export default BusinessGrid;
