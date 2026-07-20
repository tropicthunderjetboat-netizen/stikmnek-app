import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Copy, Heart, MapPin, Ticket, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAppContext } from '@/contexts/AppContext';
import {
  businesses as localBusinesses,
  listingOfferBadgeText,
  touristFacingOfferings,
  type Business,
} from '@/data/businesses';
import { clampPartySize } from '@/data/pricing';
import { businessesMatchingFavoriteKeys, isListingFavorited } from '@/lib/favoritesUi';
import { dealPathForBusiness } from '@/lib/dealUrl';
import { getBusinessImageUrl } from '@/lib/utils';
import { loadTripState, saveTripState } from '@/lib/tripStorage';
import { SUPABASE_URL } from '@/lib/supabase';
import PassTicketCard from '@/components/PassTicketCard';
import ShareButton from '@/components/ShareButton';

function fmtPassDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso.includes('T') ? iso : `${iso}T00:00:00`).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

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
  const [copied, setCopied] = useState(false);

  const allBusinesses = useMemo(() => {
    const live = touristFacingOfferings(dbBusinesses);
    return live.length > 0 ? live : localBusinesses;
  }, [dbBusinesses]);

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

  const hasPass = Boolean(user?.pass && user?.passId);
  const partySize = clampPartySize(user?.passPeopleCount || 1);
  const qrCodeUrl = hasPass
    ? `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(user!.passId!)}&color=0d9488&bgcolor=ffffff&margin=8`
    : null;

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
      setAuthMode('signin');
      setShowAuth(true);
      return;
    }
    void purchasePass();
  }, [user, purchasePass, setAuthMode, setShowAuth]);

  const handleCopyPassId = useCallback(() => {
    if (!user?.passId) return;
    void navigator.clipboard.writeText(user.passId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [user?.passId]);

  const title =
    language === 'fr' ? 'Sauvé · Mon Pass' : language === 'bi' ? 'Sevem · Pas Blong Mi' : 'Saved · My Pass';

  const exploreLabel =
    language === 'fr' ? 'Explorer les offres' : language === 'bi' ? 'Lukluk ol deal' : 'Explore Deals';

  const detailsLabel =
    language === 'fr' ? 'Détails' : language === 'bi' ? 'Detail' : 'View Deal';

  const getPassLabel =
    language === 'fr' ? 'Obtenir le Pass' : language === 'bi' ? 'Karem Pas' : 'Get Pass';

  return (
    <div className="min-h-screen bg-gray-50 pt-20">
      <div className="mx-auto max-w-2xl px-4 sm:px-6 pb-8">
        <header className="mb-5">
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">{title}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {language === 'fr'
              ? 'Votre pass et vos deals enregistrés, au même endroit.'
              : language === 'bi'
                ? 'Pas blong yu mo ol deal we yu sevem — wan ples.'
                : 'Your pass and saved deals — one place to compare and redeem.'}
          </p>
        </header>

        {/* ── Pass wallet hero ── */}
        <section className="mb-8" aria-label="StikmNek Pass">
          {hasPass ? (
            <PassTicketCard partySize={partySize} qrCodeUrl={qrCodeUrl} size="compact">
              <div className="mt-3 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  </span>
                  <span className="text-xs font-bold uppercase tracking-wide text-emerald-700">
                    {language === 'fr' ? 'Pass actif' : language === 'bi' ? 'Aktiv pas' : 'Active pass'}
                  </span>
                </div>

                {(user?.passValidFrom || user?.passValidUntil) && (
                  <div className="rounded-xl border border-teal-100 bg-white/80 px-3 py-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#888888]">
                      {language === 'en' ? 'Valid' : language === 'fr' ? 'Valide' : 'Valit'}
                    </p>
                    <p className="text-sm font-semibold text-[#0A0A0A]">
                      {fmtPassDate(user?.passValidFrom)} → {fmtPassDate(user?.passValidUntil)}
                    </p>
                  </div>
                )}

                <p className="text-center text-xs text-[#555555]">
                  {language === 'en' ? 'Holder' : language === 'fr' ? 'Titulaire' : 'Holda'} ·{' '}
                  <span className="font-semibold text-[#0A0A0A]">{user?.name}</span>
                </p>

                <button
                  type="button"
                  onClick={handleCopyPassId}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-teal-200/80 bg-white/70 py-2.5 text-sm text-[#555555] transition-colors hover:bg-white"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="font-medium text-green-600">
                        {language === 'fr' ? 'Copié !' : language === 'bi' ? 'Kopi!' : 'Copied!'}
                      </span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      <span>
                        {language === 'fr'
                          ? 'Copier le code pass'
                          : language === 'bi'
                            ? 'Kopi pas kod'
                            : 'Copy pass code'}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </PassTicketCard>
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
                    ? 'Avec un StikmNek Tourist Pass, présentez votre QR chez les partenaires locaux et économisez sur vos deals enregistrés.'
                    : language === 'bi'
                      ? 'Wetem StikmNek Tourist Pass, soem QR long ol lokal bisnis mo sevem long ol deal we yu laikem.'
                      : 'Unlock all discounts below with a StikmNek Tourist Pass — show your QR to local operators and save on every deal you’ve hearted.'}
                </p>
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
                  ? 'Deals enregistrés'
                  : language === 'bi'
                    ? 'Ol deal we yu sevem'
                    : 'Saved deals'}
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
