import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Heart, List, Lock, Map as MapIcon, MapPin, MessageCircle, Phone, Plane, Search, Sparkles, Star, User, X, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useAppContext, type DBReview } from '@/contexts/AppContext';
import PhotoLightbox from '@/components/PhotoLightbox';
import {
  businessListingHasWhatsApp,
  businessListingWhatsAppRaw,
  categories,
  categoryLabelForKey,
  customerFacingListPrice,
  effectiveListingDealPrice,
  effectiveListingOriginalPrice,
  listingHasActiveDiscount,
  listingOfferBadgeText,
  primaryEmbeddedOffering,
  touristFacingOfferings,
  type Business,
} from '@/data/businesses';
import { calculatePassPrice, clampPartySize } from '@/data/pricing';
import { isListingFavorited } from '@/lib/favoritesUi';
import { profileBusinessIdFor } from '@/lib/businessOfferingMap';
import { buildBookingInquiryWhatsAppUrl } from '@/lib/bookingInquiry';
import { digitsForWaMe, formatVT, getPhotoDisplayUrl } from '@/lib/utils';
import { fetchApprovedPhotosForOffering } from '@/lib/fetchApprovedPhotosForOffering';
import { pricingTiersForDisplay } from '@/lib/pricingTiers';
import { averageStarRating } from '@/lib/reviewStats';
import {
  estimateTripSavings,
  tripSavingsSummaryLine,
  tripSavingsVsPassLine,
} from '@/lib/tripSavingsEstimate';
import { supabase, SUPABASE_URL } from '@/lib/supabase';
import {
  checkoutFromTrip,
  hasSeenTapHint,
  loadTripState,
  markTapHintSeen,
  saveTripState,
  writePartySizeToStorage,
  type TripLength,
  type TripState,
} from '@/lib/tripStorage';
import { APP_ICON_192 } from '@/lib/brand';
import { CATEGORY_ICONS, categoryLabel, type HomeCategoryKey } from '@/components/HomeCategoryPills';
import DealOgHelmet from '@/components/DealOgHelmet';
import ShareButton from '@/components/ShareButton';
import { loadMapView, prefetchChunk } from '@/lib/heavyChunks';

const LazyMapView = React.lazy(() => import('./MapView'));

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

type TipStep = {
  id: string;
  title: string;
  body: string;
  icon: string;
  /** Insert this tip after this many place cards in the feed. */
  afterPlaces: number;
  variant?: 'info' | 'party' | 'length' | 'qr';
};
/** Short how-to tips inserted between places — calm copy, no promo art. */
const FEED_TIP_STEPS: TipStep[] = [
  {
    id: 'local',
    title: 'Grassroots & Family-Run',
    body: 'Every spot on StikmNek is 100% local — from hidden beach cafes to island guides. Your visit directly supports local families.',
    icon: '🌱',
    afterPlaces: 2,
  },
  {
    id: 'save',
    title: 'Build Your Itinerary',
    body: 'Love a spot? Tap the heart to save it for easy comparing later.',
    icon: '♥',
    afterPlaces: 4,
  },
  {
    id: 'pass',
    title: 'One Holiday Pass. Big savings.',
    body: 'Get a Holiday Pass for 7 days. Show your visual Pass at partners — save up to 35%. Kids under 6 free.',
    icon: '🌴',
    afterPlaces: 6,
    variant: 'info',
  },
  {
    id: 'length',
    title: 'How long are you staying?',
    body: 'Just so we can point you at the right pass later — a day trip, or a longer stay.',
    icon: '📅',
    afterPlaces: 8,
    variant: 'length',
  },
  {
    id: 'party',
    title: "Who's coming?",
    body: 'Anyone 6 and up needs a spot on the pass. Kids 5 and under come free.',
    icon: '👥',
    afterPlaces: 10,
    variant: 'party',
  },
  {
    id: 'whatsapp',
    title: 'Book Direct, Zero Fees',
    body: 'No middleman markups. Use your pass to contact operators directly on WhatsApp to lock in your dates.',
    icon: '💬',
    afterPlaces: 13,
  },
];

const SOFT_NUDGE_HEART_THRESHOLD = 3;

const LENGTH_OPTIONS: { id: TripLength; label: string }[] = [
  { id: 'day', label: 'Day trip' },
  { id: '2-4', label: '2–4 days' },
  { id: '5-7', label: '5–7 days' },
];

type FeedItem =
  | { kind: 'welcome' }
  | { kind: 'end' }
  | { kind: 'place'; business: Business }
  | { kind: 'tip'; tip: TipStep };

/** Original Vanuatu hero (same asset as marketing Hero / CloudFront). Local copy for reliable LCP. */
const WELCOME_HERO_WEBP = '/welcome-hero.webp';
const WELCOME_HERO_JPG = '/welcome-hero.jpg';

const PARTY_OPTIONS: { n: number; label: string }[] = [
  { n: 1, label: 'Just me' },
  { n: 2, label: 'Me + 1' },
  { n: 3, label: 'Me + 2' },
  { n: 4, label: 'Me + 3' },
  { n: 5, label: 'Family 5+' },
];

/** Exact headcounts offered after choosing Family 5+. */
const FAMILY_SIZE_OPTIONS = [5, 6, 7, 8, 10, 12] as const;

const TEXT_SHADOW_SOFT = '0 2px 14px rgba(0,0,0,0.65), 0 1px 3px rgba(0,0,0,0.45)';
const TEXT_SHADOW_STRONG = '0 2px 18px rgba(0,0,0,0.75), 0 1px 4px rgba(0,0,0,0.5)';

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

/** Clear savings copy — show the math so tourists want the pass. */
function passSavingsLabel(origPx: number, dealPx: number): string | null {
  if (!(origPx > 0 && dealPx > 0 && dealPx < origPx)) return null;
  return `Save ${formatVT(origPx - dealPx)}`;
}

function placeKey(b: Business): string {
  return b.id;
}

/** Full photo visible (no crop) + soft blurred fill behind for letterboxing.
 *  Blur layer uses CSS background (same URL as the img) so the browser only
 *  fetches the image once.
 */
function FitPhoto({
  src,
  className = '',
  imgClassName = '',
  priority = false,
}: {
  src: string;
  className?: string;
  imgClassName?: string;
  /** When true, eager-load for the visible card (LCP / first place). */
  priority?: boolean;
}) {
  if (!src) return <div className={`bg-neutral-900 ${className}`} />;
  const safeUrl = src.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return (
    <div className={`relative overflow-hidden bg-neutral-950 ${className}`}>
      <div
        aria-hidden
        className="absolute inset-0 scale-110 bg-cover bg-center blur-2xl opacity-50"
        style={{ backgroundImage: `url("${safeUrl}")` }}
      />
      <img
        src={src}
        alt=""
        draggable={false}
        decoding={priority ? 'sync' : 'async'}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
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
    signOut,
    language,
  } = useAppContext();

  const [trip, setTrip] = useState<TripState>(() => loadTripState());
  const [index, setIndex] = useState(0);
  const [feedCategory, setFeedCategory] = useState<HomeCategoryKey>('all');
  const [isMapMode, setIsMapMode] = useState(false);
  const [detail, setDetail] = useState<Business | null>(null);
  const [paywallBiz, setPaywallBiz] = useState<Business | null>(null);
  const [reviewsBiz, setReviewsBiz] = useState<Business | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  /** Visual drag offset — updated via ref + rAF to avoid re-rendering the feed every touchmove. */
  const [showTapCoach, setShowTapCoach] = useState(() => !hasSeenTapHint());
  const [showSoftNudge, setShowSoftNudge] = useState(false);
  /** Session-only: welcome shows again every fresh visit / page load */
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);
  const [shuffleKey, setShuffleKey] = useState(0);
  const touchStartY = useRef<number | null>(null);
  const dragYRef = useRef(0);
  const dragRafRef = useRef<number | null>(null);
  const feedSurfaceRef = useRef<HTMLDivElement | null>(null);
  const preloaded = useRef<Set<string>>(new Set());
  const lastWheelAt = useRef(0);
  /** Stable random order for this browser visit */
  const shuffleOrderRef = useRef<string[] | null>(null);

  const applyDragVisual = useCallback((y: number) => {
    dragYRef.current = y;
    const el = feedSurfaceRef.current;
    if (el) {
      el.style.transform = `translateY(${y * 0.35}px)`;
      el.style.transition = y === 0 ? 'transform 0.2s ease' : 'none';
    }
  }, []);

  const resetDragVisual = useCallback(() => {
    dragYRef.current = 0;
    applyDragVisual(0);
  }, [applyDragVisual]);

  const hasPass = Boolean(user?.pass && user?.passId);

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

  /** In-memory category filter — never refetches Supabase; preserves shuffle order. */
  const filteredListings = useMemo(() => {
    if (feedCategory === 'all') return listings;
    return listings.filter((b) => b.category === feedCategory);
  }, [listings, feedCategory]);

  const onFeedCategoryChange = useCallback((key: HomeCategoryKey) => {
    setFeedCategory(key);
    setIndex(0);
    resetDragVisual();
    // Skip welcome so the user lands on the first deal of the selected category.
    if (key !== 'all') setWelcomeDismissed(true);
  }, [resetDragVisual]);

  const toggleMapMode = useCallback(() => {
    setIsMapMode((prev) => {
      const next = !prev;
      if (next) prefetchChunk(loadMapView);
      return next;
    });
  }, []);

  const reshuffleFeed = useCallback(() => {
    const base = touristFacingOfferings(dbBusinesses);
    shuffleOrderRef.current = shuffleBusinesses(base).map((b) => b.id);
    setWelcomeDismissed(true);
    setShuffleKey((k) => k + 1);
    setIndex(0);
    resetDragVisual();
  }, [dbBusinesses, resetDragVisual]);

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

  const saveCount = useMemo(() => {
    const ids = new Set(trip.savedPlaceIds);
    for (const b of listings) {
      if (isListingFavorited(favorites, b)) ids.add(b.id);
    }
    return ids.size;
  }, [trip.savedPlaceIds, listings, favorites]);

  // Migrate anonymous trip hearts into cloud favorites once after login.
  useEffect(() => {
    if (!user?.id || !dataLoaded || listings.length === 0) return;
    if (user.type === 'business' || user.type === 'admin' || user.type === 'staff') return;
    const key = `stikmnek_trip_fav_migrated_${user.id}`;
    try {
      if (sessionStorage.getItem(key) === '1') return;
      sessionStorage.setItem(key, '1');
    } catch {
      /* private mode — still attempt once via in-memory guard below */
    }
    const tripState = loadTripState();
    for (const id of tripState.savedPlaceIds) {
      const b = listings.find((row) => row.id === id);
      if (!b) continue;
      if (isListingFavorited(favorites, b)) continue;
      void toggleFavorite(b, { silent: true });
    }
    // favorites intentionally omitted — run once per login session
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.type, dataLoaded, listings, toggleFavorite]);

  const feed: FeedItem[] = useMemo(() => {
    const items: FeedItem[] = [];
    if (!welcomeDismissed) items.push({ kind: 'welcome' });

    let placeCount = 0;
    for (const b of filteredListings) {
      items.push({ kind: 'place', business: b });
      placeCount += 1;
      const tip = FEED_TIP_STEPS.find((t) => t.afterPlaces === placeCount);
      if (tip) items.push({ kind: 'tip', tip });
    }

    if (filteredListings.length > 0) items.push({ kind: 'end' });
    else if (welcomeDismissed) items.push({ kind: 'end' });
    return items;
  }, [filteredListings, welcomeDismissed]);

  const current = feed[Math.min(index, Math.max(0, feed.length - 1))] ?? null;

  const finishWelcome = useCallback(() => {
    setWelcomeDismissed(true);
    setIndex(0);
    resetDragVisual();
  }, [resetDragVisual]);

  const goHome = useCallback(() => {
    setDetail(null);
    setPaywallBiz(null);
    setReviewsBiz(null);
    setSearchOpen(false);
    setSearchQuery('');
    resetDragVisual();
    setFeedCategory('all');
    setIsMapMode(false);
    setWelcomeDismissed(false);
    setIndex(0);
  }, [resetDragVisual]);

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
    resetDragVisual();
    if (current?.kind === 'welcome') {
      finishWelcome();
      return;
    }
    if (current?.kind === 'end') {
      reshuffleFeed();
      return;
    }
    setIndex((i) => Math.min(i + 1, Math.max(0, feed.length - 1)));
  }, [feed.length, current?.kind, finishWelcome, reshuffleFeed, resetDragVisual]);

  const goPrev = useCallback(() => {
    resetDragVisual();
    setIndex((i) => Math.max(0, i - 1));
  }, [resetDragVisual]);

  const heartPlace = useCallback(
    async (b: Business) => {
      const id = placeKey(b);
      const inTrip = trip.savedPlaceIds.includes(id);
      const inFav = user ? isListingFavorited(favorites, b) : false;
      const currentlySaved = inTrip || inFav;
      const tripToastStyle = { background: '#FF6B6B', color: '#fff', border: 'none' } as const;

      if (currentlySaved) {
        if (inTrip) {
          persist({ ...trip, savedPlaceIds: trip.savedPlaceIds.filter((x) => x !== id) });
        }
        toast.success('Removed from Saved', { style: tripToastStyle });
        if (user && inFav) void toggleFavorite(b, { silent: true });
      } else {
        const nextIds = [...trip.savedPlaceIds, id];
        persist({ ...trip, savedPlaceIds: nextIds });
        toast.success('Saved ❤️', {
          style: tripToastStyle,
          action: {
            label: 'Open',
            onClick: () => {
              setCurrentView('my-favorites');
              navigate('/saved');
            },
          },
        });
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          try {
            navigator.vibrate(12);
          } catch {
            /* ignore */
          }
        }
        if (user && !inFav) void toggleFavorite(b, { silent: true });
        if (
          !hasPass &&
          !trip.softNudgeDismissed &&
          nextIds.length >= SOFT_NUDGE_HEART_THRESHOLD
        ) {
          setShowSoftNudge(true);
        }
      }
    },
    [trip, persist, user, favorites, toggleFavorite, hasPass, setCurrentView, navigate],
  );

  const dismissSoftNudge = useCallback(() => {
    setShowSoftNudge(false);
    persist({ ...trip, softNudgeDismissed: true });
  }, [trip, persist]);

  const setTripLengthFromTip = useCallback(
    (len: TripLength) => {
      persist({ ...trip, tripLength: len, vibeTripLengthDone: true });
    },
    [trip, persist],
  );

  const setPartyFromTip = useCallback(
    (n: number) => {
      const size = clampPartySize(n);
      writePartySizeToStorage(size);
      persist({ ...trip, paidPeople: size, vibePartyDone: true });
    },
    [trip, persist],
  );

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
    const next = y - touchStartY.current;
    dragYRef.current = next;
    if (dragRafRef.current != null) return;
    dragRafRef.current = requestAnimationFrame(() => {
      dragRafRef.current = null;
      applyDragVisual(dragYRef.current);
    });
  };
  const onTouchEnd = () => {
    if (dragRafRef.current != null) {
      cancelAnimationFrame(dragRafRef.current);
      dragRafRef.current = null;
    }
    if (touchStartY.current == null) {
      resetDragVisual();
      return;
    }
    const y = dragYRef.current;
    if (y < -56) goNext();
    else if (y > 56) goPrev();
    else resetDragVisual();
    touchStartY.current = null;
  };

  const onWheel = (e: React.WheelEvent) => {
    if (detail || paywallBiz || reviewsBiz || searchOpen) return;
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

  const tripSavingsEstimate = useMemo(
    () => estimateTripSavings(savedBusinesses, trip.paidPeople || 1),
    [savedBusinesses, trip.paidPeople],
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
        resetDragVisual();
      }
      setSearchOpen(false);
      setSearchQuery('');
      setDetail(null);
      setReviewsBiz(null);
      setPaywallBiz(null);
    },
    [feed, resetDragVisual],
  );

  const openListBusiness = useCallback(() => {
    setCurrentView('list-business');
    navigate('/list-your-business');
  }, [navigate, setCurrentView]);

  if (!dataLoaded) {
    return (
      <div
        className="hub-phone-fixed fixed top-0 z-40 bg-neutral-950 flex items-center justify-center"
        style={{ bottom: 'var(--hub-nav-offset, 0px)' }}
      >
        <div className="w-12 h-12 rounded-full border-2 border-teal-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (listings.length === 0) {
    return (
      <div
        className="hub-phone-fixed fixed top-0 z-40 bg-neutral-950 text-white flex flex-col items-center justify-center gap-4 px-6 text-center"
        style={{ bottom: 'var(--hub-nav-offset, 0px)' }}
      >
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
  const lightChrome = isMapMode || current?.kind === 'tip' || current?.kind === 'end';

  return (
    <div
      className="hub-phone-fixed fixed top-0 z-40 bg-neutral-950 text-white overflow-hidden touch-none select-none"
      style={{ bottom: 'var(--hub-nav-offset, 0px)' }}
    >
      {/* Top chrome: branding + sticky category pills (above feed; pointer-events isolated) */}
      <div
        className={`absolute top-0 inset-x-0 z-30 pointer-events-none ${
          lightChrome ? 'bg-gradient-to-b from-[#F4F7F8] via-[#F4F7F8]/90 to-transparent' : 'bg-gradient-to-b from-black/40 via-black/20 to-transparent'
        }`}
      >
        <div
          className="flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-1"
        >
          <div className="pointer-events-auto">
            <button
              type="button"
              onClick={goHome}
              className="text-left rounded-lg active:opacity-80 -ml-1 px-1 py-0.5"
              aria-label="Back to home"
            >
              <p className={`text-sm font-bold tracking-tight ${lightChrome ? 'text-[#0A1F2A]' : 'text-white'}`}>
                StikmNek
              </p>
              <p className={`text-[11px] ${lightChrome ? 'text-[#5A6D7A]' : 'text-neutral-300'}`}>
                Plan your Vanuatu trip
              </p>
            </button>
          </div>
          <div className="pointer-events-auto flex items-center gap-2">
            {saveCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  setCurrentView('my-favorites');
                  navigate('/saved');
                }}
                className={`inline-flex items-center gap-1.5 rounded-full backdrop-blur pl-2.5 pr-3 py-1.5 text-xs font-semibold ${
                  lightChrome
                    ? 'bg-[#0A1F2A]/[0.08] text-[#0A1F2A] ring-1 ring-[#0A1F2A]/10'
                    : 'bg-white/18 text-white ring-1 ring-white/25'
                }`}
                aria-label={saveCount > 0 ? `Open Saved ❤️ ${saveCount}` : 'Open Saved'}
              >
                <Plane className="w-3.5 h-3.5 shrink-0" aria-hidden />
                <span>{saveCount > 0 ? `Saved ❤️ ${saveCount}` : 'Saved'}</span>
                {saveCount > 0 && (
                <span
                  className={`min-w-[1.25rem] rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold leading-none ${
                    lightChrome ? 'bg-teal-600 text-white' : 'bg-[#0FB5B5] text-white'
                  }`}
                >
                  {saveCount}
                </span>
                )}
              </button>
            )}
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className={`rounded-full backdrop-blur w-9 h-9 flex items-center justify-center ${
                lightChrome ? 'bg-[#0A1F2A]/[0.06]' : 'bg-white/15'
              }`}
              aria-label="Search, categories, and map"
            >
              <Search className={`w-4 h-4 ${lightChrome ? 'text-[#0A1F2A]' : 'text-white'}`} />
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

        {/* Active filter chip only — full category grid lives in Search */}
        {!searchOpen && !detail && !paywallBiz && !reviewsBiz && feedCategory !== 'all' && (
          <div className="pointer-events-auto flex items-center gap-2 px-4 pb-2">
            <button
              type="button"
              onClick={() => onFeedCategoryChange('all')}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold ${
                lightChrome
                  ? 'bg-teal-600 text-white'
                  : 'bg-teal-600 text-white shadow-md shadow-teal-900/30'
              }`}
              aria-label={`Clear ${categoryLabel(feedCategory, language)} filter`}
            >
              {CATEGORY_ICONS[feedCategory]}
              <span>{categoryLabel(feedCategory, language)}</span>
              <X className="w-3 h-3 opacity-90" aria-hidden />
            </button>
          </div>
        )}

        {/* Exit map without reopening Search */}
        {isMapMode && !searchOpen && !detail && (
          <div className="pointer-events-none flex justify-end px-4 pb-2">
            <button
              type="button"
              onClick={toggleMapMode}
              className="pointer-events-auto inline-flex h-8 items-center gap-1.5 rounded-full bg-white px-3 text-[11px] font-semibold text-neutral-900 shadow-md ring-1 ring-black/5"
              aria-label="Back to swipe list"
            >
              <List className="h-3.5 w-3.5 shrink-0" aria-hidden />
              List
            </button>
          </div>
        )}
      </div>

      {isMapMode ? (
        <div
          className="absolute inset-0 z-[5] flex flex-col bg-white pt-[5.5rem] touch-auto"
          style={{ paddingBottom: 0 }}
        >
          <Suspense
            fallback={
              <div className="flex flex-1 items-center justify-center bg-neutral-100">
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
              </div>
            }
          >
            <LazyMapView
              embedded
              categoryFilter={feedCategory}
              onSelectBusiness={openDetail}
              sizeBumpKey={isMapMode ? 'open' : 'closed'}
            />
          </Suspense>
        </div>
      ) : (
      <div
        ref={feedSurfaceRef}
        className="absolute inset-0"
        style={{ touchAction: 'pan-y' }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onWheel={onWheel}
      >
        {current?.kind === 'welcome' && (
          <WelcomeCard
            onStart={finishWelcome}
            dealCount={listings.length}
            onListBusiness={openListBusiness}
          />
        )}
        {current?.kind === 'tip' && (
          <TipCard
            tip={current.tip}
            partySize={clampPartySize(trip.paidPeople || 1)}
            tripLength={trip.tripLength}
            onPartySize={setPartyFromTip}
            onTripLength={setTripLengthFromTip}
            onContinue={goNext}
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
            hasPass={hasPass}
            reviewCount={reviewsForBusiness(dbReviews, current.business).length || current.business.reviewCount || 0}
            rating={current.business.rating || 0}
            language={language}
            showTapCoach={showTapCoach && !detail && !paywallBiz && !reviewsBiz && !searchOpen && !showSoftNudge}
            onDismissCoach={dismissTapCoach}
            onHeart={() => void heartPlace(current.business)}
            onOpen={() => openDetail(current.business)}
            onReviews={() => setReviewsBiz(current.business)}
            onNext={goNext}
          />
        )}
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
          language={language}
          feedCategory={feedCategory}
          isMapMode={isMapMode}
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
          onPickCategory={(key) => {
            onFeedCategoryChange(key);
            if (isMapMode) toggleMapMode();
            setSearchOpen(false);
            setSearchQuery('');
          }}
          onToggleMap={() => {
            toggleMapMode();
            setSearchOpen(false);
            setSearchQuery('');
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
          tripCount={saveCount}
          onClose={() => setPaywallBiz(null)}
          onBuy={() => {
            setPaywallBiz(null);
            openCheckout();
          }}
        />
      )}

      {showSoftNudge && !hasPass && (
        <SoftNudgeSheet
          tripCount={Math.max(saveCount, SOFT_NUDGE_HEART_THRESHOLD)}
          paidPeople={clampPartySize(trip.paidPeople || 1)}
          isExtended={isExtended}
          price={pricePreview}
          savingsLine={tripSavingsSummaryLine(tripSavingsEstimate)}
          savingsVsPassLine={tripSavingsVsPassLine(tripSavingsEstimate.totalVt, pricePreview)}
          onDismiss={dismissSoftNudge}
          onBuy={() => {
            dismissSoftNudge();
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
  onListBusiness,
}: {
  onStart: () => void;
  dealCount: number;
  onListBusiness: () => void;
}) {
  const dealsMeta =
    dealCount > 0
      ? `${dealCount} local deals • Free to browse • Swipe up to start`
      : 'Free to browse • Swipe up to start';

  return (
    <div className="relative h-full w-full overflow-hidden">
      <picture className="absolute inset-0 block h-full w-full">
        <source srcSet={WELCOME_HERO_WEBP} type="image/webp" />
        <img
          src={WELCOME_HERO_JPG}
          alt=""
          width={1200}
          height={509}
          fetchPriority="high"
          decoding="async"
          className="h-full w-full object-cover object-center"
          style={{ filter: 'brightness(0.88) saturate(1.08) contrast(1.02)' }}
          draggable={false}
        />
      </picture>
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(4,24,32,0.48) 0%, rgba(4,24,32,0.22) 45%, rgba(4,24,32,0.55) 100%)',
        }}
      />

      <div className="relative z-10 h-full flex flex-col px-6 pt-[max(3.5rem,calc(env(safe-area-inset-top)+2.5rem))] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full text-center">
          <div className="w-[4.5rem] h-[4.5rem] mx-auto rounded-2xl overflow-hidden shadow-xl shadow-black/40 ring-2 ring-white/80 mb-4 bg-white">
            <img
              src={APP_ICON_192}
              alt=""
              width={192}
              height={192}
              decoding="async"
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
          <p className="text-2xl font-bold text-white tracking-tight" style={{ textShadow: TEXT_SHADOW_SOFT }}>
            StikmNek
          </p>
          <h1
            className="mt-4 text-[28px] font-bold leading-tight text-white"
            style={{ textShadow: TEXT_SHADOW_STRONG }}
          >
            Discover Vanuatu. Support Local.
          </h1>
          <p
            className="mt-3 text-[15px] text-white/95 leading-relaxed"
            style={{ textShadow: TEXT_SHADOW_SOFT }}
          >
            Tap ♥ on your favorites. Get a Holiday Pass for member prices across the islands.
          </p>

          <button
            type="button"
            onClick={onStart}
            className="mt-8 w-full min-h-12 rounded-2xl bg-[#0FB5B5] hover:bg-[#0da3a3] text-white font-bold text-base active:scale-[0.98] transition-transform"
            style={{ boxShadow: '0 6px 24px rgba(15,181,181,0.4)' }}
          >
            Start Exploring
          </button>
          <p
            className="mt-3 text-center text-[14px] leading-snug text-white/90"
            style={{ textShadow: TEXT_SHADOW_SOFT }}
          >
            {dealsMeta}
          </p>
        </div>

        <button
          type="button"
          onClick={onListBusiness}
          className="mt-4 text-center text-[13px] font-semibold text-white hover:text-teal-100 underline-offset-2 hover:underline"
          style={{ textShadow: TEXT_SHADOW_SOFT }}
        >
          List your business — free
        </button>
      </div>
    </div>
  );
}

function TipCard({
  tip,
  partySize,
  tripLength,
  onPartySize,
  onTripLength,
  onContinue,
}: {
  tip: TipStep;
  partySize: number;
  tripLength: TripLength | null;
  onPartySize: (n: number) => void;
  onTripLength: (len: TripLength) => void;
  onContinue: () => void;
}) {
  const isParty = tip.variant === 'party';
  const isLength = tip.variant === 'length';

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#F4F7F8]">
      <div className="relative z-10 h-full flex flex-col items-center justify-center px-8 pb-20 pt-16">
        <div className="w-full max-w-[300px] text-center">
          <div
            className={`mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full ring-1 ${
              tip.id === 'save'
                ? 'bg-[#0FB5B5]/10 ring-[#0FB5B5]/25'
                : 'bg-white text-[26px] leading-none ring-[#0A1F2A]/[0.06]'
            }`}
            aria-hidden
          >
            {tip.id === 'save' ? (
              <span className="relative inline-flex h-7 w-7 items-center justify-center">
                <Heart
                  className="h-7 w-7 text-[#0FB5B5]"
                  strokeWidth={2.4}
                  fill="none"
                  aria-hidden
                />
                <Heart
                  className="pointer-events-none absolute inset-0 m-auto h-7 w-7 text-[#0FB5B5] tip-heart-pulse"
                  strokeWidth={0}
                  fill="currentColor"
                  aria-hidden
                />
              </span>
            ) : (
              tip.icon
            )}
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#0FB5B5] mb-2">
            Quick tip
          </p>
          <h2 className="text-[22px] font-bold text-[#0A1F2A] leading-tight">{tip.title}</h2>
          <p className="mt-3 text-[15px] text-[#5A6D7A] leading-relaxed">{tip.body}</p>

          {isLength && (
            <div className="mt-6 flex flex-col gap-2">
              {LENGTH_OPTIONS.map((opt) => {
                const selected = tripLength === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onTripLength(opt.id)}
                    className={`min-h-11 rounded-xl text-sm font-semibold transition-colors ${
                      selected
                        ? 'bg-[#0FB5B5] text-white'
                        : 'bg-white text-[#0A1F2A] ring-1 ring-[#0A1F2A]/[0.08] hover:bg-[#0A1F2A]/[0.03]'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          )}

          {isParty && (
            <div className="mt-6 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {PARTY_OPTIONS.map((opt) => {
                  const isFamily = opt.n === 5;
                  const selected = isFamily ? partySize >= 5 : partySize === opt.n;
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => onPartySize(isFamily && partySize < 5 ? 5 : isFamily ? partySize : opt.n)}
                      className={`min-h-11 rounded-xl text-sm font-semibold transition-colors ${
                        isFamily ? 'col-span-2' : ''
                      } ${
                        selected
                          ? 'bg-[#0FB5B5] text-white'
                          : 'bg-white text-[#0A1F2A] ring-1 ring-[#0A1F2A]/[0.08] hover:bg-[#0A1F2A]/[0.03]'
                      }`}
                    >
                      {isFamily && partySize >= 5 ? `Family · ${partySize}` : opt.label}
                    </button>
                  );
                })}
              </div>

              {partySize >= 5 && (
                <div className="rounded-2xl bg-white ring-1 ring-[#0A1F2A]/[0.06] px-3 py-3">
                  <p className="text-[12px] font-semibold text-[#5A6D7A] mb-2">How many people (ages 6+)?</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {FAMILY_SIZE_OPTIONS.map((n) => {
                      const selected = partySize === n;
                      return (
                        <button
                          key={n}
                          type="button"
                          onClick={() => onPartySize(n)}
                          className={`min-h-11 min-w-11 rounded-full text-sm font-semibold transition-colors ${
                            selected
                              ? 'bg-[#0FB5B5] text-white'
                              : 'bg-[#F4F7F8] text-[#0A1F2A] ring-1 ring-[#0A1F2A]/[0.08] hover:bg-[#0A1F2A]/[0.04]'
                          }`}
                        >
                          {n}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={onContinue}
            className="mt-8 w-full min-h-12 rounded-2xl bg-[#0A1F2A] text-white font-semibold text-[15px] active:scale-[0.98] transition-transform"
          >
            Got it
          </button>
          <p className="mt-3 text-[12px] text-[#8A9BA8]">Or swipe up to continue</p>
        </div>
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
    <div className="relative h-full w-full overflow-hidden bg-[#F4F7F8]">
      <div className="relative z-10 h-full flex flex-col items-center justify-center px-8 pb-24 pt-16">
        <div className="w-full max-w-[300px] text-center space-y-4">
          <div className="mx-auto w-12 h-12 rounded-2xl overflow-hidden ring-1 ring-[#0A1F2A]/[0.08] bg-white">
            <img
              src={APP_ICON_192}
              alt=""
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
          <h2 className="text-[22px] font-bold text-[#0A1F2A] leading-tight">You’ve seen the best bits</h2>
          <p className="text-[15px] text-[#5A6D7A] leading-relaxed">
            {savedCount > 0
              ? `${savedCount} place${savedCount === 1 ? '' : 's'} saved. Shuffle for more, or message places with a Holiday Pass.`
              : 'Swipe again anytime — or get a pass to message places direct.'}
          </p>

          {!hasPass && (
            <div className="rounded-2xl bg-white ring-1 ring-[#0A1F2A]/[0.06] px-4 py-3.5 text-left">
              <p className="text-sm font-semibold text-[#0A1F2A]">Need WhatsApp access?</p>
              <p className="mt-1 text-[13px] text-[#5A6D7A] leading-snug">
                A pass lets you message these places and lock in dates.
              </p>
              <button
                type="button"
                onClick={onGetPass}
                className="mt-3 w-full min-h-11 rounded-xl bg-[#0FB5B5] text-white font-semibold text-sm"
              >
                {passLabel}
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={onBrowseAgain}
            className="w-full min-h-12 rounded-2xl bg-[#0A1F2A] text-white font-semibold text-[15px] active:scale-[0.98] transition-transform"
          >
            Shuffle &amp; browse again
          </button>
          <p className="text-[12px] text-[#8A9BA8]">Or swipe up to continue</p>
        </div>
      </div>
    </div>
  );
}

function PlaceCard({
  business,
  saved,
  hasPass,
  reviewCount,
  rating,
  language,
  showTapCoach,
  onDismissCoach,
  onHeart,
  onOpen,
  onReviews,
  onNext,
}: {
  business: Business;
  saved: boolean;
  hasPass: boolean;
  reviewCount: number;
  rating: number;
  language: 'en' | 'fr' | 'bi';
  showTapCoach: boolean;
  onDismissCoach: () => void;
  onHeart: () => void;
  onOpen: () => void;
  onReviews: () => void;
  onNext: () => void;
}) {
  const locationLine = [business.location, categoryLabelForKey(business.category || '', language)]
    .filter(Boolean)
    .join(' · ');

  const viewDealLabel =
    language === 'fr' ? 'Voir l’offre' : language === 'bi' ? 'Luk deal' : 'View Deal';

  const dealPx = effectiveListingDealPrice(business);
  const origPx = effectiveListingOriginalPrice(business);
  const hasDiscount = listingHasActiveDiscount(business);
  const savings = passSavingsLabel(origPx, dealPx);

  return (
    <div className="relative h-full w-full">
      {/* Full-bleed media — tap opens details */}
      <button
        type="button"
        className="absolute inset-0 w-full h-full"
        onClick={onOpen}
        aria-label={`Open ${business.name}`}
      >
        <FitPhoto src={business.image} className="absolute inset-0 h-full w-full" priority />
        {/* Lower ~45–50% continuous dark gradient for white-text legibility */}
        <div
          className="absolute inset-x-0 bottom-0 z-[2] h-[48%] pointer-events-none bg-gradient-to-t from-black/90 via-black/40 to-transparent"
          aria-hidden
        />
      </button>

      {/* Bottom-right interaction stack (Heart → Reviews) */}
      <div className="pointer-events-auto absolute right-4 bottom-[5.25rem] z-20 flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onHeart();
          }}
          className={`flex h-14 w-14 items-center justify-center rounded-full active:scale-95 transition-transform shadow-lg ${
            saved
              ? 'bg-[#FF6B6B] text-white'
              : 'bg-white/20 text-white backdrop-blur-md ring-2 ring-white/70'
          }`}
          aria-label={saved ? 'Remove from trip' : 'Save to trip'}
          aria-pressed={saved}
        >
          <Heart
            className={`w-7 h-7 ${saved ? 'fill-white text-white' : 'fill-none text-white'}`}
            strokeWidth={2.25}
          />
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
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 backdrop-blur-md ring-1 ring-white/50 shadow-md">
            <Star className="h-[18px] w-[18px] text-amber-300 fill-amber-300" />
          </span>
          <span
            className="max-w-[3.5rem] truncate text-center text-[10px] font-semibold text-white"
            style={{ textShadow: TEXT_SHADOW_SOFT }}
          >
            {rating > 0 ? rating.toFixed(1) : 'Reviews'}
          </span>
        </button>
      </div>

      {/* Typography + CTAs — feed already clears BottomNav via --hub-nav-offset */}
      <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-3 px-4 pt-16 pb-4 pointer-events-none">
        {/* Left info column — leave room for right action stack */}
        <div className="min-w-0 pr-[4.5rem]">
          <button
            type="button"
            onClick={onOpen}
            className={`pointer-events-auto text-left group block w-full ${
              showTapCoach ? 'ring-2 ring-teal-400/80 ring-offset-2 ring-offset-transparent rounded-md' : ''
            }`}
          >
            <h2
              className="line-clamp-2 text-xl sm:text-2xl font-bold leading-tight text-white tracking-tight"
              style={{ textShadow: TEXT_SHADOW_STRONG }}
            >
              {business.name}
            </h2>
          </button>

          {/* Clear savings — show the math so people want a pass */}
          <div className="mt-2 flex flex-col items-start gap-1.5">
            <span
              className="inline-block max-w-full truncate rounded-md bg-emerald-400 px-2.5 py-1 text-xs font-extrabold uppercase tracking-wide text-neutral-950 pointer-events-none border border-white/80"
              style={{ boxShadow: '0 2px 12px rgba(16,185,129,0.45)' }}
            >
              {dealPillText(business)}
            </span>
            {hasDiscount && dealPx > 0 ? (
              <div
                className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg bg-black/45 px-2.5 py-1.5 pointer-events-none"
                style={{ textShadow: TEXT_SHADOW_SOFT }}
              >
                {origPx > dealPx ? (
                  <span className="text-[11px] text-white/70 line-through">{formatVT(origPx)}</span>
                ) : null}
                <span className="text-sm font-bold text-white tabular-nums">{formatVT(dealPx)}</span>
                <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-200">
                  {hasPass ? 'Your member price' : 'Pass price'}
                </span>
                {savings ? (
                  <span className="w-full text-[11px] font-semibold text-amber-200">{savings} with a pass</span>
                ) : null}
              </div>
            ) : null}
          </div>

          {locationLine ? (
            <p
              className="mt-2 text-sm text-white/95 flex items-center gap-1.5 pointer-events-none truncate"
              style={{ textShadow: TEXT_SHADOW_SOFT }}
            >
              <MapPin className="w-3.5 h-3.5 shrink-0 opacity-90" aria-hidden />
              <span className="truncate">{locationLine}</span>
            </p>
          ) : null}

          {showTapCoach && (
            <div className="mt-3 pointer-events-auto relative max-w-[14rem]">
              <div className="absolute -top-1.5 left-6 w-3 h-3 bg-white rotate-45" />
              <div className="relative rounded-2xl bg-white text-neutral-900 px-3 py-2.5 shadow-lg">
                <p className="text-xs font-semibold leading-snug">
                    Tap anywhere on the card to see full photos, pricing & details.
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

        {/* Thumb-zone: View Deal + icon-only Next */}
        <div className="pointer-events-auto flex items-center gap-2 pr-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
            className="flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-[#0FB5B5] px-4 text-sm font-bold text-white shadow-lg shadow-teal-900/30 active:scale-[0.98] transition-transform"
          >
            {viewDealLabel}
            <ChevronRight className="w-4 h-4 shrink-0 opacity-90" aria-hidden />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onNext();
            }}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20 text-lg font-bold leading-none text-white backdrop-blur-md ring-1 ring-white/40 active:scale-95 transition-transform"
            aria-label="Next place"
          >
            ↑
          </button>
        </div>
      </div>
    </div>
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
  const dealPx = effectiveListingDealPrice(business);
  const origPx = effectiveListingOriginalPrice(business);
  const hasDiscount = listingHasActiveDiscount(business);
  const savings = passSavingsLabel(origPx, dealPx);
  const fullText = plainDescription(business);
  const [expanded, setExpanded] = useState(false);
  const [showMorePricing, setShowMorePricing] = useState(false);
  const [gallery, setGallery] = useState<string[]>(() => (business.image ? [business.image] : []));
  const [photoIdx, setPhotoIdx] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
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
    setLightboxOpen(false);
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
      <DealOgHelmet business={business} imageUrl={gallery[photoIdx] || business.image} />
      <PhotoLightbox
        open={lightboxOpen}
        photos={gallery}
        index={photoIdx}
        onIndexChange={setPhotoIdx}
        onClose={() => setLightboxOpen(false)}
        altPrefix={business.name}
      />
      {/* Scroll area + footer in flow so reviews aren’t trapped under the CTA overlay */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y">
        <div className="relative h-[min(42vh,20rem)] bg-neutral-900">
          {gallery[photoIdx] ? (
            <button
              type="button"
              className="absolute inset-0 h-full w-full text-left"
              onClick={() => setLightboxOpen(true)}
              aria-label="View photos full screen"
            >
              <FitPhoto src={gallery[photoIdx]!} className="absolute inset-0 h-full w-full" />
            </button>
          ) : null}

          {/* Top scrim so controls stay readable on dark photos / letterboxing */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0 z-[4] h-28 bg-gradient-to-b from-black/70 via-black/35 to-transparent"
            aria-hidden
          />

          {/* Back + share/heart overlaid on the hero — high-contrast pills */}
          <div className="absolute inset-x-0 top-0 z-[5] flex items-center justify-between gap-3 px-3 pt-[max(0.65rem,env(safe-area-inset-top))] pb-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 min-h-11 rounded-full bg-white px-3.5 py-2 text-sm font-bold text-neutral-900 shadow-lg ring-1 ring-black/10 active:scale-[0.98]"
              aria-label="Back to feed"
            >
              <ChevronRight className="w-5 h-5 rotate-180 shrink-0" aria-hidden />
              Back
            </button>
            <div className="flex items-center gap-2">
              <ShareButton
                business={business}
                discountText={dealPillText(business)}
                variant="icon-light"
                className="!bg-white !text-neutral-900 shadow-lg ring-1 ring-black/10 min-h-11 min-w-11"
              />
              <button
                type="button"
                onClick={onHeart}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-lg ring-1 ring-black/10 active:scale-[0.98]"
                aria-label={saved ? 'Remove from trip' : 'Save to trip'}
              >
                <Heart
                  className={`w-5 h-5 ${
                    saved ? 'fill-[#FF6B6B] text-[#FF6B6B]' : 'text-neutral-900'
                  }`}
                />
              </button>
            </div>
          </div>

          {gallery.length > 1 && (
            <div className="pointer-events-none absolute bottom-3 inset-x-0 z-[3] flex justify-center gap-1.5">
              {gallery.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${i === photoIdx ? 'w-4 bg-white' : 'w-1.5 bg-white/40'}`}
                />
              ))}
            </div>
          )}

          {gallery.length > 0 && (
            <p className="pointer-events-none absolute bottom-8 inset-x-0 z-[3] text-center text-[11px] font-medium text-white/70">
              Tap photo for full screen
            </p>
          )}
        </div>

        {gallery.length > 1 && (
          <div className="flex gap-2 overflow-x-auto px-4 py-3">
            {gallery.map((src, i) => (
              <button
                key={`${src}-${i}`}
                type="button"
                onClick={() => {
                  setPhotoIdx(i);
                  setLightboxOpen(true);
                }}
                className={`shrink-0 w-16 h-16 rounded-lg overflow-hidden ring-2 ${
                  i === photoIdx ? 'ring-teal-500' : 'ring-transparent'
                }`}
                aria-label={`Open photo ${i + 1} full screen`}
              >
                <FitPhoto src={src} className="h-full w-full" />
              </button>
            ))}
          </div>
        )}

        <div className="px-4 py-4 space-y-4 pb-6">
          <div>
            <h2 className="text-2xl font-bold">{business.name}</h2>
            <span className="inline-block mt-2 rounded-md bg-teal-600 text-xs font-semibold px-2.5 py-1">
              {dealPillText(business)}
            </span>
            {hasDiscount && dealPx > 0 ? (
              <div className="mt-2 space-y-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
                  {origPx > dealPx ? (
                    <span className="text-neutral-500 line-through">{formatVT(origPx)}</span>
                  ) : null}
                  <span className="font-bold tabular-nums text-white text-base">{formatVT(dealPx)}</span>
                  <span className="text-teal-300 text-xs font-semibold">
                    {hasPass ? 'Your member price' : 'Pass price'}
                  </span>
                </div>
                {savings ? (
                  <p className="text-sm font-semibold text-amber-300">
                    {savings} here with a StikmNek pass
                    {!hasPass ? ' — use it when you message or check in' : ''}
                  </p>
                ) : null}
              </div>
            ) : null}
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
            {hasDiscount && origPx > 0 && dealPx > 0 ? (
              <span>
                💰 {formatVT(origPx)} → <span className="text-teal-300 font-semibold">{formatVT(dealPx)}</span>
                {hasTierPricing ? ' from' : ''}
                {savings ? ` · ${savings}` : ''}
              </span>
            ) : price > 0 ? (
              <span>
                💰 {formatVT(price)}
                {hasTierPricing ? ' from' : ''}
              </span>
            ) : null}
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
                  {showMorePricing ? '▲' : '▼'} Adults, kids &amp; pass savings
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
                    const tierSave = passSavingsLabel(orig, deal);
                    return (
                      <li key={`${tier.label}-${i}`} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm">
                        <span className="text-neutral-200 font-medium min-w-0">
                          {tier.label || `Option ${i + 1}`}
                          {tierSave ? (
                            <span className="block text-[11px] font-semibold text-amber-300/90">{tierSave}</span>
                          ) : null}
                        </span>
                        <span className="tabular-nums text-right shrink-0">
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
              {!hasPass && hasDiscount ? (
                <button
                  type="button"
                  onClick={onGetPass}
                  className="w-full border-t border-white/10 px-3.5 py-3 text-left text-xs font-bold text-teal-300 hover:bg-white/5"
                >
                  Get a pass to WhatsApp this place at the member rate →
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-white/10 bg-neutral-950 px-3 pt-2.5 pb-[max(0.65rem,env(safe-area-inset-bottom))] space-y-2">
        {!hasPass ? (
          <>
            <button
              type="button"
              onClick={onGetPass}
              className="w-full min-h-11 rounded-xl bg-[#0FB5B5] font-bold text-sm text-white"
              style={{ boxShadow: '0 4px 16px rgba(15,181,181,0.3)' }}
            >
              {passCtaLabel(isExtended, paidPeople, pricePreview)}
            </button>
            <p className="text-center text-[11px] text-neutral-500 px-2">
              Sign in, set up your profile, then get your Holiday Pass — message places after that.
            </p>
          </>
        ) : (
          <>
            <div className="flex gap-2">
              {hasWa && (
                <button
                  type="button"
                  onClick={onMessage}
                  className="flex-1 min-h-11 rounded-xl bg-[#25D366] text-white font-bold text-sm flex items-center justify-center gap-2"
                >
                  <MessageCircle className="w-4 h-4" /> WhatsApp
                </button>
              )}
              {business.phone && (
                <button
                  type="button"
                  onClick={onCall}
                  className="flex-1 min-h-11 rounded-xl border border-teal-600 text-teal-400 font-semibold text-sm flex items-center justify-center gap-2"
                >
                  <Phone className="w-4 h-4" /> Call
                </button>
              )}
            </div>
            <p className="text-center text-[11px] text-neutral-500">
              Show your Pass for the member price. StikmNek doesn’t take bookings.
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
  language,
  feedCategory,
  isMapMode,
  onClose,
  onSelect,
  onBrowseList,
  onPickCategory,
  onToggleMap,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  results: Business[];
  language: 'en' | 'fr' | 'bi';
  feedCategory: HomeCategoryKey;
  isMapMode: boolean;
  onClose: () => void;
  onSelect: (b: Business) => void;
  onBrowseList: () => void;
  onPickCategory: (key: HomeCategoryKey) => void;
  onToggleMap: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, []);

  const browseKeys: HomeCategoryKey[] = ['all', ...categories.map((c) => c.key)];
  const mapTileLabel = isMapMode
    ? language === 'fr'
      ? 'Liste'
      : language === 'bi'
        ? 'List'
        : 'List'
    : language === 'fr'
      ? 'Carte'
      : language === 'bi'
        ? 'Map'
        : 'Map';

  return (
    <div className="absolute inset-0 z-[60] flex flex-col bg-black/70" onClick={onClose}>
      <div
        className="pt-[max(0.75rem,env(safe-area-inset-top))] px-3 pb-3 space-y-3"
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

        <div>
          <p className="px-0.5 mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
            Browse
          </p>
          <div className="grid grid-cols-4 gap-2">
            {browseKeys.map((key) => {
              const active = feedCategory === key && !isMapMode;
              const short =
                key === 'transportation'
                  ? language === 'fr'
                    ? 'Transport'
                    : 'Transport'
                  : key === 'accommodation'
                    ? language === 'fr'
                      ? 'Héberg.'
                      : language === 'bi'
                        ? 'Sleep'
                        : 'Stay'
                    : key === 'spa'
                      ? 'Spa'
                      : categoryLabel(key, language);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onPickCategory(key)}
                  className={`flex flex-col items-center justify-center gap-1 rounded-2xl px-1.5 py-2.5 min-h-[4.25rem] transition-colors ${
                    active
                      ? 'bg-teal-600 text-white shadow-md shadow-teal-900/30'
                      : 'bg-neutral-900/95 text-neutral-200 border border-white/10'
                  }`}
                >
                  <span className="[&>svg]:w-4 [&>svg]:h-4">{CATEGORY_ICONS[key]}</span>
                  <span className="text-[10px] font-semibold leading-tight text-center line-clamp-2">
                    {short}
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={onToggleMap}
              className={`flex flex-col items-center justify-center gap-1 rounded-2xl px-1.5 py-2.5 min-h-[4.25rem] transition-colors ${
                isMapMode
                  ? 'bg-teal-600 text-white shadow-md shadow-teal-900/30'
                  : 'bg-neutral-900/95 text-neutral-200 border border-white/10'
              }`}
              aria-pressed={isMapMode}
            >
              {isMapMode ? (
                <List className="w-4 h-4" aria-hidden />
              ) : (
                <MapIcon className="w-4 h-4" aria-hidden />
              )}
              <span className="text-[10px] font-semibold leading-tight text-center">{mapTileLabel}</span>
            </button>
          </div>
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
  const avg = averageStarRating(reviews) ?? (business.rating || 0);
  const superCount = reviews.filter((r) => r.has_super_star).length;

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
              <p className="text-sm text-neutral-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                <Star className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
                {avg > 0 ? avg.toFixed(1) : '—'}
                <span className="text-neutral-500">·</span>
                {reviews.length > 0
                  ? `${reviews.length} review${reviews.length === 1 ? '' : 's'}`
                  : 'No reviews yet'}
                {superCount > 0 && (
                  <>
                    <span className="text-neutral-500">·</span>
                    <span className="inline-flex items-center gap-1 text-purple-300">
                      <Sparkles className="w-3.5 h-3.5" />
                      {superCount} Super Star{superCount === 1 ? '' : 's'}
                    </span>
                  </>
                )}
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
              const isSuper = Boolean(review.has_super_star);
              return (
                <article
                  key={review.id}
                  className={`rounded-2xl bg-white/5 border px-3.5 py-3 ${
                    isSuper ? 'border-purple-400/40' : 'border-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <p className="text-sm font-semibold truncate flex items-center gap-1.5">
                      {review.user_name || 'Traveler'}
                      {isSuper && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-purple-300">
                          <Sparkles className="w-3 h-3" /> Super Star
                        </span>
                      )}
                    </p>
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

function SoftNudgeSheet({
  tripCount,
  paidPeople,
  isExtended,
  price,
  savingsLine,
  savingsVsPassLine: vsPassLine,
  onDismiss,
  onBuy,
}: {
  tripCount: number;
  paidPeople: number;
  isExtended: boolean;
  price: number;
  savingsLine?: string;
  savingsVsPassLine?: string;
  onDismiss: () => void;
  onBuy: () => void;
}) {
  const plan =
    isExtended
      ? `Perfect for ${peopleWord(paidPeople)} · 7 days`
      : `Perfect for ${peopleWord(paidPeople)} · 1 day`;

  return (
    <div className="absolute inset-0 z-[65] flex items-end bg-black/55" onClick={onDismiss}>
      <div
        className="w-full rounded-t-3xl bg-neutral-900 px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto" />
        <h3 className="text-lg font-bold text-center text-white">
          Saved has {tripCount} place{tripCount === 1 ? '' : 's'}
        </h3>
        {savingsLine ? (
          <div className="rounded-xl bg-teal-500/15 border border-teal-400/30 px-3 py-2.5 text-center">
            <p className="text-sm font-semibold text-teal-200 leading-snug">{savingsLine}</p>
            {vsPassLine ? (
              <p className="mt-1 text-xs text-teal-100/70 leading-snug">{vsPassLine}</p>
            ) : null}
          </div>
        ) : null}
        <p className="text-sm text-neutral-400 text-center leading-relaxed">
          Get a Holiday Pass so you can use member prices on every saved spot. {plan}.
        </p>
        <button
          type="button"
          onClick={onBuy}
          className="w-full min-h-12 rounded-xl bg-[#0FB5B5] font-bold text-white border-2 border-white"
          style={{ boxShadow: '0 4px 20px rgba(15,181,181,0.35)' }}
        >
          {passCtaLabel(isExtended, paidPeople, price)}
        </button>
        <button type="button" onClick={onDismiss} className="w-full text-sm text-neutral-400 py-2">
          Keep browsing
        </button>
      </div>
    </div>
  );
}

function PaywallSheet({
  businessName,
  paidPeople,
  isExtended,
  price,
  tripCount = 0,
  onClose,
  onBuy,
}: {
  businessName: string;
  paidPeople: number;
  isExtended: boolean;
  price: number;
  tripCount?: number;
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
        <h3 className="text-lg font-bold text-center text-white">Connect with {businessName}</h3>
        <p className="text-sm text-neutral-400 text-center leading-relaxed">
          Sign in, finish your profile, then claim a free traveler pass (first 25) or pay. You’ll get a visual Pass — then you can WhatsApp {businessName} at the member rate.
          {tripCount > 0
            ? ` Saved already has ${tripCount} place${tripCount === 1 ? '' : 's'}.`
            : ''}
        </p>
        <ul className="text-xs text-neutral-300 space-y-1.5 px-1">
          <li className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-teal-400 shrink-0" /> Keep the pass prices you just saw
          </li>
          <li className="flex items-center gap-2">
            <MessageCircle className="w-3.5 h-3.5 text-teal-400 shrink-0" /> WhatsApp operators directly
          </li>
          <li className="flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-teal-400 shrink-0" /> One visual Pass · show at every partner
          </li>
        </ul>
        <button
          type="button"
          onClick={onBuy}
          className="w-full min-h-12 rounded-xl bg-teal-600 font-bold text-white"
        >
          Sign in & get your pass
        </button>
        <button type="button" onClick={onClose} className="w-full text-sm text-neutral-400 py-2">
          Maybe later
        </button>
      </div>
    </div>
  );
}
