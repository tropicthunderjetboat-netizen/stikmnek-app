import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, MapPin, Ticket, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAppContext } from '@/contexts/AppContext';
import {
  listingOfferBadgeText,
  touristFacingOfferings,
  type Business,
} from '@/data/businesses';
import { calculatePassPrice, clampPartySize } from '@/data/pricing';
import { businessesMatchingFavoriteKeys, isListingFavorited } from '@/lib/favoritesUi';
import { dealPathForBusiness } from '@/lib/dealUrl';
import { getBusinessImageUrl } from '@/lib/utils';
import {
  checkoutFromTrip,
  loadTripState,
  savePendingCheckout,
  saveTripState,
  tripLengthToIsExtended,
  TRIP_STORAGE_KEY,
} from '@/lib/tripStorage';
import {
  estimateTripSavings,
  tripSavingsSummaryLine,
  tripSavingsVsPassLine,
} from '@/lib/tripSavingsEstimate';
import { SUPABASE_URL } from '@/lib/supabase';
import PassCard from '@/components/PassCard';
import ShareButton from '@/components/ShareButton';
import { peekPostPurchaseTripFocus, consumePostPurchaseTripFocus } from '@/lib/qrCode';

function dealLabel(biz: Business): string {
  try {
    const badge = listingOfferBadgeText(biz);
    if (badge) return badge;
  } catch {
    /* ignore */
  }
  if (biz?.discount) return String(biz.discount);
  return 'Pass deal';
}

/** Safe cover URL — never throws; always returns a displayable src. */
function safeCoverSrc(biz: Business | null | undefined): string {
  if (!biz) return '/placeholder.svg';
  const row = biz as Business & {
    cover_image_url?: string | null;
    image_url?: string | null;
    photos?: unknown;
  };
  const photo0 = Array.isArray(row.photos) ? row.photos[0] : null;
  const photoSrc =
    typeof photo0 === 'string'
      ? photo0
      : photo0 && typeof photo0 === 'object' && photo0 !== null && 'url' in photo0
        ? String((photo0 as { url?: unknown }).url ?? '')
        : '';
  const raw = String(
    row.image || row.cover_image_url || row.image_url || photoSrc || '',
  ).trim();
  if (!raw) return '/placeholder.svg';
  try {
    return getBusinessImageUrl(raw, SUPABASE_URL) || raw || '/placeholder.svg';
  } catch {
    return raw || '/placeholder.svg';
  }
}

/**
 * Hybrid Hub "Saved" tab — digital pass wallet + favorited deals comparison list.
 * Logged-in: Supabase `favorites` + local trip hearts. Guests: local trip hearts only.
 */
const MyFavoritesList: React.FC = () => {
  const navigate = useNavigate();
  const {
    language,
    user,
    favorites,
    dbBusinesses,
    toggleFavorite,
    purchasePass,
    setCurrentView,
    setSelectedBusiness,
    setShowAuth,
    setAuthMode,
  } = useAppContext();

  const [tripSavedIds, setTripSavedIds] = useState<string[]>(() => loadTripState().savedPlaceIds);
  const [tripPaidPeople, setTripPaidPeople] = useState(() => loadTripState().paidPeople || 1);
  const [tripIsExtended, setTripIsExtended] = useState(
    () => tripLengthToIsExtended(loadTripState().tripLength),
  );
  const [showTripFocusBanner, setShowTripFocusBanner] = useState(() => peekPostPurchaseTripFocus());

  useEffect(() => {
    if (peekPostPurchaseTripFocus()) setShowTripFocusBanner(true);
  }, [user?.passId]);

  const dismissTripFocusBanner = useCallback(() => {
    consumePostPurchaseTripFocus();
    setShowTripFocusBanner(false);
  }, []);

  useEffect(() => {
    const sync = () => {
      const t = loadTripState();
      setTripSavedIds(t.savedPlaceIds);
      setTripPaidPeople(t.paidPeople || 1);
      setTripIsExtended(tripLengthToIsExtended(t.tripLength));
    };
    sync();
    const onStorage = (e: StorageEvent) => {
      if (e.key === TRIP_STORAGE_KEY || e.key == null) sync();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('stikmnek-trip-updated', sync);
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('stikmnek-trip-updated', sync);
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);

  const allBusinesses = useMemo(() => touristFacingOfferings(dbBusinesses), [dbBusinesses]);

  const hasPass = Boolean(user?.pass && user?.passId);

  const savedDeals = useMemo(() => {
    const fromCloud = user ? businessesMatchingFavoriteKeys(allBusinesses, favorites) : [];
    const fromTrip = allBusinesses.filter((b) => tripSavedIds.includes(b.id));
    const seen = new Set<string>();
    const merged: Business[] = [];
    for (const b of [...fromCloud, ...fromTrip]) {
      if (seen.has(b.id)) continue;
      seen.add(b.id);
      merged.push(b);
    }
    return merged;
  }, [user, allBusinesses, favorites, tripSavedIds]);

  const lang = (language === 'fr' ? 'fr' : 'en') as 'en' | 'fr';

  const tripSavings = useMemo(
    () => estimateTripSavings(savedDeals, tripPaidPeople || 1),
    [savedDeals, tripPaidPeople],
  );

  const passPriceAud = useMemo(
    () => calculatePassPrice(clampPartySize(tripPaidPeople || 1), tripIsExtended),
    [tripPaidPeople, tripIsExtended],
  );

  const savingsSummary = useMemo(
    () => tripSavingsSummaryLine(tripSavings, lang),
    [tripSavings, lang],
  );

  const savingsVsPass = useMemo(
    () => tripSavingsVsPassLine(tripSavings.totalVt, passPriceAud, lang),
    [tripSavings.totalVt, passPriceAud, lang],
  );

  const goHome = useCallback(() => {
    setCurrentView('home');
    navigate('/');
  }, [navigate, setCurrentView]);

  const openDeal = useCallback(
    (biz: Business) => {
      setSelectedBusiness(biz);
      setCurrentView('business-detail');
      navigate(dealPathForBusiness(biz));
    },
    [navigate, setCurrentView, setSelectedBusiness],
  );

  const removeFromSaved = useCallback(
    async (biz: Business) => {
      const nextTrip = loadTripState();
      if (nextTrip.savedPlaceIds.includes(biz.id)) {
        const updated = {
          ...nextTrip,
          savedPlaceIds: nextTrip.savedPlaceIds.filter((id) => id !== biz.id),
        };
        saveTripState(updated);
        setTripSavedIds(updated.savedPlaceIds);
      }

      if (user && isListingFavorited(favorites, biz)) {
        await toggleFavorite(biz, { silent: true });
        toast.success(
          language === 'fr'
            ? 'Retiré des favoris'
            : language === 'bi'
              ? 'Tekemaot long sevem'
              : 'Removed from saved',
        );
      } else if (!user) {
        toast.success(
          language === 'fr'
            ? 'Retiré de votre voyage'
            : language === 'bi'
              ? 'Tekemaot long trip'
              : 'Removed from your trip',
        );
      }
    },
    [user, favorites, toggleFavorite, language],
  );

  const handleGetPass = useCallback(() => {
    if (!user) {
      const pending = checkoutFromTrip(loadTripState());
      savePendingCheckout(pending);
      setAuthMode('signup-tourist');
      setShowAuth(true);
      return;
    }
    void purchasePass();
  }, [user, purchasePass, setAuthMode, setShowAuth]);

  const title =
    language === 'fr' ? 'Sauvé' : 'Saved';

  const exploreLabel =
    language === 'fr' ? 'Explorer les offres' : 'Explore Deals';

  const detailsLabel =
    language === 'fr' ? 'Détails' : 'View Deal';

  const getPassLabel =
    language === 'fr' ? 'Obtenir le Pass' : 'Get Pass';

  return (
    <div className="min-h-screen bg-gray-50 pt-20">
      <div className="mx-auto max-w-2xl px-4 sm:px-6 pb-8">
        <header className="mb-5">
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">{title}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {language === 'fr'
              ? 'Vos lieux enregistrés et votre pass — pour planifier et réserver.'
              : language === 'bi'
                ? 'Ol ples we yu sevem mo pas blong yu — blong planem trip.'
                : 'Your wishlist of places and your pass — plan what to do, then redeem.'}
          </p>
        </header>

        {showTripFocusBanner && hasPass && (
          <div className="mb-5 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-teal-900">
                {language === 'fr'
                  ? 'Votre pass est prêt — contactez vos lieux'
                  : language === 'bi'
                    ? 'Pas blong yu i redi — mesej ol ples'
                    : 'Your pass is ready — message your trip'}
              </p>
              <p className="mt-0.5 text-xs text-teal-800 leading-relaxed">
                {language === 'fr'
                  ? 'Ouvrez un lieu enregistré pour WhatsApp et le tarif membre. Montrez votre Pass à l’arrivée.'
                  : 'Open a saved place to WhatsApp them at the member rate. Show your Pass when you arrive.'}
              </p>
            </div>
            <button
              type="button"
              onClick={dismissTripFocusBanner}
              className="shrink-0 text-teal-700 text-xs font-bold"
            >
              Got it
            </button>
          </div>
        )}

        {/* ── Pass wallet hero ── */}
        <section className="mb-8" aria-label="StikmNek Pass">
          {hasPass ? (
            <PassCard size="compact" />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-teal-100 bg-gradient-to-br from-teal-50 via-white to-emerald-50 shadow-sm">
              <div className="p-5 sm:p-6">
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[#0FB5B5] text-white shadow-md shadow-teal-600/25">
                  <Ticket className="h-5 w-5" aria-hidden />
                </div>
                <h2 className="text-lg font-extrabold tracking-tight text-gray-900">
                  {language === 'fr'
                    ? 'Débloquez toutes les réductions ci-dessous'
                    : language === 'bi'
                      ? 'Anlokem olgeta diskaon daon'
                      : 'Unlock all discounts below'}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">
                  {language === 'fr'
                    ? 'Avec un Holiday Pass, montrez votre Pass chez les partenaires locaux et économisez sur vos lieux enregistrés.'
                    : 'Get member prices with a Holiday Pass — show your Pass to local operators on every place you’ve saved.'}
                </p>
                {savingsSummary ? (
                  <div className="mt-3 rounded-xl border border-teal-200 bg-white/80 px-3 py-2.5">
                    <p className="text-sm font-semibold text-teal-900 leading-snug">{savingsSummary}</p>
                    {savingsVsPass ? (
                      <p className="mt-1 text-xs text-teal-700/80 leading-snug">{savingsVsPass}</p>
                    ) : null}
                    <p className="mt-1 text-[11px] text-gray-500">
                      {language === 'fr'
                        ? 'Estimatif — basé sur les tarifs affichés · 6 ans et +'
                        : language === 'bi'
                          ? 'Estimet — blong praes we i so · 6 yia mo antap'
                          : 'Estimate only — based on listed prices · ages 6+'}
                    </p>
                  </div>
                ) : null}
                <ul className="mt-3 space-y-1.5 text-sm text-gray-700">
                  <li className="flex gap-2">
                    <span className="text-teal-600" aria-hidden>
                      ✓
                    </span>
                    {language === 'fr'
                      ? 'Réductions partenaires partout à Port Vila et au-delà'
                      : language === 'bi'
                        ? 'Diskaon long ol bisnis long Port Vila mo narafala aelan'
                        : 'Partner discounts across Port Vila & beyond'}
                  </li>
                  <li className="flex gap-2">
                    <span className="text-teal-600" aria-hidden>
                      ✓
                    </span>
                    {language === 'fr'
                      ? 'Un pass pour tout le groupe (6 ans et +)'
                      : language === 'bi'
                        ? 'Wan pas i kava long olgeta (6 yia mo antap)'
                        : 'One pass covers your whole crew (ages 6+)'}
                  </li>
                </ul>
                <button
                  type="button"
                  onClick={handleGetPass}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#0FB5B5] px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-teal-600/25 transition-colors hover:bg-[#0da3a3] active:scale-[0.99]"
                >
                  {getPassLabel}
                </button>
              </div>
            </div>
          )}
        </section>

        {/* ── Favorited deals comparison list ── */}
        <section aria-label="Saved deals">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-gray-900">
                {language === 'fr'
                  ? 'Choses à faire'
                  : language === 'bi'
                    ? 'Ol samting blong mekem'
                    : 'Things to do'}
              </h2>
              <p className="text-xs text-gray-500">
                {savedDeals.length}{' '}
                {language === 'en'
                  ? savedDeals.length === 1
                    ? 'place'
                    : 'places'
                  : language === 'fr'
                    ? 'lieu(x)'
                    : 'ples'}
              </p>
            </div>
          </div>

          {savedDeals.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-10 text-center shadow-sm">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50">
                <Heart className="h-7 w-7 text-red-400" aria-hidden />
              </div>
              <p className="text-sm font-semibold text-gray-900">
                {language === 'fr'
                  ? 'Aucun deal enregistré pour l’instant'
                  : language === 'bi'
                    ? 'No gat deal we yu sevem yet'
                    : 'No saved deals yet'}
              </p>
              <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-gray-500">
                {language === 'fr'
                  ? 'Parcourez le fil découverte et appuyez sur ♥ pour constituer votre itinéraire.'
                  : language === 'bi'
                    ? 'Swipe long hom mo tap ♥ blong bildimap trip blong yu.'
                    : 'Swipe the discovery feed and tap ♥ to build your itinerary.'}
              </p>
              <button
                type="button"
                onClick={goHome}
                className="mt-6 inline-flex items-center justify-center rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-teal-700"
              >
                {exploreLabel}
              </button>
            </div>
          ) : (
            <ul className="space-y-3">
              {savedDeals.map((biz) => {
                if (!biz?.id) return null;
                const img = safeCoverSrc(biz);
                const name = String(biz.name || 'Saved place').trim() || 'Saved place';
                const discount = dealLabel(biz);
                return (
                  <li
                    key={biz.id}
                    className="flex gap-3 overflow-hidden rounded-2xl border border-gray-100 bg-white p-3 shadow-sm"
                  >
                    <button
                      type="button"
                      onClick={() => openDeal(biz)}
                      className="shrink-0 overflow-hidden rounded-xl border border-gray-100"
                      aria-label={name}
                    >
                      <img
                        src={img}
                        alt=""
                        className="h-20 w-20 object-cover"
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = '/placeholder.svg';
                        }}
                      />
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-bold text-gray-900">{name}</p>
                          {biz.location ? (
                            <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-gray-500">
                              <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                              {biz.location}
                            </p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => void removeFromSaved(biz)}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                          aria-label={
                            language === 'fr'
                              ? 'Retirer des favoris'
                              : language === 'bi'
                                ? 'Tekemaot'
                                : 'Remove from favorites'
                          }
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>

                      <span className="mt-2 inline-block max-w-full truncate rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-emerald-800">
                        {discount}
                      </span>

                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openDeal(biz)}
                          className="inline-flex min-h-9 items-center justify-center rounded-lg bg-teal-600 px-3.5 text-xs font-bold text-white transition-colors hover:bg-teal-700"
                        >
                          {detailsLabel}
                        </button>
                        <ShareButton
                          business={biz}
                          discountText={discount}
                          variant="button-compact"
                        />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};

export default MyFavoritesList;
