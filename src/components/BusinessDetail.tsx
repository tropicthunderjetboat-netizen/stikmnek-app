import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { t } from '@/data/translations';
import { ArrowLeft, Star, MapPin, Clock, Phone, Heart, CalendarDays, Share2, MessageSquarePlus, Sparkles, ExternalLink, Store, Layers, Globe } from 'lucide-react';
import { toast } from 'sonner';
import ReviewForm from '@/components/ReviewForm';
import PhotoGallery from '@/components/PhotoGallery';
import { formatVT, getBusinessWhatsAppRaw, digitsForWaMe, getPhotoDisplayUrl } from '@/lib/utils';
import { buildBookingInquiryWhatsAppUrl } from '@/lib/bookingInquiry';
import { supabase, SUPABASE_URL } from '@/lib/supabase';
import BookingInquiryModal from '@/components/BookingInquiryModal';
import { categoryUsesTieredPricing, pricingTiersFromDb } from '@/lib/pricingTiers';
import BusinessDetailMap from '@/components/BusinessDetailMap';
import {
  displayWebsiteForInput,
  effectiveBusinessCoords,
  googleMapsExternalOpenUrl,
  normalizeWebsiteForStorage,
} from '@/lib/urlHelpers';
import {
  looksLikeRichDescriptionHtml,
  plainTextFromHtml,
  sanitizeBusinessDescriptionHtml,
} from '@/lib/businessDescriptionHtml';
import { profileBusinessIdFor } from '@/lib/businessOfferingMap';

type ReviewResponseRow = { review_id: string; response: string; created_at: string };

// WhatsApp SVG icon component
const WhatsAppIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

// Format WhatsApp number for display
function formatWhatsAppDisplay(number: string): string {
  const cleaned = number.replace(/[^\d+\s-]/g, '');
  return cleaned;
}

const BusinessDetail: React.FC = () => {
  const {
    language, selectedBusiness, setCurrentView, setSelectedBusiness,
    favorites, toggleFavorite, user, userProfile, setShowAuth, setAuthMode,
    dbReviews,
  } = useAppContext();
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewResponsesById, setReviewResponsesById] = useState<Record<string, ReviewResponseRow>>({});
  const [displayCoverImage, setDisplayCoverImage] = useState('');

  if (!selectedBusiness) return null;

  const biz = selectedBusiness;
  const profileId = profileBusinessIdFor(biz);
  const isFav = favorites.includes(profileId);
  const reviews = useMemo(() => dbReviews.filter(r => r.business_id === profileId), [dbReviews, profileId]);

  useEffect(() => {
    setDisplayCoverImage(biz.image || '');
  }, [biz.id, biz.image]);

  useEffect(() => {
    if (reviews.length === 0) {
      setReviewResponsesById({});
      return;
    }
    const ids = reviews.map(r => r.id);
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('review_responses')
        .select('review_id, response, created_at')
        .in('review_id', ids)
        .order('created_at', { ascending: false });
      if (error || cancelled) return;
      const map: Record<string, ReviewResponseRow> = {};
      (data || []).forEach((row: ReviewResponseRow) => {
        if (!map[row.review_id]) map[row.review_id] = row;
      });
      if (!cancelled) setReviewResponsesById(map);
    })();
    return () => { cancelled = true; };
  }, [biz.id, reviews]);
  const desc = language === 'fr' ? biz.descriptionFr : language === 'bi' ? biz.descriptionBi : biz.description;

  const pricingTiers = useMemo(
    () => pricingTiersFromDb(biz.pricingTiers ?? (biz as { pricing_tiers?: unknown }).pricing_tiers),
    [biz.id, biz.pricingTiers],
  );
  const showTieredTable = categoryUsesTieredPricing(biz.category) && pricingTiers.length > 0;

  const mapCoords = useMemo(() => effectiveBusinessCoords(biz), [biz.lat, biz.lng, biz.mapUrl, biz.map_url]);
  const savedMapUrlTrimmed = ((biz.mapUrl ?? biz.map_url) || '').trim();
  const googleMapsOpenHref = useMemo(() => {
    if (mapCoords) {
      return googleMapsExternalOpenUrl({
        lat: mapCoords.lat,
        lng: mapCoords.lng,
        savedMapUrl: savedMapUrlTrimmed || null,
      });
    }
    return savedMapUrlTrimmed;
  }, [mapCoords, savedMapUrlTrimmed]);
  const websiteUrl = (biz.website || '').trim();
  const websiteHref = websiteUrl ? normalizeWebsiteForStorage(websiteUrl) : null;

  /** Normalize WhatsApp from camelCase + DB snake_case; wa.me needs enough digits. */
  const businessWhatsAppRaw = getBusinessWhatsAppRaw(biz);
  const hasWhatsApp = digitsForWaMe(businessWhatsAppRaw).length >= 5;

  /** Refresh listing contact fields from DB so `whatsapp_number` is never stale in UI/modal. */
  useEffect(() => {
    if (!biz?.id) return;
    const listingId = biz.id;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from('businesses')
        .select('whatsapp_number, phone, email, contact_email, map_url, website')
        .eq('id', profileId)
        .maybeSingle();
      if (cancelled || error || !data) return;
      const row = data as {
        whatsapp_number?: string | null;
        phone?: string | null;
        email?: string | null;
        contact_email?: string | null;
        map_url?: string | null;
        website?: string | null;
      };
      const wa = (row.whatsapp_number ?? '').trim();
      const mapUrl = (row.map_url ?? '').trim();
      const site = (row.website ?? '').trim();
      setSelectedBusiness((current) => {
        if (!current || current.id !== listingId) return current;
        return {
          ...current,
          whatsappNumber: wa || current.whatsappNumber || null,
          whatsapp_number: wa || current.whatsapp_number || null,
          phone: (row.phone ?? '').trim() || current.phone,
          contactEmail:
            (row.contact_email ?? '').trim() ||
            (row.email ?? '').trim() ||
            current.contactEmail ||
            null,
          mapUrl: mapUrl || current.mapUrl || null,
          map_url: mapUrl || current.map_url || null,
          website: site || current.website || null,
        };
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [biz.id, profileId, setSelectedBusiness]);

  // Public moderation safety: only use approved photos for the primary cover when available.
  useEffect(() => {
    if (!biz?.id) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from('business_photos')
        .select('url, file_path')
        .eq('business_id', profileId)
        .eq('status', 'approved')
        .order('is_main', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(1);
      if (cancelled || error) return;
      const first = data?.[0] as { url?: string; file_path?: string } | undefined;
      if (!first) {
        setDisplayCoverImage(biz.image || '');
        return;
      }
      const resolved = getPhotoDisplayUrl(first, SUPABASE_URL) || first.url || biz.image || '';
      setDisplayCoverImage(resolved);
    })();
    return () => {
      cancelled = true;
    };
  }, [biz.id, biz.image, profileId]);

  // Compute super star count: use DB field if available, otherwise count from reviews
  const superStarCount = (biz.superStarCount && biz.superStarCount > 0)
    ? biz.superStarCount
    : reviews.filter(r => r.has_super_star).length;

  // Count super star reviews for this business
  const superStarReviewCount = reviews.filter(r => r.has_super_star).length;

  const handleBack = () => {
    setSelectedBusiness(null);
    setCurrentView('deals');
  };

  const handleRequestBooking = () => {
    if (!user) {
      setShowAuth(true);
      setAuthMode('signin');
      return;
    }
    if (!user.pass) {
      toast.error(
        language === 'en'
          ? 'You need an active pass to request bookings and get discounts!'
          : language === 'fr'
            ? 'Vous avez besoin d’un pass actif pour demander une réservation et bénéficier des réductions !'
            : 'Yu nidim aktiv pas blong askem bukin mo kasem diskaon!',
      );
      setCurrentView('passes');
      return;
    }
    setShowBookingModal(true);
  };

  const handleWhatsApp = () => {
    const raw = getBusinessWhatsAppRaw(biz);
    const d = digitsForWaMe(raw);
    if (d.length < 5) return;
    const url = buildBookingInquiryWhatsAppUrl(d, {
      businessName: biz.name,
      visitDate: 'To be confirmed',
      adults: 1,
      children: 0,
      infants: 0,
      estimatedPriceWithDiscount: formatVT(biz.dealPrice),
      userName: user?.name?.trim() || 'Guest',
    });
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleShare = async () => {
    const shareBody = plainTextFromHtml(desc || '') || biz.name;
    const shareData = { title: biz.name, text: shareBody, url: window.location.href };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
    } catch {
      // Share API denied or cancelled — fall through to clipboard
    }
    try {
      await navigator.clipboard.writeText(`${shareData.text}\n${shareData.url}`);
      toast.success(language === 'en' ? 'Link copied to clipboard!' : language === 'fr' ? 'Lien copié !' : 'Link i kopi finis!');
    } catch {
      toast.info(language === 'en' ? 'Copy this link to share:' : 'Copiez ce lien :', { description: window.location.href, duration: 6000 });
    }
  };


  return (
    <div className="min-h-screen bg-gray-50 pt-16">
      <div className="max-w-4xl mx-auto px-4 py-4">
        <button onClick={handleBack} className="flex items-center gap-2 text-gray-600 hover:text-teal-700 transition-colors text-sm font-medium">
          <ArrowLeft className="w-4 h-4" />
          {t('general.back', language)}
        </button>
      </div>

      <div className="max-w-4xl mx-auto px-4 pb-16">
        <div className="relative rounded-2xl overflow-hidden mb-6 shadow-lg">
          <img src={displayCoverImage || biz.image} alt={biz.name} className="w-full h-64 sm:h-80 object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          <div className="absolute bottom-4 left-4 right-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="px-3 py-1 rounded-lg bg-gradient-to-r from-orange-500 to-amber-500 text-white text-sm font-bold">{biz.discount}</span>
              <span className="px-2 py-0.5 rounded-md bg-white/20 backdrop-blur-sm text-white text-xs capitalize">{biz.category}</span>
              {hasWhatsApp && (
                <button
                  onClick={handleWhatsApp}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-green-500/90 backdrop-blur-sm text-white text-xs font-bold hover:bg-green-600 transition-colors"
                >
                  <WhatsAppIcon className="w-3.5 h-3.5" />
                  WhatsApp
                </button>
              )}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white">{biz.name}</h1>
              {superStarCount > 0 && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-purple-500 to-violet-600 text-white text-xs font-bold shadow-lg shadow-purple-500/30">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{superStarCount} Super Star{superStarCount !== 1 ? 's' : ''}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              {looksLikeRichDescriptionHtml(desc || '') ? (
                <div
                  className="prose prose-sm max-w-none text-gray-700 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: sanitizeBusinessDescriptionHtml(desc || '') }}
                />
              ) : (
                <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{desc}</p>
              )}
              <div className="flex flex-wrap gap-2 mt-4">
                {biz.tags.map(tag => (
                  <span key={tag} className="px-3 py-1 rounded-full bg-teal-50 text-teal-700 text-xs font-medium">{tag}</span>
                ))}
              </div>
            </div>

            {showTieredTable && (
              <div className="bg-white rounded-xl p-5 shadow-sm border border-violet-100">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-violet-100 flex items-center justify-center">
                    <Layers className="w-4 h-4 text-violet-700" />
                  </div>
                  <div>
                    <h3 className="font-bold text-violet-900 text-sm">
                      {language === 'en' ? 'Per-person pricing (VT)' : language === 'fr' ? 'Tarifs par personne (VT)' : 'Praes long wanwan man (VT)'}
                    </h3>
                    <p className="text-xs text-violet-700/85">
                      {language === 'en'
                        ? 'Rates by guest type. Use Request booking to estimate totals for your party.'
                        : language === 'fr'
                          ? 'Tarifs selon le type de visiteur. Utilisez « Demander une réservation » pour le total.'
                          : 'Praes blong wanwan kaen man. Yusum Askem bukin blong lukim totel.'}
                    </p>
                  </div>
                </div>
                <div className="overflow-x-auto rounded-lg border border-violet-100">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-violet-100 text-left text-[10px] uppercase tracking-wide text-gray-500">
                        <th className="px-3 py-2 font-semibold">
                          {language === 'en' ? 'Tier' : language === 'fr' ? 'Palier' : 'Ta'}
                        </th>
                        <th className="px-3 py-2 font-semibold">
                          {language === 'en' ? 'Pax' : language === 'fr' ? 'Pers.' : 'Man'}
                        </th>
                        <th className="px-3 py-2 font-semibold">
                          {language === 'en' ? 'Standard' : language === 'fr' ? 'Standard' : 'Stanad'}
                        </th>
                        <th className="px-3 py-2 font-semibold text-teal-800">
                          StikmNek
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {pricingTiers.map((row, i) => (
                        <tr key={i} className="border-b border-gray-50 last:border-0">
                          <td className="px-3 py-2 font-medium text-gray-900">{row.label || '—'}</td>
                          <td className="px-3 py-2 text-gray-700">
                            {row.min_pax}
                            {row.max_pax != null ? `–${row.max_pax}` : '+'}
                          </td>
                          <td className="px-3 py-2 text-gray-800">{formatVT(row.original_price_vt)}</td>
                          <td className="px-3 py-2 font-semibold text-teal-700">{formatVT(row.deal_price_vt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* WhatsApp Contact Card */}
            {hasWhatsApp && (
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-5 shadow-sm border border-green-200">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center shadow-lg shadow-green-200/50">
                    <WhatsAppIcon className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-green-900 text-sm">
                      {language === 'en' ? 'Chat on WhatsApp' : language === 'fr' ? 'Discuter sur WhatsApp' : 'Toktok long WhatsApp'}
                    </h3>
                    <p className="text-xs text-green-600">
                      {language === 'en'
                        ? 'Send a message directly to this business'
                        : language === 'fr'
                        ? 'Envoyez un message directement à cette entreprise'
                        : 'Sendem mesej daerekli long bisnis ia'}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-green-200 flex-1 min-w-0">
                    <WhatsAppIcon className="w-4 h-4 text-green-600 shrink-0" />
                    <span className="text-sm font-medium text-gray-700 truncate">{formatWhatsAppDisplay(businessWhatsAppRaw)}</span>
                  </div>
                  <button
                    onClick={handleWhatsApp}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-green-500 to-green-600 text-white font-bold text-sm hover:from-green-600 hover:to-green-700 transition-all shadow-lg shadow-green-200/50 whitespace-nowrap"
                  >
                    <WhatsAppIcon className="w-4 h-4" />
                    {language === 'en' ? 'Open WhatsApp' : language === 'fr' ? 'Ouvrir WhatsApp' : 'Openem WhatsApp'}
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-[11px] text-green-500 mt-2">
                  {language === 'en'
                    ? 'Opens WhatsApp with a pre-filled message. Available on mobile and desktop.'
                    : language === 'fr'
                    ? 'Ouvre WhatsApp avec un message pré-rempli. Disponible sur mobile et bureau.'
                    : 'Openem WhatsApp wetem mesej we i redi. I wok long fon mo kompyuta.'}
                </p>
              </div>
            )}

            {/* Super Star Summary Card - only show if business has super stars */}
            {superStarCount > 0 && (
              <div className="bg-gradient-to-r from-purple-50 to-violet-50 rounded-xl p-5 shadow-sm border border-purple-100">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center shadow-lg shadow-purple-200/50">
                    <Sparkles className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-purple-900 text-sm">Super Star Recognition</h3>
                    <p className="text-xs text-purple-600">
                      This business has received {superStarCount} Super Star{superStarCount !== 1 ? 's' : ''} from {superStarReviewCount} premium review{superStarReviewCount !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(superStarCount, 10) }).map((_, i) => (
                    <div key={i} className="relative">
                      <Star className="w-5 h-5 text-purple-500 fill-purple-500" />
                      <Sparkles className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 text-yellow-400" />
                    </div>
                  ))}
                  {superStarCount > 10 && (
                    <span className="text-xs font-bold text-purple-600 ml-1">+{superStarCount - 10} more</span>
                  )}
                </div>
              </div>
            )}

            {/* Photo Gallery */}
            <PhotoGallery
              businessId={profileId}
              coverImage={displayCoverImage || biz.image}
              businessName={biz.name}
            />

            {/* Reviews Section */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">
                    {t('review.title', language)}
                  </h3>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {reviews.length} {t('biz.reviews', language)}
                    {reviews.length > 0 && (
                      <span className="ml-2 inline-flex items-center gap-1">
                        <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                        <span className="font-semibold text-gray-700">
                          {(reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)}
                        </span>
                        <span className="text-gray-400">avg</span>
                      </span>
                    )}
                    {superStarReviewCount > 0 && (
                      <span className="ml-2 inline-flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                        <span className="font-semibold text-purple-600">{superStarReviewCount}</span>
                        <span className="text-purple-400">super</span>
                      </span>
                    )}
                  </p>
                </div>
                {!showReviewForm && (
                  <button
                    onClick={() => setShowReviewForm(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-50 text-teal-700 text-sm font-semibold hover:bg-teal-100 transition-colors"
                  >
                    <MessageSquarePlus className="w-4 h-4" />
                    {t('review.write', language)}
                  </button>
                )}
              </div>

              {/* Review Form */}
              {showReviewForm && (
                <div className="mb-6">
                  <ReviewForm
                    businessId={profileId}
                    businessName={biz.name}
                    compact
                    onSuccess={() => setShowReviewForm(false)}
                    onCancel={() => setShowReviewForm(false)}
                  />
                </div>
              )}

              {/* Reviews List */}
              <div className="space-y-4">
                {reviews.length > 0 ? reviews.map(review => {
                  const isSuperStar = review.has_super_star;
                  return (
                    <div
                      key={review.id}
                      className={`flex gap-3 pb-4 border-b last:border-0 rounded-lg transition-all ${
                        isSuperStar
                          ? 'border-purple-100 bg-gradient-to-r from-purple-50/60 to-violet-50/40 p-3 -mx-1 ring-1 ring-purple-100'
                          : 'border-gray-100'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 ${
                        isSuperStar
                          ? 'bg-gradient-to-br from-purple-500 to-violet-600'
                          : 'bg-gradient-to-br from-teal-500 to-emerald-500'
                      }`}>
                        {(review.user_name || '?').split(' ').map(w => w[0]).join('').slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-semibold text-sm text-gray-900">{review.user_name || 'Anonymous'}</span>
                          <div className="flex items-center gap-0.5">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star
                                key={i}
                                className={`w-3 h-3 ${i < review.rating ? 'text-amber-400 fill-amber-400' : 'text-gray-200'}`}
                              />
                            ))}
                            {/* Super Star - 6th purple star */}
                            {isSuperStar && (
                              <div className="relative ml-0.5">
                                <Star className="w-4 h-4 text-purple-500 fill-purple-500" />
                                <Sparkles className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 text-yellow-400" />
                              </div>
                            )}
                          </div>
                          {isSuperStar && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-purple-100 border border-purple-200 text-[9px] font-bold text-purple-700">
                              <Sparkles className="w-2.5 h-2.5" />
                              Super Star
                            </span>
                          )}
                          <span className="text-xs text-gray-400">{new Date(review.created_at).toLocaleDateString()}</span>
                        </div>
                        <p className="text-sm text-gray-600 leading-relaxed">{review.comment}</p>
                        {reviewResponsesById[review.id] && (
                          <div className="mt-3 rounded-xl border border-teal-100 bg-gradient-to-r from-teal-50/90 to-emerald-50/50 px-3 py-2.5">
                            <div className="flex items-center gap-1.5 mb-1">
                              <Store className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                              <span className="text-[10px] font-bold text-teal-800 uppercase tracking-wide">
                                {language === 'en' ? 'Response from business' : language === 'fr' ? 'Réponse de l\'établissement' : 'Bisnis i talem'}
                              </span>
                            </div>
                            <p className="text-sm text-teal-900 leading-relaxed whitespace-pre-wrap">{reviewResponsesById[review.id].response}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }) : (
                  <div className="text-center py-8">
                    <MessageSquarePlus className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm text-gray-400">
                      {language === 'en' ? 'No reviews yet. Be the first to share your experience!' :
                       language === 'fr' ? 'Pas encore d\'avis. Soyez le premier à partager votre expérience !' :
                       'No gat riviu yet. Yu faswan blong searem eksperiens blong yu!'}
                    </p>
                    {!showReviewForm && (
                      <button
                        onClick={() => setShowReviewForm(true)}
                        className="mt-3 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 transition-colors"
                      >
                        {t('review.write', language)}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 sticky top-20">
              {showTieredTable ? (
                <div className="mb-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    {language === 'en' ? 'Pricing' : language === 'fr' ? 'Tarifs' : 'Praes'}
                  </p>
                  <p className="text-sm text-gray-700">
                    {language === 'en'
                      ? 'Tiered per-person rates — see the table in the description for Adult / Child / Infant VT.'
                      : language === 'fr'
                        ? 'Tarifs par palier — voir le tableau sous la description.'
                        : 'Praes long wanwan man — lukim tebol long diskripsen.'}
                  </p>
                </div>
              ) : (
                <div className="flex items-baseline gap-2 mb-4">
                  <span className="text-3xl font-extrabold text-teal-700">{formatVT(biz.dealPrice)}</span>
                  <span className="text-lg text-gray-400 line-through">{formatVT(biz.originalPrice)}</span>
                </div>
              )}

              <div className="flex items-center gap-1 mb-2">
                <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
                <span className="font-bold text-gray-900">{biz.rating}</span>
                <span className="text-sm text-gray-400">({biz.reviewCount} {t('biz.reviews', language)})</span>
              </div>

              {/* Super Star count in sidebar */}
              {superStarCount > 0 && (
                <div className="flex items-center gap-1.5 mb-4 px-2.5 py-1.5 rounded-lg bg-purple-50 border border-purple-100">
                  <Sparkles className="w-4 h-4 text-purple-500" />
                  <span className="text-sm font-bold text-purple-700">{superStarCount}</span>
                  <span className="text-xs text-purple-500">Super Star{superStarCount !== 1 ? 's' : ''}</span>
                </div>
              )}

              <button
                type="button"
                onClick={handleRequestBooking}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-bold text-sm hover:from-teal-700 hover:to-emerald-700 transition-all shadow-lg shadow-teal-200 mb-3 flex items-center justify-center gap-2"
              >
                <CalendarDays className="w-4 h-4" />
                {language === 'en' ? 'Request booking' : language === 'fr' ? 'Demander une réservation' : 'Askem bukin'}
              </button>

              {/* WhatsApp Button in Sidebar */}
              {hasWhatsApp && (
                <button
                  onClick={handleWhatsApp}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-green-500 to-green-600 text-white font-bold text-sm hover:from-green-600 hover:to-green-700 transition-all shadow-lg shadow-green-200 mb-3 flex items-center justify-center gap-2"
                >
                  <WhatsAppIcon className="w-4 h-4" />
                  {language === 'en' ? 'Message on WhatsApp' : language === 'fr' ? 'Message sur WhatsApp' : 'Mesej long WhatsApp'}
                </button>
              )}

              <div className="flex gap-2">
                <button onClick={() => { if (!user) { setShowAuth(true); return; } toggleFavorite(profileId); }}
                  className={`flex-1 py-2.5 rounded-xl border text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors ${isFav ? 'border-red-200 bg-red-50 text-red-600' : 'border-gray-200 text-gray-600 hover:border-teal-300'}`}>
                  <Heart className={`w-4 h-4 ${isFav ? 'fill-current' : ''}`} />
                  {t('biz.save', language)}
                </button>
                <button onClick={handleShare} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold flex items-center justify-center gap-1.5 hover:border-teal-300 transition-colors">
                  <Share2 className="w-4 h-4" />
                  Share
                </button>
              </div>
              <div className="mt-5 space-y-3 pt-5 border-t border-gray-100">
                <div className="flex items-center gap-3 text-sm text-gray-600"><MapPin className="w-4 h-4 text-teal-600 shrink-0" />{biz.location}</div>
                {mapCoords && (
                  <BusinessDetailMap
                    lat={mapCoords.lat}
                    lng={mapCoords.lng}
                    savedMapUrl={savedMapUrlTrimmed || null}
                    language={language}
                  />
                )}
                {websiteHref && (
                  <a
                    href={websiteHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 text-sm text-teal-700 hover:text-teal-800 font-medium group"
                  >
                    <Globe className="w-4 h-4 text-teal-600 shrink-0" />
                    <span className="underline-offset-2 group-hover:underline break-all">
                      {displayWebsiteForInput(websiteUrl)}
                    </span>
                    <ExternalLink className="w-3.5 h-3.5 shrink-0 opacity-60" />
                  </a>
                )}
                {!mapCoords && googleMapsOpenHref ? (
                  <a
                    href={googleMapsOpenHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-2 rounded-lg border border-teal-200 text-teal-700 text-xs font-semibold hover:bg-teal-50"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    {language === 'en' ? 'View on Google Maps' : language === 'fr' ? 'Voir sur Google Maps' : 'Lukim long Google Maps'}
                  </a>
                ) : null}
                <div className="flex items-center gap-3 text-sm text-gray-600"><Clock className="w-4 h-4 text-teal-600 shrink-0" />{biz.hours}</div>
                <div className="flex items-center gap-3 text-sm text-gray-600"><Phone className="w-4 h-4 text-teal-600 shrink-0" />{biz.phone}</div>
                {hasWhatsApp && (
                  <button
                    onClick={handleWhatsApp}
                    className="flex items-center gap-3 text-sm text-green-600 hover:text-green-700 transition-colors w-full text-left group"
                  >
                    <WhatsAppIcon className="w-4 h-4 shrink-0" />
                    <span className="group-hover:underline">{formatWhatsAppDisplay(businessWhatsAppRaw)}</span>
                    <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {user && (
        <BookingInquiryModal
          open={showBookingModal}
          onOpenChange={setShowBookingModal}
          business={biz}
          user={user}
          userProfile={userProfile}
          language={language}
        />
      )}
    </div>
  );
};

export default BusinessDetail;
