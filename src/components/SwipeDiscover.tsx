import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Heart, MapPin, MessageCircle, Phone, Search, Star, User, X } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useAppContext, type DBReview } from '@/contexts/AppContext';
import {
  businessListingHasWhatsApp,
  businessListingWhatsAppRaw,
  customerFacingListPrice,
  effectiveListingDealPrice,
  listingOfferBadgeText,
  primaryEmbeddedOffering,
  touristFacingOfferings,
  type Business,
} from '@/data/businesses';
import { calculatePassPrice, clampPartySize } from '@/data/pricing';
import { favoriteKeyForOffering, favoriteKeyForProfile, isListingFavorited } from '@/lib/favoritesUi';
import { profileBusinessIdFor } from '@/lib/businessOfferingMap';
import { buildBookingInquiryWhatsAppUrl } from '@/lib/bookingInquiry';
import { digitsForWaMe, formatVT, getPhotoDisplayUrl } from '@/lib/utils';
import { fetchApprovedPhotosForOffering } from '@/lib/fetchApprovedPhotosForOffering';
import { pricingTiersForDisplay } from '@/lib/pricingTiers';
import { supabase, SUPABASE_URL } from '@/lib/supabase';
import {
  checkoutFromTrip,
  hasSeenTapHint,
  loadTripState,
  markTapHintSeen,
  saveTripState,
  type TripLength,
  type TripState,
} from '@/lib/tripStorage';
import { APP_ICON } from '@/lib/brand';

function reviewsForBusiness(dbReviews: DBReview[], business: Business): DBReview[] {
  const profileId = profileBusinessIdFor(business);
  const offeringId = String(business.id || '').trim();
  return dbReviews.filter((r) => {
    if (String(r.business_id) !== profileId) return false;
    const oid = r.offering_id != null ? String(r.offering_id).trim() : '';
    return oid ? oid === offeringId : true;
  });
}

function starCount(rating: number): number {
  // Super-star reviews are stored as 6 — show as 5 filled stars
  return Math.min(5, Math.max(0, Math.round(rating > 5 ? 5 : rating)));
}

type FeedItem = { kind: 'welcome' } | { kind: 'end' } | { kind: 'place'; business: Business };

/** Real Port Vila harbour photo (vertical) — tourist welcome + end cards. */
const WELCOME_HERO = '/port-vila-harbour.png';

function peopleWord(n: number): string {
  const p = clampPartySize(n);
  return p === 1 ? '1 person' : `${p} people`;
}

function passCtaLabel(isExtended: boolean, paidPeople: number, price: number): string {
  return `Get ${isExtended ? '7-Day' : '1-Day'} Pass for ${peopleWord(paidPeople)} · A$${price}`;
}

function shuffleBusinesses(list: Business[]): Business[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = out[i];
    out[i] = out[j]!;
    out[j] = tmp!;
  }
  return out;
}

function plainDescription(b: Business): string {
  return (b.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function oneLiner(b: Business): string {
  const raw = plainDescription(b);
  if (!raw) return 'A must-do while you’re in Vanuatu.';
  const words = raw.split(' ').slice(0, 12);
  return words.join(' ') + (raw.split(' ').length > 12 ? '…' : '');
}

function dealPillText(b: Business): string {
  const badge = listingOfferBadgeText(b);
  if (badge) return badge;
  const price = customerFacingListPrice(b);
  if (price > 0) return `${formatVT(price)} with pass`;
  return 'Passholder deal';
}

function placeKey(b: Business): string {
  return b.id;
}

/** Full photo visible (no crop) + soft blurred fill behind for letterboxing. */
function FitPhoto({
  src,
  className = '',
  imgClassName = '',
}: {
  src: string;
  className?: string;
  imgClassName?: string;
}) {
  if (!src) return <div className={`bg-neutral-900 ${className}`} />;
  return (
    <div className={`relative overflow-hidden bg-neutral-950 ${className}`}>
      <img
        src={src}
        alt=""
        aria-hidden
        draggable={false}
        className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl opacity-50"
      />
      <img
        src={src}
        alt=""
        draggable={false}
        className={`relative z-[1] h-full w-full object-contain object-center ${imgClassName}`}
      />
    </div>
  );
}

export default function SwipeDiscover() {
  const navigate = useNavigate();
  const {
    dbBusinesses,
    dbReviews,
    dataLoaded,
    user,
    favorites,
    purchasePass,
    toggleFavorite,
    setCurrentView,
    setShowAuth,
    setAuthMode,
  } = useAppContext();

  const [trip, setTrip] = useState<TripState>(() => loadTripState());
  const [index, setIndex] = useState(0);
  const [detail, setDetail] = useState<Business | null>(null);
  const [paywallBiz, setPaywallBiz] = useState<Business | null>(null);
  const [reviewsBiz, setReviewsBiz] = useState<Business | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [vibe, setVibe] = useState<'length' | 'party' | null>(null);
  const [dragY, setDragY] = useState(0);
  const [showTapCoach, setShowTapCoach] = useState(() => !hasSeenTapHint());
  /** Session-only: welcome shows again every fresh visit / page load */
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);
  const [shuffleKey, setShuffleKey] = useState(0);
  /** Session: first two place cards show a floating tip once. */
  const [dismissedFloatHints, setDismissedFloatHints] = useState<Record<0 | 1, boolean>>({
    0: false,
    1: false,
  });
  const touchStartY = useRef<number | null>(null);
  const preloaded = useRef<Set<string>>(new Set());
  const lengthPrompted = useRef(false);
  const partyPrompted = useRef(false);
  const lastWheelAt = useRef(0);
  /** Stable random order for this browser visit */
  const shuffleOrderRef = useRef<string[] | null>(null);

  const hasPass = Boolean(user?.pass);

  const listings = useMemo(() => {
    const base = touristFacingOfferings(dbBusinesses);
    if (base.length === 0) {
      shuffleOrderRef.current = null;
      return [];
    }
    const byId = new Map(base.map((b) => [b.id, b]));
    if (!shuffleOrderRef.current) {
      shuffleOrderRef.current = shuffleBusinesses(base).map((b) => b.id);
    } else {
      const known = new Set(shuffleOrderRef.current);
      const missing = base.filter((b) => !known.has(b.id));
      if (missing.length) {
        shuffleOrderRef.current = [
          ...shuffleOrderRef.current.filter((id) => byId.has(id)),
          ...shuffleBusinesses(missing).map((b) => b.id),
        ];
      } else {
        shuffleOrderRef.current = shuffleOrderRef.current.filter((id) => byId.has(id));
      }
    }
    return shuffleOrderRef.current.map((id) => byId.get(id)!).filter(Boolean);
  }, [dbBusinesses, shuffleKey]);

  const reshuffleFeed = useCallback(() => {
    const base = touristFacingOfferings(dbBusinesses);
    shuffleOrderRef.current = shuffleBusinesses(base).map((b) => b.id);
    setWelcomeDismissed(true);
    setShuffleKey((k) => k + 1);
    setIndex(0);
    setDragY(0);
  }, [dbBusinesses]);

  const persist = useCallback((next: TripState) => {
    setTrip(next);
    saveTripState(next);
  }, []);

  const isSaved = useCallback(
    (b: Business) => {
      if (trip.savedPlaceIds.includes(b.id)) return true;
      return isListingFavorited(favorites, b);
    },
    [trip.savedPlaceIds, favorites],
  );

  const saveCount = trip.savedPlaceIds.length;

  const feed: FeedItem[] = useMemo(() => {
    const places = listings.map((b) => ({ kind: 'place' as const, business: b }));
    const withEnd: FeedItem[] =
      places.length > 0 ? [...places, { kind: 'end' as const }] : places;
    if (welcomeDismissed) return withEnd;
    return [{ kind: 'welcome' as const }, ...withEnd];
  }, [listings, welcomeDismissed]);

  const current = feed[Math.min(index, Math.max(0, feed.length - 1))] ?? null;

  const finishWelcome = useCallback(() => {
    setWelcomeDismissed(true);
    setIndex(0);
    setDragY(0);
  }, []);

  const goHome = useCallback(() => {
    setDetail(null);
    setPaywallBiz(null);
    setReviewsBiz(null);
    setSearchOpen(false);
    setSearchQuery('');
    setVibe(null);
    setDragY(0);
    setWelcomeDismissed(false);
    setIndex(0);
  }, []);

  const dismissTapCoach = useCallback(() => {
    setShowTapCoach(false);
    markTapHintSeen();
  }, []);

  const openDetail = useCallback(
    (b: Business) => {
      dismissTapCoach();
      setDetail(b);
    },
    [dismissTapCoach],
  );

  useEffect(() => {
    if (detail || paywallBiz || vibe) return;
    if (!trip.vibeTripLengthDone && saveCount >= 2 && !lengthPrompted.current) {
      lengthPrompted.current = true;
      setVibe('length');
      return;
    }
    if (!trip.vibePartyDone && saveCount >= 4 && !partyPrompted.current) {
      partyPrompted.current = true;
      setVibe('party');
    }
  }, [saveCount, trip.vibeTripLengthDone, trip.vibePartyDone, detail, paywallBiz, vibe]);

  useEffect(() => {
    for (let i = index; i < Math.min(index + 4, feed.length); i++) {
      const item = feed[i];
      if (item?.kind !== 'place') continue;
      const src = item.business.image;
      if (!src || preloaded.current.has(src)) continue;
      preloaded.current.add(src);
      const img = new Image();
      img.src = src;
    }
  }, [index, feed]);

  const goNext = useCallback(() => {
    setDragY(0);
    if (current?.kind === 'welcome') {
      finishWelcome();
      return;
    }
    if (current?.kind === 'end') {
      reshuffleFeed();
      return;
    }
    setIndex((i) => Math.min(i + 1, Math.max(0, feed.length - 1)));
  }, [feed.length, current?.kind, finishWelcome, reshuffleFeed]);

  const goPrev = useCallback(() => {
    setDragY(0);
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  const heartPlace = useCallback(
    async (b: Business) => {
      const id = placeKey(b);
      const already = trip.savedPlaceIds.includes(id);
      const tripToastStyle = { background: '#FF6B6B', color: '#fff', border: 'none' } as const;
      if (already) {
        persist({ ...trip, savedPlaceIds: trip.savedPlaceIds.filter((x) => x !== id) });
        toast.success('Removed from Your Trip', { style: tripToastStyle });
      } else {
        persist({ ...trip, savedPlaceIds: [...trip.savedPlaceIds, id] });
        toast.success('Saved to Your Trip ✈️', { style: tripToastStyle });
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          try {
            navigator.vibrate(12);
          } catch {
            /* ignore */
          }
        }
      }
      if (user) {
        const key =
          b.id !== profileBusinessIdFor(b)
            ? favoriteKeyForOffering(b.id)
            : favoriteKeyForProfile(profileBusinessIdFor(b));
        const favNow = favorites.includes(key) || isListingFavorited(favorites, b);
        if (!already && !favNow) void toggleFavorite(b, { silent: true });
        if (already && favNow) void toggleFavorite(b, { silent: true });
      }
    },
    [trip, persist, user, favorites, toggleFavorite],
  );

  const setTripLength = (len: TripLength) => {
    persist({ ...trip, tripLength: len, vibeTripLengthDone: true });
    setVibe(null);
  };

  const setPartyQuick = (n: number) => {
    persist({ ...trip, paidPeople: clampPartySize(n), vibePartyDone: true });
    setVibe(null);
  };

  const openCheckout = useCallback(
    (override?: { partySize?: number; isExtended?: boolean }) => {
      const fromTrip = checkoutFromTrip(trip);
      void purchasePass({
        partySize: override?.partySize ?? fromTrip.partySize,
        isExtended: override?.isExtended ?? fromTrip.isExtended,
      });
    },
    [trip, purchasePass],
  );

  const tryContact = useCallback(
    (b: Business, mode: 'whatsapp' | 'call') => {
      if (!hasPass) {
        setPaywallBiz(b);
        return;
      }
      if (mode === 'call') {
        const phone = (b.phone || '').replace(/\s/g, '');
        if (phone) window.location.href = `tel:${phone}`;
        else toast.error('No phone number listed');
        return;
      }
      const raw = businessListingWhatsAppRaw(b);
      const digits = digitsForWaMe(raw);
      if (digits.length < 5) {
        toast.error('No WhatsApp for this place');
        return;
      }
      const url = buildBookingInquiryWhatsAppUrl(digits, {
        businessName: b.name,
        visitDate: 'To be confirmed',
        adults: clampPartySize(trip.paidPeople || 1),
        children: 0,
        estimatedPriceWithDiscount: formatVT(
          effectiveListingDealPrice(b) || customerFacingListPrice(b),
        ),
        userName: user?.name || 'Guest',
      });
      window.open(url, '_blank', 'noopener,noreferrer');
    },
    [hasPass, trip.paidPeople, user?.name],
  );

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0]?.clientY ?? null;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current == null) return;
    const y = e.touches[0]?.clientY ?? touchStartY.current;
    setDragY(y - touchStartY.current);
  };
  const onTouchEnd = () => {
    if (touchStartY.current == null) {
      setDragY(0);
      return;
    }
    if (dragY < -56) goNext();
    else if (dragY > 56) goPrev();
    setDragY(0);
    touchStartY.current = null;
  };

  const onWheel = (e: React.WheelEvent) => {
    if (detail || paywallBiz || vibe || reviewsBiz || searchOpen) return;
    const now = Date.now();
    if (now - lastWheelAt.current < 450) return;
    if (Math.abs(e.deltaY) < 40) return;
    lastWheelAt.current = now;
    if (e.deltaY > 0) goNext();
    else goPrev();
  };

  const savedBusinesses = useMemo(
    () => listings.filter((b) => trip.savedPlaceIds.includes(b.id)),
    [listings, trip.savedPlaceIds],
  );

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return listings
      .filter((b) => {
        const name = (b.name || '').toLowerCase();
        const loc = (b.location || '').toLowerCase();
        const cat = (b.category || '').toLowerCase();
        const tags = (b.tags || []).join(' ').toLowerCase();
        const deal = dealPillText(b).toLowerCase();
        return (
          name.includes(q) ||
          loc.includes(q) ||
          cat.includes(q) ||
          tags.includes(q) ||
          deal.includes(q)
        );
      })
      .slice(0, 12);
  }, [listings, searchQuery]);

  const jumpToBusiness = useCallback(
    (b: Business) => {
      const placeIndex = feed.findIndex((item) => item.kind === 'place' && item.business.id === b.id);
      if (placeIndex >= 0) {
        setIndex(placeIndex);
        setDragY(0);
      }
      setSearchOpen(false);
      setSearchQuery('');
      setDetail(null);
      setReviewsBiz(null);
      setPaywallBiz(null);
    },
    [feed],
  );

  const openPartnerSignIn = useCallback(() => {
    setAuthMode('signin');
    setShowAuth(true);
  }, [setAuthMode, setShowAuth]);

  const dismissFloatHint = useCallback((which: 0 | 1) => {
    setDismissedFloatHints((prev) => ({ ...prev, [which]: true }));
  }, []);

  const showSoftNudge = saveCount >= 5 && !trip.softNudgeDismissed && !hasPass;

  if (!dataLoaded) {
    return (
      <div className="fixed inset-0 z-40 bg-neutral-950 flex items-center justify-center">
        <div className="w-12 h-12 rounded-full border-2 border-teal-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (listings.length === 0) {
    return (
      <div className="fixed inset-0 z-40 bg-neutral-950 text-white flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-lg font-semibold">Places are loading in…</p>
        <button
          type="button"
          className="text-teal-400 underline"
          onClick={() => {
            setCurrentView('deals');
            navigate('/deals');
          }}
        >
          Browse classic list
        </button>
      </div>
    );
  }

  const isExtended = trip.tripLength === '2-4' || trip.tripLength === '5-7';
  const pricePreview = calculatePassPrice(clampPartySize(trip.paidPeople || 1), isExtended);

  return (
    <div className="fixed inset-0 z-40 bg-neutral-950 text-white overflow-hidden touch-none select-none">
      <div className="absolute top-0 inset-x-0 z-30 flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2 bg-gradient-to-b from-black/70 to-transparent pointer-events-none">
        <div className="pointer-events-auto">
          <button
            type="button"
            onClick={goHome}
            className="text-left rounded-lg active:opacity-80 -ml-1 px-1 py-0.5"
            aria-label="Back to home"
          >
            <p className="text-sm font-bold tracking-tight">StikmNek</p>
            <p className="text-[11px] text-neutral-300">Plan your Vanuatu trip</p>
          </button>
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          {saveCount > 0 && (
            <button
              type="button"
              onClick={() => {
                const first = listings.find((b) => trip.savedPlaceIds.includes(b.id));
                if (first) openDetail(first);
              }}
              className="rounded-full bg-white/15 backdrop-blur px-3 py-1.5 text-xs font-semibold"
              aria-label="Your trip"
            >
              ✈️ {saveCount}
            </button>
          )}
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="rounded-full bg-white/15 backdrop-blur w-9 h-9 flex items-center justify-center"
            aria-label="Search places"
          >
            <Search className="w-4 h-4 text-white" />
          </button>
          {hasPass && (
            <button
              type="button"
              onClick={() => setCurrentView('dashboard')}
              className="rounded-full bg-teal-600/90 backdrop-blur w-9 h-9 flex items-center justify-center"
              aria-label="Your profile"
            >
              <User className="w-4 h-4 text-white" />
            </button>
          )}
        </div>
      </div>

      {showSoftNudge && !searchOpen && (
        <div className="absolute top-14 inset-x-3 z-30 rounded-xl bg-teal-600 text-white text-sm px-3 py-2.5 flex items-start gap-2 shadow-lg">
          <p className="flex-1 leading-snug">Trip looking good 👍 Message these places with a pass.</p>
          <button
            type="button"
            className="shrink-0 text-white/80 text-lg leading-none px-1"
            aria-label="Dismiss"
            onClick={() => persist({ ...trip, softNudgeDismissed: true })}
          >
            ×
          </button>
        </div>
      )}

      <div
        className="absolute inset-0"
        style={{
          transform: `translateY(${dragY * 0.35}px)`,
          transition: dragY === 0 ? 'transform 0.2s ease' : undefined,
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onWheel={onWheel}
      >
        {current?.kind === 'welcome' && (
          <WelcomeCard
            onStart={finishWelcome}
            dealCount={listings.length}
            onPartnerSignIn={openPartnerSignIn}
          />
        )}
        {current?.kind === 'end' && (
          <EndCard
            hasPass={hasPass}
            savedCount={saveCount}
            passLabel={passCtaLabel(isExtended, trip.paidPeople, pricePreview)}
            onBrowseAgain={reshuffleFeed}
            onGetPass={() => openCheckout()}
          />
        )}
        {current?.kind === 'place' && (
          <PlaceCard
            business={current.business}
            saved={isSaved(current.business)}
            reviewCount={reviewsForBusiness(dbReviews, current.business).length || current.business.reviewCount || 0}
            rating={current.business.rating || 0}
            showTapCoach={showTapCoach && !detail && !vibe && !paywallBiz && !reviewsBiz && !searchOpen}
            onDismissCoach={dismissTapCoach}
            floatHint={(() => {
              const placeIdx = feed.slice(0, index).filter((i) => i.kind === 'place').length;
              if (placeIdx === 0 && !dismissedFloatHints[0]) return 'swipe' as const;
              if (placeIdx === 1 && !dismissedFloatHints[1]) return 'heart' as const;
              return null;
            })()}
            onDismissFloatHint={dismissFloatHint}
            onHeart={() => void heartPlace(current.business)}
            onOpen={() => openDetail(current.business)}
            onReviews={() => setReviewsBiz(current.business)}
            onNext={goNext}
          />
        )}
      </div>

      {vibe === 'length' && (
        <div className="absolute inset-0 z-50">
          <VibeShell title="Quick one ✋" subtitle="How long are you in Vanuatu?">
            {(
              [
                ['day', 'Day trip'],
                ['2-4', '2–4 days'],
                ['5-7', '5–7 days'],
              ] as const
            ).map(([id, label]) => (
              <VibeButton key={id} onClick={() => setTripLength(id)}>
                {label}
              </VibeButton>
            ))}
          </VibeShell>
        </div>
      )}
      {vibe === 'party' && (
        <div className="absolute inset-0 z-50">
          <VibeShell title="Who’s with you?" subtitle="Ages 6+ on the pass. Kids 5 and under free.">
            <VibeButton onClick={() => setPartyQuick(1)}>Just me</VibeButton>
            <VibeButton onClick={() => setPartyQuick(2)}>Me + 1</VibeButton>
            <VibeButton onClick={() => setPartyQuick(3)}>Me + 2</VibeButton>
            <VibeButton onClick={() => setPartyQuick(4)}>Family / group (4)</VibeButton>
            <div className="flex flex-wrap gap-2 justify-center pt-2">
              {[5, 6, 8, 10].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPartyQuick(n)}
                  className="min-h-11 min-w-11 rounded-full bg-white/10 text-sm font-semibold hover:bg-teal-600 transition-colors"
                >
                  {n}
                </button>
              ))}
            </div>
          </VibeShell>
        </div>
      )}

      {savedBusinesses.length > 0 && !detail && !paywallBiz && !vibe && !reviewsBiz && !searchOpen && current?.kind === 'place' && (
        <div className="absolute bottom-0 inset-x-0 z-20 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-8 bg-gradient-to-t from-black/90 via-black/50 to-transparent pointer-events-none">
          <div className="pointer-events-auto flex gap-2 overflow-x-auto pb-1">
            {savedBusinesses.slice(0, 8).map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => openDetail(b)}
                className="shrink-0 w-14 h-14 rounded-xl overflow-hidden ring-2 ring-teal-500/60"
              >
                <FitPhoto src={b.image} className="h-full w-full" />
              </button>
            ))}
            {!hasPass && (
              <button
                type="button"
                onClick={() => openCheckout()}
                className="shrink-0 self-center rounded-full bg-teal-600 px-4 py-2.5 text-xs font-bold whitespace-nowrap"
              >
                Get pass · A${pricePreview}
              </button>
            )}
          </div>
        </div>
      )}

      {detail && (
        <DetailSheet
          business={detail}
          saved={isSaved(detail)}
          hasPass={hasPass}
          paidPeople={trip.paidPeople}
          pricePreview={pricePreview}
          isExtended={isExtended}
          reviewCount={reviewsForBusiness(dbReviews, detail).length || detail.reviewCount || 0}
          rating={detail.rating || 0}
          onClose={() => setDetail(null)}
          onHeart={() => void heartPlace(detail)}
          onGetPass={() => openCheckout()}
          onMessage={() => tryContact(detail, 'whatsapp')}
          onCall={() => tryContact(detail, 'call')}
          onReviews={() => setReviewsBiz(detail)}
        />
      )}

      {searchOpen && (
        <SearchSheet
          query={searchQuery}
          onQueryChange={setSearchQuery}
          results={searchResults}
          onClose={() => {
            setSearchOpen(false);
            setSearchQuery('');
          }}
          onSelect={jumpToBusiness}
          onBrowseList={() => {
            setSearchOpen(false);
            setSearchQuery('');
            setCurrentView('deals');
            navigate('/deals');
          }}
        />
      )}

      {reviewsBiz && (
        <ReviewsSheet
          business={reviewsBiz}
          reviews={reviewsForBusiness(dbReviews, reviewsBiz)}
          onClose={() => setReviewsBiz(null)}
        />
      )}

      {paywallBiz && (
        <PaywallSheet
          businessName={paywallBiz.name}
          paidPeople={clampPartySize(trip.paidPeople || 1)}
          isExtended={isExtended}
          price={pricePreview}
          onClose={() => setPaywallBiz(null)}
          onBuy={() => {
            setPaywallBiz(null);
            openCheckout();
          }}
        />
      )}
    </div>
  );
}

function WelcomeCard({
  onStart,
  dealCount,
  onPartnerSignIn,
}: {
  onStart: () => void;
  dealCount: number;
  onPartnerSignIn: () => void;
}) {
  const dealsMeta =
    dealCount > 0
      ? `${dealCount} local deals • Free to browse • Swipe up to start`
      : 'Free to browse • Swipe up to start';

  const howItWorks = [
    { icon: '♥', title: 'Save places', body: 'Tap the heart on spots you want to visit.' },
    { icon: '1', title: 'Get a pass', body: 'One pass unlocks WhatsApp and member deals.' },
    { icon: '✦', title: 'Support local', body: 'You book with them direct — we never take the booking.' },
  ];

  return (
    <div className="relative h-full w-full overflow-hidden">
      <img
        src={WELCOME_HERO}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        draggable={false}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-black/35" />

      <div className="relative z-10 h-full flex flex-col px-6 pt-[max(3.5rem,calc(env(safe-area-inset-top)+2.5rem))] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full">
          <div className="text-center">
            <div className="w-[4.5rem] h-[4.5rem] mx-auto rounded-2xl overflow-hidden shadow-2xl shadow-black/40 ring-2 ring-white/25 mb-4 bg-white">
              <img
                src={APP_ICON}
                alt=""
                className="w-full h-full object-cover"
                onError={(e) => {
                  const el = e.currentTarget;
                  el.style.display = 'none';
                  const parent = el.parentElement;
                  if (parent) {
                    parent.classList.add(
                      'bg-gradient-to-br',
                      'from-teal-500',
                      'to-emerald-600',
                      'flex',
                      'items-center',
                      'justify-center',
                    );
                    parent.innerHTML = '<span class="text-white text-2xl font-bold">S</span>';
                  }
                }}
              />
            </div>
            <p className="text-2xl font-bold text-white tracking-tight drop-shadow-md">StikmNek</p>
            <h1 className="mt-4 text-[28px] font-bold leading-tight text-white drop-shadow-md">
              Plan your trip. Support local.
            </h1>
            <p className="mt-3 text-[15px] text-neutral-200 leading-relaxed">
              Build your trip by tapping ♥. Your pass helps grassroots Vanuatu businesses thrive.
            </p>
          </div>

          <div className="mt-7 space-y-2.5">
            {howItWorks.map((step) => (
              <div
                key={step.title}
                className="flex items-start gap-3 rounded-2xl bg-white/10 border border-white/15 px-3.5 py-3 backdrop-blur-sm"
              >
                <span className="w-8 h-8 shrink-0 rounded-full bg-[#0FB5B5]/25 text-[#0FB5B5] flex items-center justify-center text-sm font-bold">
                  {step.icon}
                </span>
                <div className="min-w-0 pt-0.5">
                  <p className="text-sm font-semibold text-white leading-tight">{step.title}</p>
                  <p className="mt-0.5 text-[13px] text-neutral-300 leading-snug">{step.body}</p>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={onStart}
            className="mt-7 w-full min-h-12 rounded-2xl bg-[#0FB5B5] hover:bg-[#0da3a3] text-white font-bold text-base shadow-lg shadow-black/30 active:scale-[0.98] transition-transform"
          >
            Start exploring
          </button>
          <p className="mt-3 text-center text-[14px] leading-snug text-[#A3A3A3]">{dealsMeta}</p>
        </div>

        <button
          type="button"
          onClick={onPartnerSignIn}
          className="mt-4 text-center text-[13px] text-white/45 hover:text-white/70 underline-offset-2 hover:underline"
        >
          Business login
        </button>
      </div>
    </div>
  );
}

function EndCard({
  hasPass,
  savedCount,
  passLabel,
  onBrowseAgain,
  onGetPass,
}: {
  hasPass: boolean;
  savedCount: number;
  passLabel: string;
  onBrowseAgain: () => void;
  onGetPass: () => void;
}) {
  return (
    <div className="relative h-full w-full overflow-hidden">
      <img
        src={WELCOME_HERO}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        draggable={false}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-teal-950/50" />

      <div className="relative z-10 h-full flex flex-col justify-end px-6 pb-28">
        <div className="max-w-sm mx-auto w-full space-y-5 text-center">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-xl ring-2 ring-white/30 bg-white">
              <img
                src={APP_ICON}
                alt="StikmNek"
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
          </div>
          <div>
            <p className="text-teal-300 text-xs font-semibold uppercase tracking-wide mb-2">You’ve reached the end</p>
            <h2 className="text-[26px] font-bold text-white leading-tight">
              That’s all the places — for now
            </h2>
            <p className="mt-2.5 text-sm text-neutral-200 leading-relaxed">
              Swipe up to shuffle and browse again
              {savedCount > 0 ? ` · ${savedCount} saved to Your Trip` : ''}.
            </p>
          </div>

          {!hasPass && (
            <div className="rounded-2xl bg-teal-600/90 px-4 py-3.5 text-left">
              <p className="text-sm font-bold text-white">Don’t forget your pass</p>
              <p className="mt-1 text-xs text-teal-50 leading-snug">
                A pass unlocks WhatsApp so you can message these places and lock in dates.
              </p>
              <button
                type="button"
                onClick={onGetPass}
                className="mt-3 w-full min-h-11 rounded-xl bg-white text-teal-800 text-sm font-bold active:scale-[0.98] transition-transform"
              >
                {passLabel}
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={onBrowseAgain}
            className="w-full min-h-12 rounded-2xl bg-white/15 backdrop-blur border border-white/25 text-white font-bold text-sm active:scale-[0.98] transition-transform"
          >
            Shuffle &amp; browse again
          </button>
          <p className="text-[11px] text-white/55">Or swipe up to continue</p>
        </div>
      </div>
    </div>
  );
}

function PlaceCard({
  business,
  saved,
  reviewCount,
  rating,
  showTapCoach,
  onDismissCoach,
  floatHint,
  onDismissFloatHint,
  onHeart,
  onOpen,
  onReviews,
  onNext,
}: {
  business: Business;
  saved: boolean;
  reviewCount: number;
  rating: number;
  showTapCoach: boolean;
  onDismissCoach: () => void;
  floatHint: 'swipe' | 'heart' | null;
  onDismissFloatHint: (which: 0 | 1) => void;
  onHeart: () => void;
  onOpen: () => void;
  onReviews: () => void;
  onNext: () => void;
}) {
  useEffect(() => {
    if (!floatHint) return;
    const which: 0 | 1 = floatHint === 'swipe' ? 0 : 1;
    const t = window.setTimeout(() => onDismissFloatHint(which), 3000);
    return () => window.clearTimeout(t);
  }, [floatHint, onDismissFloatHint]);

  const floatHintText =
    floatHint === 'swipe'
      ? 'Swipe up for the next place'
      : floatHint === 'heart'
        ? 'Tap ♥ to save this place'
        : null;

  return (
    <div className="relative h-full w-full">
      <button
        type="button"
        className="absolute inset-0 w-full h-full"
        onClick={onOpen}
        aria-label={`Open ${business.name}`}
      >
        <FitPhoto src={business.image} className="absolute inset-0 h-full w-full" />
        <div className="absolute inset-0 z-[2] bg-gradient-to-t from-black/85 via-black/15 to-black/35" />
      </button>

      {floatHintText && (
        <div className="absolute top-[max(4.5rem,calc(env(safe-area-inset-top)+3.5rem))] inset-x-0 z-20 flex justify-center px-6 pointer-events-none">
          <div className="rounded-full bg-black/70 backdrop-blur-md border border-white/20 px-4 py-2.5 shadow-lg">
            <p className="text-sm font-semibold text-white text-center leading-snug">{floatHintText}</p>
          </div>
        </div>
      )}

      <div className="absolute bottom-24 left-4 right-24 z-10">
        <button type="button" onClick={onOpen} className="text-left pointer-events-auto group">
          <h2
            className={`text-[20px] font-bold leading-tight drop-shadow-md underline decoration-white/40 underline-offset-4 group-active:decoration-teal-400 ${
              showTapCoach ? 'ring-2 ring-teal-400/80 ring-offset-2 ring-offset-transparent rounded-sm' : ''
            }`}
          >
            {business.name}
          </h2>
        </button>
        <span className="inline-block mt-2 rounded-md bg-teal-600 text-white text-xs font-semibold px-2.5 py-1 pointer-events-none">
          {dealPillText(business)}
        </span>
        {business.location ? (
          <p className="mt-2 text-xs text-neutral-300 flex items-center gap-1 pointer-events-none">
            <MapPin className="w-3.5 h-3.5" /> {business.location}
          </p>
        ) : null}

        {showTapCoach && (
          <div className="mt-3 pointer-events-auto relative max-w-[14rem]">
            <div className="absolute -top-1.5 left-6 w-3 h-3 bg-white rotate-45" />
            <div className="relative rounded-2xl bg-white text-neutral-900 px-3 py-2.5 shadow-lg">
              <p className="text-xs font-semibold leading-snug">
                Tap the name to see photos &amp; more about this place
              </p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDismissCoach();
                }}
                className="mt-1.5 text-[11px] font-bold text-teal-700"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="absolute bottom-24 right-4 z-10 flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onHeart();
          }}
          className={`w-16 h-16 rounded-full bg-black/35 backdrop-blur flex items-center justify-center border border-white/20 active:scale-95 transition-transform ${
            floatHint === 'heart' ? 'ring-2 ring-[#0FB5B5] ring-offset-2 ring-offset-transparent' : ''
          }`}
          aria-label={saved ? 'Remove from trip' : 'Save to trip'}
        >
          <Heart className={`w-8 h-8 ${saved ? 'fill-teal-500 text-teal-500' : 'text-white'}`} />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onReviews();
          }}
          className="flex flex-col items-center gap-0.5 active:scale-95 transition-transform"
          aria-label={`Reviews for ${business.name}`}
        >
          <span className="w-12 h-12 rounded-full bg-black/35 backdrop-blur flex items-center justify-center border border-white/20">
            <Star className="w-5 h-5 text-amber-300 fill-amber-300" />
          </span>
          <span className="text-[10px] font-semibold text-white/90 drop-shadow">
            {rating > 0 ? rating.toFixed(1) : 'Reviews'}
            {reviewCount > 0 ? ` · ${reviewCount}` : ''}
          </span>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNext();
          }}
          className="text-[11px] text-neutral-300 font-medium px-2 py-1 rounded-full bg-black/30"
        >
          Next ↑
        </button>
      </div>
    </div>
  );
}

function VibeShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center px-6 bg-gradient-to-b from-neutral-900 to-neutral-950">
      <h2 className="text-2xl font-bold text-center mb-2">{title}</h2>
      <p className="text-neutral-400 text-center text-sm mb-8 max-w-xs">{subtitle}</p>
      <div className="w-full max-w-sm flex flex-col gap-3">{children}</div>
    </div>
  );
}

function VibeButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full min-h-14 rounded-2xl bg-teal-600 hover:bg-teal-500 text-white text-base font-semibold px-4 transition-colors active:scale-[0.98]"
    >
      {children}
    </button>
  );
}

function DetailSheet({
  business,
  saved,
  hasPass,
  paidPeople,
  pricePreview,
  isExtended,
  reviewCount,
  rating,
  onClose,
  onHeart,
  onGetPass,
  onMessage,
  onCall,
  onReviews,
}: {
  business: Business;
  saved: boolean;
  hasPass: boolean;
  paidPeople: number;
  pricePreview: number;
  isExtended: boolean;
  reviewCount: number;
  rating: number;
  onClose: () => void;
  onHeart: () => void;
  onGetPass: () => void;
  onMessage: () => void;
  onCall: () => void;
  onReviews: () => void;
}) {
  const hasWa = businessListingHasWhatsApp(business);
  const price = customerFacingListPrice(business);
  const fullText = plainDescription(business);
  const [expanded, setExpanded] = useState(false);
  const [showMorePricing, setShowMorePricing] = useState(false);
  const [gallery, setGallery] = useState<string[]>(() => (business.image ? [business.image] : []));
  const [photoIdx, setPhotoIdx] = useState(0);
  const needsReadMore = fullText.split(' ').length > 28;

  const pricingTiers = useMemo(() => {
    const o = primaryEmbeddedOffering(business);
    const raw =
      business.pricingTiers ??
      (business as { pricing_tiers?: unknown }).pricing_tiers ??
      o?.pricing_tiers ??
      (o as { tier_pricing?: unknown } | null)?.tier_pricing;
    return pricingTiersForDisplay(raw).filter(
      (t) => (Number(t.deal_price_vt) || 0) > 0 || (Number(t.original_price_vt) || 0) > 0,
    );
  }, [business]);

  const hasTierPricing = pricingTiers.length >= 2;

  useEffect(() => {
    let cancelled = false;
    setPhotoIdx(0);
    setExpanded(false);
    setShowMorePricing(false);
    setGallery(business.image ? [business.image] : []);
    const pid = profileBusinessIdFor(business);
    void (async () => {
      try {
        const rows = await fetchApprovedPhotosForOffering(supabase, pid, business.id, SUPABASE_URL);
        if (cancelled) return;
        const urls = rows
          .map((p) => getPhotoDisplayUrl(p, SUPABASE_URL) || String(p.url || '').trim())
          .filter(Boolean);
        if (urls.length === 0) return;
        const cover = business.image?.trim();
        const ordered = cover && !urls.includes(cover) ? [cover, ...urls] : urls;
        setGallery(ordered);
      } catch {
        /* keep cover */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [business]);

  const blurb = !fullText
    ? oneLiner(business)
    : expanded || !needsReadMore
      ? fullText
      : `${fullText.split(' ').slice(0, 28).join(' ')}…`;

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-neutral-950 animate-in slide-in-from-bottom duration-200">
      <div className="flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
        <button type="button" onClick={onClose} className="p-2 rounded-full bg-white/10" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
        <button type="button" onClick={onHeart} className="p-2 rounded-full bg-white/10" aria-label="Save">
          <Heart className={`w-5 h-5 ${saved ? 'fill-teal-500 text-teal-500' : ''}`} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain touch-pan-y">
        <div className="relative h-[42vh] bg-neutral-900">
          {gallery[photoIdx] ? (
            <FitPhoto src={gallery[photoIdx]!} className="absolute inset-0 h-full w-full" />
          ) : null}
          {gallery.length > 1 && (
            <>
              <div className="absolute inset-y-0 left-0 z-[3] w-1/3" onClick={() => setPhotoIdx((i) => Math.max(0, i - 1))} />
              <div
                className="absolute inset-y-0 right-0 z-[3] w-1/3"
                onClick={() => setPhotoIdx((i) => Math.min(gallery.length - 1, i + 1))}
              />
              <div className="absolute bottom-3 inset-x-0 z-[3] flex justify-center gap-1.5">
                {gallery.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-label={`Photo ${i + 1}`}
                    onClick={() => setPhotoIdx(i)}
                    className={`h-1.5 rounded-full transition-all ${i === photoIdx ? 'w-4 bg-white' : 'w-1.5 bg-white/40'}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {gallery.length > 1 && (
          <div className="flex gap-2 overflow-x-auto px-4 py-3">
            {gallery.map((src, i) => (
              <button
                key={`${src}-${i}`}
                type="button"
                onClick={() => setPhotoIdx(i)}
                className={`shrink-0 w-16 h-16 rounded-lg overflow-hidden ring-2 ${
                  i === photoIdx ? 'ring-teal-500' : 'ring-transparent'
                }`}
              >
                <FitPhoto src={src} className="h-full w-full" />
              </button>
            ))}
          </div>
        )}

        <div className="px-4 py-4 space-y-4 pb-[11.5rem]">
          <div>
            <h2 className="text-2xl font-bold">{business.name}</h2>
            <span className="inline-block mt-2 rounded-md bg-teal-600 text-xs font-semibold px-2.5 py-1">
              {dealPillText(business)}
            </span>
            <p className="mt-3 text-neutral-300 text-base leading-relaxed">{blurb}</p>
            {needsReadMore && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="mt-2 mb-2 text-sm font-semibold text-teal-400"
              >
                {expanded ? 'Show less' : 'Read more'}
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-neutral-300">
            {price > 0 && <span>💰 {formatVT(price)}{hasTierPricing ? ' from' : ''}</span>}
            {business.location && <span>📍 {business.location}</span>}
          </div>

          <button
            type="button"
            onClick={onReviews}
            className="w-full flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 text-left"
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-white">
              <Star className="w-4 h-4 text-amber-300 fill-amber-300" />
              {rating > 0 ? `${rating.toFixed(1)} rating` : 'Traveler reviews'}
            </span>
            <span className="text-xs text-teal-300 font-semibold">
              {reviewCount > 0 ? `${reviewCount} review${reviewCount === 1 ? '' : 's'} →` : 'See reviews →'}
            </span>
          </button>

          {hasTierPricing && (
            <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowMorePricing((v) => !v)}
                className="w-full flex items-center justify-between px-3.5 py-3 text-left"
              >
                <span className="text-sm font-semibold text-teal-300">
                  {showMorePricing ? 'Hide pricing' : 'More pricing'}
                </span>
                <span className="text-xs text-neutral-400">
                  {showMorePricing ? '▲' : '▼'} Adults, kids &amp; more
                </span>
              </button>
              {showMorePricing && (
                <ul className="border-t border-white/10 divide-y divide-white/10">
                  {pricingTiers.map((tier, i) => {
                    const orig = Number(tier.original_price_vt) || 0;
                    const deal = Number(tier.deal_price_vt) || 0;
                    const showDeal = deal > 0 && (orig <= 0 || deal < orig);
                    const showOrig = orig > 0;
                    if (!showDeal && !showOrig) return null;
                    return (
                      <li key={`${tier.label}-${i}`} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm">
                        <span className="text-neutral-200 font-medium">{tier.label || `Option ${i + 1}`}</span>
                        <span className="tabular-nums text-right">
                          {showOrig && showDeal ? (
                            <>
                              <span className="text-neutral-500 line-through mr-2">{formatVT(orig)}</span>
                              <span className="text-teal-300 font-semibold">{formatVT(deal)}</span>
                            </>
                          ) : (
                            <span className="text-teal-300 font-semibold">
                              {formatVT(showDeal ? deal : orig)}
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="absolute bottom-0 inset-x-0 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-neutral-950/95 border-t border-white/10 space-y-2">
        {!hasPass ? (
          <>
            <button
              type="button"
              onClick={onGetPass}
              className="w-full min-h-12 rounded-xl bg-teal-600 font-bold text-sm"
            >
              {passCtaLabel(isExtended, paidPeople, pricePreview)}
            </button>
            <p className="text-center text-[11px] text-neutral-500">Message direct + unlock deals</p>
            <button
              type="button"
              disabled
              className="w-full min-h-11 rounded-xl bg-neutral-800 text-neutral-500 text-sm font-semibold cursor-not-allowed"
            >
              Message on WhatsApp
            </button>
          </>
        ) : (
          <>
            {hasWa && (
              <button
                type="button"
                onClick={onMessage}
                className="w-full min-h-12 rounded-xl bg-[#25D366] text-white font-bold text-sm flex items-center justify-center gap-2"
              >
                <MessageCircle className="w-5 h-5" /> Message on WhatsApp
              </button>
            )}
            {business.phone && (
              <button
                type="button"
                onClick={onCall}
                className="w-full min-h-11 rounded-xl border border-teal-600 text-teal-400 font-semibold text-sm flex items-center justify-center gap-2"
              >
                <Phone className="w-4 h-4" /> Call
              </button>
            )}
            <p className="text-center text-[11px] text-neutral-500">
              Show your QR for the passholder price. StikmNek doesn’t take bookings.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function SearchSheet({
  query,
  onQueryChange,
  results,
  onClose,
  onSelect,
  onBrowseList,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  results: Business[];
  onClose: () => void;
  onSelect: (b: Business) => void;
  onBrowseList: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div className="absolute inset-0 z-[60] flex flex-col bg-black/70" onClick={onClose}>
      <div
        className="pt-[max(0.75rem,env(safe-area-inset-top))] px-3 pb-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 rounded-2xl bg-neutral-900 border border-white/15 px-3 py-2.5 shadow-xl">
          <Search className="w-4 h-4 text-neutral-400 shrink-0" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search places, areas, deals…"
            className="flex-1 bg-transparent text-sm text-white placeholder:text-neutral-500 outline-none min-w-0"
            autoComplete="off"
            enterKeyHint="search"
          />
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-semibold text-teal-300 shrink-0 px-1"
          >
            Close
          </button>
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto overscroll-contain touch-pan-y px-3 pb-[max(1rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        {query.trim().length < 2 ? (
          <div className="rounded-2xl bg-neutral-900/90 border border-white/10 px-4 py-5 text-center space-y-3">
            <p className="text-sm text-neutral-300">Type a place, area, or deal</p>
            <button
              type="button"
              onClick={onBrowseList}
              className="text-sm font-semibold text-teal-300"
            >
              Or browse full list →
            </button>
          </div>
        ) : results.length === 0 ? (
          <div className="rounded-2xl bg-neutral-900/90 border border-white/10 px-4 py-8 text-center">
            <p className="text-sm text-neutral-400">No matches for “{query.trim()}”</p>
          </div>
        ) : (
          <ul className="rounded-2xl bg-neutral-900/95 border border-white/10 overflow-hidden divide-y divide-white/10">
            {results.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => onSelect(b)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/5 active:bg-white/10"
                >
                  <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 bg-neutral-800">
                    {b.image ? <FitPhoto src={b.image} className="h-full w-full" /> : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white truncate">{b.name}</p>
                    <p className="text-xs text-neutral-400 truncate">
                      {b.location || b.category}
                      {dealPillText(b) ? ` · ${dealPillText(b)}` : ''}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ReviewsSheet({
  business,
  reviews,
  onClose,
}: {
  business: Business;
  reviews: DBReview[];
  onClose: () => void;
}) {
  const avg =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + Math.min(5, Number(r.rating) || 0), 0) / reviews.length
      : business.rating || 0;

  return (
    <div className="absolute inset-0 z-[60] flex items-end bg-black/60" onClick={onClose}>
      <div
        className="w-full max-h-[78vh] rounded-t-3xl bg-neutral-900 text-white flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-4 pb-3 border-b border-white/10">
          <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-3" />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-lg font-bold truncate">{business.name}</h3>
              <p className="text-sm text-neutral-400 mt-0.5 flex items-center gap-1.5">
                <Star className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
                {avg > 0 ? avg.toFixed(1) : '—'}
                <span className="text-neutral-500">·</span>
                {reviews.length > 0
                  ? `${reviews.length} review${reviews.length === 1 ? '' : 's'}`
                  : 'No reviews yet'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-full bg-white/10 shrink-0"
              aria-label="Close reviews"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain touch-pan-y px-5 py-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-3">
          {reviews.length === 0 ? (
            <p className="text-sm text-neutral-400 text-center py-10">
              No traveler reviews for this place yet.
            </p>
          ) : (
            reviews.slice(0, 20).map((review) => {
              const filled = starCount(Number(review.rating) || 0);
              return (
                <article
                  key={review.id}
                  className="rounded-2xl bg-white/5 border border-white/10 px-3.5 py-3"
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <p className="text-sm font-semibold truncate">{review.user_name || 'Traveler'}</p>
                    <div className="flex items-center gap-0.5 shrink-0">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={`w-3 h-3 ${
                            i < filled ? 'text-amber-300 fill-amber-300' : 'text-neutral-600'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                  {review.comment ? (
                    <p className="text-sm text-neutral-300 leading-relaxed">{review.comment}</p>
                  ) : null}
                  {review.created_at ? (
                    <p className="text-[11px] text-neutral-500 mt-2">
                      {new Date(review.created_at).toLocaleDateString()}
                    </p>
                  ) : null}
                </article>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function PaywallSheet({
  businessName,
  paidPeople,
  isExtended,
  price,
  onClose,
  onBuy,
}: {
  businessName: string;
  paidPeople: number;
  isExtended: boolean;
  price: number;
  onClose: () => void;
  onBuy: () => void;
}) {
  return (
    <div className="absolute inset-0 z-[60] flex items-end bg-black/60" onClick={onClose}>
      <div
        className="w-full rounded-t-3xl bg-neutral-900 px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto" />
        <h3 className="text-lg font-bold text-center">Want to chat with {businessName}?</h3>
        <p className="text-sm text-neutral-400 text-center">
          Get your pass to unlock WhatsApp + deals. You’ll message them direct — we never take bookings.
        </p>
        <button type="button" onClick={onBuy} className="w-full min-h-12 rounded-xl bg-teal-600 font-bold">
          {passCtaLabel(isExtended, paidPeople, price)}
        </button>
        <button type="button" onClick={onClose} className="w-full text-sm text-neutral-400 py-2">
          Maybe later
        </button>
      </div>
    </div>
  );
}
