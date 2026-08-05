import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '@/contexts/AppContext';
import { t } from '@/data/translations';
import {
  Business,
  effectiveListingDealPrice,
  effectiveListingOriginalPrice,
  listingHasActiveDiscount,
  listingOfferBadgeText,
  customerFacingListPrice,
  primaryEmbeddedOffering,
} from '@/data/businesses';
import { Star, Heart, MapPin, Clock, Share2, Sparkles } from 'lucide-react';
import { formatVT, getBusinessWhatsAppRaw, digitsForWaMe } from '@/lib/utils';
import { buildBookingInquiryWhatsAppUrl } from '@/lib/bookingInquiry';
import { trackInteractionEvent } from '@/lib/interactionEvents';
import { toast } from 'sonner';
import { plainTextFromHtml } from '@/lib/businessDescriptionHtml';
import { profileBusinessIdFor } from '@/lib/businessOfferingMap';
import { absoluteDealUrl, dealPathForBusiness } from '@/lib/dealUrl';
import { shortPriceUnitSuffix } from '@/lib/categoryPricing';
import { isListingFavorited } from '@/lib/favoritesUi';
import BusinessProfileLogo from '@/components/BusinessProfileLogo';

interface BusinessCardProps {
  business: Business;
  listView?: boolean;
}

// WhatsApp SVG icon component
const WhatsAppIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

const SuperStarBadge: React.FC<{ count: number }> = ({ count }) => {
  if (!count || count <= 0) return null;
  return (
    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-purple-500 to-violet-600 text-white text-[10px] font-bold shadow-sm shadow-purple-200/50 shrink-0">
      <Sparkles className="w-3 h-3" />
      <span>{count} Super Star{count !== 1 ? 's' : ''}</span>
    </div>
  );
};

/** Shared classes: ≥44px touch target, icon stays visually smaller via flex center */
const iconActionBtn =
  'inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2';

const BusinessCard: React.FC<BusinessCardProps> = ({ business, listView = false }) => {
  const navigate = useNavigate();
  const {
    language,
    favorites,
    toggleFavorite,
    setSelectedBusiness,
    setCurrentView,
    user,
    setShowAuth,
    setAuthMode,
    dbReviews,
    purchasePass,
  } = useAppContext();
  const profileId = profileBusinessIdFor(business);
  const embed = primaryEmbeddedOffering(business);
  const dealPrice = effectiveListingDealPrice(business);
  const originalPrice = effectiveListingOriginalPrice(business);
  const hasDiscount = listingHasActiveDiscount(business);
  const displayPrice = customerFacingListPrice(business);
  const savings = hasDiscount ? Math.max(0, originalPrice - dealPrice) : 0;
  const discountBadgeText = listingOfferBadgeText(business);
  const cardImage =
    (business.image && business.image.trim()) ||
    String(embed?.banner_url || embed?.image || '').trim() ||
    '/placeholder.svg';

  // Compute super star count: use DB field if available, otherwise count from reviews
  const priceUnitSuffix = shortPriceUnitSuffix(
    business.category,
    language === 'fr' ? 'fr' : language === 'bi' ? 'bi' : 'en',
  );
  const superStarCount = (business.superStarCount && business.superStarCount > 0)
    ? business.superStarCount
    : dbReviews.filter((r: any) => r.business_id === profileId && (r.offering_id ? String(r.offering_id) === String(business.id) : true) && r.has_super_star).length;

  const hasWhatsApp = digitsForWaMe(getBusinessWhatsAppRaw(business)).length >= 5;
  const canUseWhatsApp = Boolean(user?.pass && user?.passId);

  const viewDetailsLabel = `View details for ${business.name}`;

  const handleViewDeal = () => {
    void trackInteractionEvent({
      eventType: 'click_listing',
      businessId: profileId,
      offeringId: String(business.id),
      dedupeInSession: false,
    });
    setSelectedBusiness(business);
    setCurrentView('business-detail');
    // Push the shareable URL so the address bar + back button stay in sync.
    navigate(dealPathForBusiness(business));
  };

  const handleFavorite = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      setShowAuth(true);
      setAuthMode('signin');
      return;
    }
    void toggleFavorite(business);
  };

  const handleWhatsApp = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      setShowAuth(true);
      setAuthMode('signin');
      return;
    }
    if (!user.pass) {
      toast.error(
        language === 'en'
          ? 'Get a StikmNek pass to message businesses on WhatsApp and unlock member rates.'
          : language === 'fr'
            ? 'Obtenez un pass StikmNek pour contacter les entreprises sur WhatsApp et bénéficier des tarifs membres.'
            : 'Yu nidim StikmNek pas blong mesej bisnis long WhatsApp mo kasem praes blong membas.',
      );
      void purchasePass();
      return;
    }
    const d = digitsForWaMe(getBusinessWhatsAppRaw(business));
    if (d.length < 5) return;
    void trackInteractionEvent({
      eventType: 'tap_whatsapp',
      businessId: profileId,
      offeringId: String(business.id),
      dedupeInSession: false,
    });
    const url = buildBookingInquiryWhatsAppUrl(d, {
      businessName: business.name,
      visitDate: 'To be confirmed',
      adults: 1,
      children: 0,
      infants: 0,
      estimatedPriceWithDiscount: formatVT(displayPrice),
      userName: user?.name?.trim() || 'Guest',
    });
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const dealBit = discountBadgeText ? ` — ${discountBadgeText}` : '';
    const shareData = {
      title: `${business.name}${dealBit}`,
      text: `Check out ${business.name}${dealBit} on StikmNek!`,
      url: absoluteDealUrl(business),
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(`${shareData.text}\n${shareData.url}`);
      toast.success('Deal link copied to clipboard!');
    } catch {
      toast.info('Copy this link to share:', { description: shareData.url, duration: 6000 });
    }
  };


  const isFav = isListingFavorited(favorites, business);
  const desc =
    language === 'fr'
      ? (business.descriptionFr ||
          String(embed?.description_fr ?? embed?.description_html ?? embed?.description ?? ''))
      : language === 'bi'
        ? (business.descriptionBi ||
            String(embed?.description_bi ?? embed?.description_html ?? embed?.description ?? ''))
        : (business.description ||
            String(embed?.description_html ?? embed?.description ?? ''));

  const shareLabel = `Share ${business.name}`;
  const favoriteLabel = isFav ? `Remove ${business.name} from favorites` : `Add ${business.name} to favorites`;
  const whatsappLabel = `Chat on WhatsApp about ${business.name}`;

  if (listView) {
    return (
      <article className="group bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-lg border border-gray-100 hover:border-teal-200 transition-all">
        <div className="flex flex-col sm:flex-row">
          <button
            type="button"
            onClick={handleViewDeal}
            aria-label={viewDetailsLabel}
            className="relative w-full sm:w-56 h-40 sm:min-h-[11rem] overflow-hidden flex-shrink-0 p-0 border-0 bg-transparent text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-inset sm:focus-visible:ring-offset-0"
          >
            <img src={cardImage} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }} />
            {discountBadgeText && (
              <div className="absolute top-3 left-3 px-3 py-1 rounded-lg bg-gradient-to-r from-orange-500 to-amber-500 text-white text-xs font-bold shadow-lg pointer-events-none">
                {discountBadgeText}
              </div>
            )}
            {business.featured && (
              <div className="absolute bottom-3 left-3 px-2 py-0.5 rounded-md bg-teal-600/90 text-white text-[10px] font-semibold uppercase tracking-wider pointer-events-none">
                Featured
              </div>
            )}
          </button>
          <div className="flex-1 min-w-0 p-5">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-2.5">
                  {business.profileLogoUrl ? (
                    <BusinessProfileLogo
                      src={business.profileLogoUrl}
                      alt={String(business.profileName || business.name || '')}
                      variant="inline"
                    />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-gray-900 text-lg">
                        <button
                          type="button"
                          onClick={handleViewDeal}
                          className="text-left hover:text-teal-700 transition-colors rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
                        >
                          {business.name}
                        </button>
                      </h3>
                      <SuperStarBadge count={superStarCount} />
                      {hasWhatsApp && canUseWhatsApp && (
                        <button
                          type="button"
                          onClick={handleWhatsApp}
                          className="inline-flex min-h-11 items-center gap-1 rounded-full border border-green-200 bg-green-50 px-3 py-1 text-green-600 text-xs font-bold hover:bg-green-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
                          aria-label={whatsappLabel}
                        >
                          <WhatsAppIcon className="w-3.5 h-3.5 shrink-0" />
                          <span>WhatsApp</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-400 mt-1">
                  <span className="flex items-center gap-1"><MapPin className="w-3 h-3 shrink-0" />{business.location}</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3 shrink-0" />{business.hours}</span>
                  <span className="flex items-center gap-1"><Star className="w-3 h-3 text-amber-400 fill-amber-400 shrink-0" />{business.rating} ({business.reviewCount})</span>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {hasWhatsApp && canUseWhatsApp && (
                  <button
                    type="button"
                    onClick={handleWhatsApp}
                    className={`${iconActionBtn} bg-green-50 text-green-600 hover:bg-green-100 border border-green-200`}
                    aria-label={whatsappLabel}
                  >
                    <WhatsAppIcon className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleShare}
                  className={`${iconActionBtn} bg-gray-100 text-gray-500 hover:bg-blue-50 hover:text-blue-600`}
                  aria-label={shareLabel}
                >
                  <Share2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleFavorite}
                  className={`${iconActionBtn} ${isFav ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-500'}`}
                  aria-label={favoriteLabel}
                >
                  <Heart className={`w-4 h-4 ${isFav ? 'fill-current' : ''}`} />
                </button>
              </div>
            </div>
            <div className="text-sm text-gray-500 mb-3 min-w-0">
              <div
                className="stikmnek-clamp-3"
                style={{
                  display: '-webkit-box',
                  WebkitLineClamp: '3',
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  wordBreak: 'break-word',
                }}
              >
                {plainTextFromHtml(desc || '')}
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-xl font-bold text-teal-700">{formatVT(displayPrice)}</span>
                {hasDiscount && (
                  <span className="text-sm text-gray-400 line-through">{formatVT(originalPrice)}</span>
                )}
                {savings > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-green-50 text-green-700 text-xs font-bold">
                    Save {formatVT(savings)}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={handleViewDeal}
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-teal-600 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
              >
                {t('biz.viewdeal', language)}
              </button>
            </div>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl border border-gray-100 hover:border-teal-200 transition-all duration-300 hover:-translate-y-1">
      {/* Image — full-area primary control (keyboard + touch); actions sit above in z-order */}
      <div className="relative h-48 overflow-hidden">
        <button
          type="button"
          onClick={handleViewDeal}
          aria-label={viewDetailsLabel}
          className="absolute inset-0 z-[1] h-full w-full cursor-pointer border-0 bg-transparent p-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-0"
        />
        <img
          src={cardImage}
          alt=""
          className="relative z-0 h-full w-full object-cover pointer-events-none group-hover:scale-110 transition-transform duration-500"
          onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }}
        />
        <div className="pointer-events-none absolute inset-0 z-[2] bg-gradient-to-t from-black/40 to-transparent" />

        {discountBadgeText && (
          <div className="pointer-events-none absolute top-3 left-3 z-[2] px-3 py-1 rounded-lg bg-gradient-to-r from-orange-500 to-amber-500 text-white text-xs font-bold shadow-lg">
            {discountBadgeText}
          </div>
        )}

        {/* Action Buttons — always visible; ≥44px targets */}
        <div className="absolute top-3 right-3 z-[3] flex items-center gap-1.5">
          {hasWhatsApp && canUseWhatsApp && (
            <button
              type="button"
              onClick={handleWhatsApp}
              className={`${iconActionBtn} bg-green-500 text-white shadow-lg hover:bg-green-600`}
              aria-label={whatsappLabel}
            >
              <WhatsAppIcon className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={handleShare}
            className={`${iconActionBtn} bg-white/95 text-gray-600 shadow-lg hover:bg-white hover:text-blue-600 md:transition-shadow md:group-hover:shadow-xl`}
            aria-label={shareLabel}
          >
            <Share2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleFavorite}
            className={`${iconActionBtn} shadow-lg ${
              isFav
                ? 'bg-red-500 text-white hover:bg-red-600'
                : 'bg-white/95 text-gray-600 hover:bg-white hover:text-red-500 md:transition-shadow md:group-hover:shadow-xl'
            }`}
            aria-label={favoriteLabel}
          >
            <Heart className={`w-4 h-4 ${isFav ? 'fill-current' : ''}`} />
          </button>
        </div>

        {/* Featured Badge */}
        {business.featured && (
          <div className="pointer-events-none absolute bottom-3 left-3 z-[2] px-2 py-0.5 rounded-md bg-teal-600/90 text-white text-[10px] font-semibold uppercase tracking-wider">
            Featured
          </div>
        )}

        {/* Savings Badge */}
        {savings > 0 && (
          <div className="pointer-events-none absolute bottom-3 right-3 z-[2] px-2 py-0.5 rounded-md bg-green-600/90 text-white text-[10px] font-semibold">
            Save {formatVT(savings)}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2.5">
              {business.profileLogoUrl ? (
                <BusinessProfileLogo
                  src={business.profileLogoUrl}
                  alt={String(business.profileName || business.name || '')}
                  variant="inline"
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-gray-900 text-base leading-tight">
                    <button
                      type="button"
                      onClick={handleViewDeal}
                      className="text-left hover:text-teal-700 transition-colors rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
                    >
                      {business.name}
                    </button>
                  </h3>
                  <SuperStarBadge count={superStarCount} />
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Star className="w-4 h-4 text-amber-400 fill-amber-400" aria-hidden />
            <span className="text-sm font-semibold text-gray-800">{business.rating}</span>
          </div>
        </div>

        <div className="text-sm text-gray-500 mb-3 min-w-0 leading-relaxed">
          <div
            className="stikmnek-clamp-3"
            style={{
              display: '-webkit-box',
              WebkitLineClamp: '3',
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              wordBreak: 'break-word',
            }}
          >
            {plainTextFromHtml(desc || '')}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400 mb-3">
          <span className="flex min-w-0 items-center gap-1">
            <MapPin className="w-3 h-3 shrink-0" />
            <span className="truncate">{business.location}</span>
          </span>
          <span className="flex items-center gap-1 shrink-0">
            <Clock className="w-3 h-3 shrink-0" />
            {business.hours.split(' - ')[0]}
          </span>
          {hasWhatsApp && canUseWhatsApp && (
            <span className="flex items-center gap-1 text-green-600 shrink-0">
              <WhatsAppIcon className="w-3 h-3" />
              WhatsApp
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 pt-3 border-t border-gray-100 flex-wrap">
          <div className="flex items-baseline gap-2 flex-wrap min-w-0">
            <span className="text-lg font-bold text-teal-700">{formatVT(displayPrice)}</span>
            {hasDiscount && (
              <span className="text-sm text-gray-400 line-through">{formatVT(originalPrice)}</span>
            )}
            <span className="text-xs text-gray-400">{priceUnitSuffix}</span>
          </div>

          <button
            type="button"
            onClick={handleViewDeal}
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-teal-50 px-4 py-2 text-xs font-semibold text-teal-700 hover:bg-teal-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
          >
            {t('biz.viewdeal', language)}
          </button>
        </div>
      </div>
    </article>
  );
};

export default BusinessCard;
