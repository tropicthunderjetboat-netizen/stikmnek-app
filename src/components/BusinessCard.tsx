import React from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { t } from '@/data/translations';
import { Business } from '@/data/businesses';
import { Star, Heart, MapPin, Clock, Share2, Sparkles, MessageCircle } from 'lucide-react';
import { formatVT, getBusinessWhatsAppRaw, digitsForWaMe } from '@/lib/utils';
import { buildBookingInquiryWhatsAppUrl } from '@/lib/bookingInquiry';
import { toast } from 'sonner';
import { plainTextFromHtml } from '@/lib/businessDescriptionHtml';

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

const BusinessCard: React.FC<BusinessCardProps> = ({ business, listView = false }) => {
  const { language, favorites, toggleFavorite, setSelectedBusiness, setCurrentView, user, setShowAuth, setAuthMode, dbReviews } = useAppContext();

  // Compute super star count: use DB field if available, otherwise count from reviews
  const superStarCount = (business.superStarCount && business.superStarCount > 0)
    ? business.superStarCount
    : dbReviews.filter(r => r.business_id === business.id && r.has_super_star).length;

  const hasWhatsApp = digitsForWaMe(getBusinessWhatsAppRaw(business)).length >= 5;

  const handleViewDeal = () => {
    setSelectedBusiness(business);
    setCurrentView('business-detail');
  };

  const handleFavorite = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      setShowAuth(true);
      setAuthMode('signin');
      return;
    }
    toggleFavorite(business.id);
  };

  const handleWhatsApp = (e: React.MouseEvent) => {
    e.stopPropagation();
    const d = digitsForWaMe(getBusinessWhatsAppRaw(business));
    if (d.length < 5) return;
    const url = buildBookingInquiryWhatsAppUrl(d, {
      businessName: business.name,
      visitDate: 'To be confirmed',
      adults: 1,
      children: 0,
      infants: 0,
      estimatedPriceWithDiscount: formatVT(business.dealPrice),
      userName: user?.name?.trim() || 'Guest',
    });
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const shareData = {
      title: `${business.name} - ${business.discount}`,
      text: `Check out this deal: ${business.name} - ${business.discount} on StikmNek!`,
      url: window.location.origin,
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


  const isFav = favorites.includes(business.id);
  const desc = language === 'fr' ? business.descriptionFr : language === 'bi' ? business.descriptionBi : business.description;
  const savings = business.originalPrice - business.dealPrice;

  if (listView) {
    return (
      <div
        className="group bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-lg border border-gray-100 hover:border-teal-200 transition-all cursor-pointer"
        onClick={handleViewDeal}
      >
        <div className="flex flex-col sm:flex-row">
          <div className="relative w-full sm:w-56 h-40 sm:h-auto overflow-hidden flex-shrink-0">
            <img src={business.image || '/placeholder.svg'} alt={business.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }} />
            <div className="absolute top-3 left-3 px-3 py-1 rounded-lg bg-gradient-to-r from-orange-500 to-amber-500 text-white text-xs font-bold shadow-lg">
              {business.discount}
            </div>
            {business.featured && (
              <div className="absolute bottom-3 left-3 px-2 py-0.5 rounded-md bg-teal-600/90 text-white text-[10px] font-semibold uppercase tracking-wider">
                Featured
              </div>
            )}
          </div>
          <div className="flex-1 p-5">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-gray-900 text-lg group-hover:text-teal-700 transition-colors">{business.name}</h3>
                  <SuperStarBadge count={superStarCount} />
                  {hasWhatsApp && (
                    <button
                      onClick={handleWhatsApp}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 text-green-600 text-[10px] font-bold hover:bg-green-100 transition-colors border border-green-200"
                      title="Chat on WhatsApp"
                    >
                      <WhatsAppIcon className="w-3 h-3" />
                      <span>WhatsApp</span>
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-400 mt-1">
                  <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{business.location}</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{business.hours}</span>
                  <span className="flex items-center gap-1"><Star className="w-3 h-3 text-amber-400 fill-amber-400" />{business.rating} ({business.reviewCount})</span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {hasWhatsApp && (
                  <button onClick={handleWhatsApp} className="w-8 h-8 rounded-full flex items-center justify-center bg-green-50 text-green-600 hover:bg-green-100 transition-colors border border-green-200" title="Chat on WhatsApp">
                    <WhatsAppIcon className="w-3.5 h-3.5" />
                  </button>
                )}
                <button onClick={handleShare} className="w-8 h-8 rounded-full flex items-center justify-center bg-gray-100 text-gray-500 hover:bg-blue-50 hover:text-blue-600 transition-colors">
                  <Share2 className="w-3.5 h-3.5" />
                </button>
                <button onClick={handleFavorite} className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isFav ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-500'}`}>
                  <Heart className={`w-3.5 h-3.5 ${isFav ? 'fill-current' : ''}`} />
                </button>
              </div>
            </div>
            <p className="text-sm text-gray-500 mb-3 line-clamp-2">{plainTextFromHtml(desc || '')}</p>
            <div className="flex items-center justify-between">
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-bold text-teal-700">{formatVT(business.dealPrice)}</span>
                <span className="text-sm text-gray-400 line-through">{formatVT(business.originalPrice)}</span>
                {savings > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-green-50 text-green-700 text-xs font-bold">
                    Save {formatVT(savings)}
                  </span>
                )}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); handleViewDeal(); }}
                className="px-5 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 transition-colors"
              >
                {t('biz.viewdeal', language)}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl border border-gray-100 hover:border-teal-200 transition-all duration-300 hover:-translate-y-1 cursor-pointer"
      onClick={handleViewDeal}
    >
      {/* Image */}
      <div className="relative h-48 overflow-hidden">
        <img
          src={business.image || '/placeholder.svg'}
          alt={business.name}
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
          onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
        
        {/* Discount Badge */}
        <div className="absolute top-3 left-3 px-3 py-1 rounded-lg bg-gradient-to-r from-orange-500 to-amber-500 text-white text-xs font-bold shadow-lg">
          {business.discount}
        </div>

        {/* Action Buttons */}
        <div className="absolute top-3 right-3 flex items-center gap-1.5">
          {hasWhatsApp && (
            <button
              onClick={handleWhatsApp}
              className="w-9 h-9 rounded-full flex items-center justify-center bg-green-500 text-white hover:bg-green-600 transition-all shadow-lg"
              title="Chat on WhatsApp"
            >
              <WhatsAppIcon className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={handleShare}
            className="w-9 h-9 rounded-full flex items-center justify-center bg-white/90 text-gray-600 hover:bg-white hover:text-blue-600 transition-all shadow-lg opacity-0 group-hover:opacity-100"
          >
            <Share2 className="w-4 h-4" />
          </button>
          <button
            onClick={handleFavorite}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-all shadow-lg ${
              isFav
                ? 'bg-red-500 text-white'
                : 'bg-white/90 text-gray-600 hover:bg-white hover:text-red-500'
            }`}
          >
            <Heart className={`w-4 h-4 ${isFav ? 'fill-current' : ''}`} />
          </button>
        </div>

        {/* Featured Badge */}
        {business.featured && (
          <div className="absolute bottom-3 left-3 px-2 py-0.5 rounded-md bg-teal-600/90 text-white text-[10px] font-semibold uppercase tracking-wider">
            Featured
          </div>
        )}

        {/* Savings Badge */}
        {savings > 0 && (
          <div className="absolute bottom-3 right-3 px-2 py-0.5 rounded-md bg-green-600/90 text-white text-[10px] font-semibold">
            Save {formatVT(savings)}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-gray-900 text-base leading-tight group-hover:text-teal-700 transition-colors">
                {business.name}
              </h3>
              <SuperStarBadge count={superStarCount} />
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
            <span className="text-sm font-semibold text-gray-800">{business.rating}</span>
          </div>
        </div>

        <p className="text-sm text-gray-500 mb-3 line-clamp-2 leading-relaxed">{plainTextFromHtml(desc || '')}</p>

        <div className="flex items-center gap-3 text-xs text-gray-400 mb-3">
          <span className="flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            {business.location}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {business.hours.split(' - ')[0]}
          </span>
          {hasWhatsApp && (
            <span className="flex items-center gap-1 text-green-600">
              <WhatsAppIcon className="w-3 h-3" />
              WhatsApp
            </span>
          )}
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-gray-100">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold text-teal-700">{formatVT(business.dealPrice)}</span>
            <span className="text-sm text-gray-400 line-through">{formatVT(business.originalPrice)}</span>
            <span className="text-xs text-gray-400">{t('general.per_person', language)}</span>
          </div>

          <button
            onClick={(e) => { e.stopPropagation(); handleViewDeal(); }}
            className="px-3 py-1.5 rounded-lg bg-teal-50 text-teal-700 text-xs font-semibold hover:bg-teal-100 transition-colors"
          >
            {t('biz.viewdeal', language)}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BusinessCard;
