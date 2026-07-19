import React, { Suspense, useEffect, useRef, useState } from 'react';
import { AlertCircle, Store, ArrowRight } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useAppContext, isTouristProfileCompleteForGate } from '@/contexts/AppContext';
import { canAccessAdminPanel } from '@/lib/adminRoles';
import {
  dealSlugFromPathname,
  partnerSlugFromPathname,
  isHubBottomNavView,
  isRoutableAppPath,
  viewFromPathname,
  type ViewMode,
} from '@/utils/viewModes';
import { dealSlugForBusiness, offeringIdFromDealSlug } from '@/lib/dealUrl';
import { businessIdFromPartnerSlug } from '@/lib/businessProfileUrl';
import { fetchOfferingById } from '@/lib/loadListings';
import { supabase, SUPABASE_URL } from '@/lib/supabase';
import LegalDocumentPage from './LegalDocumentPage';
import NotFound from '@/pages/NotFound';

// ── Eagerly-loaded components ──
import Navbar from './Navbar';
import Hero from './Hero';
import HowItWorks from './HowItWorks';
import BusinessGrid from './BusinessGrid';
import PassCards from './PassCards';
import PassesEntryGate from './PassesEntryGate';
import ListYourBusinessCta from './ListYourBusinessCta';
import ForBusinessLanding from './ForBusinessLanding';
import Footer from './Footer';
import AuthModal from './AuthModal';
import CookieConsent from './CookieConsent';
import InstallPrompt from './InstallPrompt';
import ListingsLoadBanner from './ListingsLoadBanner';
import PaymentConfirmation from './PaymentConfirmation';
import FloatingPassButton from './FloatingPassButton';
import BottomNav from './BottomNav';
import LoadingSkeleton from './LoadingSkeleton';
import CompleteTouristProfile from './CompleteTouristProfile';
import CompleteBusinessProfile from './CompleteBusinessProfile';
import SwipeDiscover from './SwipeDiscover';

// ── Lazy-loaded route components ──
const Dashboard = React.lazy(() => import('./Dashboard'));
const MyFavoritesList = React.lazy(() => import('./MyFavoritesList'));
const AdminPanel = React.lazy(() => import('./AdminPanel'));
const PaymentCheckout = React.lazy(() => import('./PaymentCheckout'));
const BusinessOwnerDashboard = React.lazy(() => import('./BusinessOwnerDashboard'));
const HelpCenter = React.lazy(() => import('./HelpCenter'));
const MapView = React.lazy(() => import('./MapView'));
const BusinessDetail = React.lazy(() => import('./BusinessDetail'));
const BusinessProfilePage = React.lazy(() => import('./BusinessProfilePage'));
const BusinessListingForm = React.lazy(() => import('./BusinessListingForm'));

/**
 * Tourists with an incomplete profile may still open these views (soft gate).
 * All other views keep hard redirect to complete-profile until the gate passes.
 * To expand browsing later, add view names here and optionally show a nav link to complete-profile.
 */
const TOURIST_BROWSE_VIEWS_WHILE_INCOMPLETE: ViewMode[] = [
  'home',
  'deals',
  'map',
  'my-favorites',
  'business-detail',
  'business-profile',
  'checkout',
  'payment-confirmation',
  'help',
  'faq',
  'business-guide',
  'business-join',
];

/**
 * Business partners without a `businesses` row yet may leave the setup form and browse
 * the site; we only force `complete-business-profile` when they open the hub or other gated views.
 */
const BUSINESS_BROWSE_VIEWS_WHILE_INCOMPLETE: ViewMode[] = [
  'home',
  'deals',
  'map',
  'passes',
  'business-detail',
  'business-profile',
  'help',
  'faq',
  'business-guide',
  'business-join',
];

function legalSlugFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/legal\/([^/]+)\/?$/);
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * Sign-up gate shown at /business/new when the visitor can't submit yet (not signed in,
 * or signed in as a tourist). Deliberately minimal — one clear "Sign up" action, almost no
 * reading — so first-time businesses aren't put off by a wall of text or a dead-end form.
 */
function BusinessListingSignupGate({ isSignedIn }: { isSignedIn: boolean }) {
  const { language, setShowAuth, setAuthMode } = useAppContext();

  const heading =
    language === 'fr'
      ? 'Ajoutez votre entreprise — gratuit'
      : language === 'bi'
        ? 'Listim bisnis blong yu — fri'
        : 'List your business — free';

  const signUpLabel =
    language === 'fr' ? "S'inscrire gratuitement" : language === 'bi' ? 'Saen up fri' : 'Sign up free';

  return (
    <div className="pt-16 max-w-md mx-auto px-4">
      <div className="rounded-2xl border border-teal-100 bg-white shadow-sm p-6 sm:p-8 text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-md shadow-teal-600/25">
          <Store className="h-7 w-7" aria-hidden />
        </div>
        <h1 className="text-2xl font-black tracking-tight text-gray-900 mb-6">{heading}</h1>

        <button
          type="button"
          onClick={() => {
            setAuthMode('signup-business');
            setShowAuth(true);
          }}
          className="w-full inline-flex items-center justify-center gap-2 px-6 py-4 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-bold text-base shadow-lg shadow-teal-600/30 hover:-translate-y-0.5 transition-transform"
        >
          {signUpLabel}
          <ArrowRight className="w-5 h-5 shrink-0" aria-hidden />
        </button>

        {!isSignedIn && (
          <button
            type="button"
            onClick={() => {
              setAuthMode('signin');
              setShowAuth(true);
            }}
            className="mt-4 text-sm font-semibold text-teal-700 hover:underline underline-offset-2"
          >
            {language === 'en'
              ? 'Already signed up? Sign in'
              : language === 'fr'
                ? 'Déjà inscrit ? Se connecter'
                : 'Gat akaont? Saen in'}
          </button>
        )}
      </div>
    </div>
  );
}

/** Single listing form instance for home + /business/new (dashboard uses the same component in its Submit tab). */
function BusinessListingFormInLayout({ padded }: { padded: boolean }) {
  const { user } = useAppContext();
  // Only signed-in business owners (and admins) can actually submit. Everyone else
  // gets the sign-up gate so /business/new isn't a dead end for brand-new businesses.
  // (Business owners without a profile row are redirected to complete-business-profile elsewhere.)
  const canSubmit = user?.type === 'business' || user?.type === 'admin';
  if (padded && !canSubmit) {
    return <BusinessListingSignupGate isSignedIn={Boolean(user)} />;
  }

  const form = (
    <Suspense
      fallback={
        <div className="min-h-[24rem] flex items-center justify-center rounded-xl border border-gray-100 bg-gray-50/80">
          <LoadingSkeleton />
        </div>
      }
    >
      <BusinessListingForm />
    </Suspense>
  );
  if (padded) {
    return <div className="pt-16 max-w-4xl mx-auto px-4">{form}</div>;
  }
  return form;
}

/** Tourist / anonymous home = swipe discover. Business owners keep marketing home if they land here. */
function HomePage() {
  const { user } = useAppContext();
  if (user?.type === 'business') {
    return (
      <>
        <Hero />
        <HowItWorks />
        <PassCards embeddedOnHome />
        <ListYourBusinessCta />
      </>
    );
  }
  return <SwipeDiscover />;
}

const AppLayout: React.FC = () => {
  const location = useLocation();
  const {
    currentView,
    user,
    userProfile,
    authLoading,
    setCurrentView,
    businessOwnerHasBusinessRow,
    userProfileLoadError,
    retryUserProfileFetch,
    language,
    dbBusinesses,
    dataLoaded,
    selectedBusiness,
    setSelectedBusiness,
  } = useAppContext();
  const prevViewRef = useRef(currentView);
  const [dealNotFound, setDealNotFound] = useState(false);
  const [hostProfileId, setHostProfileId] = useState<string | null>(null);
  const [hostProfileNotFound, setHostProfileNotFound] = useState(false);

  useEffect(() => {
    const p = location.pathname;
    if (p.startsWith('/legal/')) return;
    const next = viewFromPathname(p);
    if (next !== null) {
      setCurrentView(next);
    }
  }, [location.pathname, setCurrentView]);

  // ─── Deep-link resolver for /deal/:slug ───
  // Maps a shared URL back to the right listing: prefer the already-loaded
  // `dbBusinesses`, fall back to a direct fetch for cold loads / not-yet-loaded data.
  useEffect(() => {
    const slug = dealSlugFromPathname(location.pathname);
    if (!slug) {
      setDealNotFound(false);
      return;
    }

    const offId = offeringIdFromDealSlug(slug);

    // Already showing the right deal — nothing to do.
    if (
      selectedBusiness &&
      ((offId && String(selectedBusiness.id) === offId) ||
        dealSlugForBusiness(selectedBusiness) === slug)
    ) {
      setDealNotFound(false);
      return;
    }

    const fromMemory = dbBusinesses.find(
      (b) => (offId && String(b.id) === offId) || dealSlugForBusiness(b) === slug,
    );
    if (fromMemory) {
      setSelectedBusiness(fromMemory);
      setDealNotFound(false);
      return;
    }

    if (!offId) {
      // No resolvable id and not in memory — only a 404 once listings have loaded.
      if (dataLoaded) setDealNotFound(true);
      return;
    }

    let cancelled = false;
    void (async () => {
      const biz = await fetchOfferingById(supabase, SUPABASE_URL, offId);
      if (cancelled) return;
      if (biz) {
        setSelectedBusiness(biz);
        setDealNotFound(false);
      } else {
        setDealNotFound(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // `dealNotFound` is intentionally omitted: it's set here, not read, so including
    // it would re-run the effect and loop on a failed lookup.
  }, [location.pathname, dbBusinesses, dataLoaded, selectedBusiness, setSelectedBusiness]);

  // ─── Deep-link resolver for /partner/:slug (business profile page) ───
  useEffect(() => {
    const slug = partnerSlugFromPathname(location.pathname);
    if (!slug) {
      setHostProfileId(null);
      setHostProfileNotFound(false);
      return;
    }

    const profileId = businessIdFromPartnerSlug(slug);
    if (!profileId) {
      if (dataLoaded) setHostProfileNotFound(true);
      setHostProfileId(null);
      return;
    }

    setHostProfileId(profileId);
    setHostProfileNotFound(false);
  }, [location.pathname, dataLoaded]);

  // ─── Role-based view access control ───
  useEffect(() => {
    if (!user || authLoading) return;

    const role = userProfile?.role || user.type || 'tourist';

    // Prevent tourists from accessing business dashboard
    if (role === 'tourist' && currentView === 'business-dashboard') {
      if (!userProfile) return; // Wait for profile to load
      setCurrentView('dashboard');
      return;
    }

    // Prevent business users from accessing tourist dashboard / favorites
    if (role === 'business' && (currentView === 'dashboard' || currentView === 'my-favorites')) {
      setCurrentView('business-dashboard');
      return;
    }

    // Business onboarding: only redirect off the hub when we *know* there is no `businesses` row (`false`).
    // `null` = lookup failed or in-flight — do not send owners to complete-business-profile (avoids false positives).
    if (
      role === 'business' &&
      currentView === 'business-dashboard' &&
      businessOwnerHasBusinessRow === false
    ) {
      setCurrentView('complete-business-profile');
      return;
    }

    // Only admins and onboarding staff can access admin panel
    if (currentView === 'admin' && !canAccessAdminPanel(role, user.email)) {
      if (!userProfile) return;
      setCurrentView('home');
      return;
    }
  }, [currentView, user, userProfile, authLoading, businessOwnerHasBusinessRow, setCurrentView]);

  // ─── Profile-First gating (Tourists) ───
  useEffect(() => {
    if (!user || authLoading) return;
    const role = userProfile?.role || user.type || 'tourist';
    // Staff and admins are not tourists — skip traveller profile gate.
    if (canAccessAdminPanel(role, user.email)) return;
    if (user.type !== 'tourist') return;
    if (userProfileLoadError) return;
    if (!userProfile) return; // wait for profile load

    const profileDone = isTouristProfileCompleteForGate(userProfile);

    if (!profileDone && currentView !== 'complete-profile') {
      if (TOURIST_BROWSE_VIEWS_WHILE_INCOMPLETE.includes(currentView)) {
        return;
      }
      setCurrentView('complete-profile');
    }
  }, [user, userProfile, authLoading, currentView, setCurrentView, userProfileLoadError]);

  // ─── Profile-First gating (Business owners — businesses.owner_id row) ───
  useEffect(() => {
    if (!user || authLoading) return;
    const role = userProfile?.role || user.type || 'tourist';
    if (role !== 'business') return;
    if (userProfileLoadError) return;
    // Unknown row status: wait for a definitive true/false (do not hard-redirect to profile setup).
    if (businessOwnerHasBusinessRow === null) return;

    if (
      businessOwnerHasBusinessRow === false &&
      currentView !== 'complete-business-profile' &&
      !BUSINESS_BROWSE_VIEWS_WHILE_INCOMPLETE.includes(currentView)
    ) {
      setCurrentView('complete-business-profile');
    }
  }, [
    user,
    userProfile,
    authLoading,
    businessOwnerHasBusinessRow,
    currentView,
    setCurrentView,
    userProfileLoadError,
  ]);

  // ─── Scroll to top on view change ───
  useEffect(() => {
    if (prevViewRef.current !== currentView) {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      prevViewRef.current = currentView;
    }
  }, [currentView]);

  // ─── Keyboard accessibility ───
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        document.activeElement instanceof HTMLElement && document.activeElement.blur();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const renderView = () => {
    const legalSlug = legalSlugFromPath(location.pathname);
    if (!legalSlug && !isRoutableAppPath(location.pathname)) {
      return <NotFound />;
    }
    if (legalSlug) {
      return (
        <div className="pt-16 min-h-[40vh] bg-white">
          <LegalDocumentPage slug={legalSlug} />
        </div>
      );
    }

    switch (currentView) {
      case 'complete-profile':
        return <CompleteTouristProfile />;
      case 'complete-business-profile':
        return <CompleteBusinessProfile />;
      case 'business-detail': {
        // Deep link to a deal that doesn't exist (deleted / bad slug).
        if (dealNotFound) return <NotFound />;
        // Resolving a /deal/:slug cold load — show a skeleton until the listing arrives.
        if (!selectedBusiness && dealSlugFromPathname(location.pathname)) {
          return (
            <div className="pt-16">
              <LoadingSkeleton />
            </div>
          );
        }
        return <BusinessDetail />;
      }
      case 'business-profile': {
        if (hostProfileNotFound || !hostProfileId) {
          if (partnerSlugFromPathname(location.pathname) && !hostProfileId && !hostProfileNotFound) {
            return (
              <div className="pt-16">
                <LoadingSkeleton />
              </div>
            );
          }
          return <NotFound />;
        }
        return (
          <Suspense
            fallback={
              <div className="pt-16">
                <LoadingSkeleton />
              </div>
            }
          >
            <BusinessProfilePage profileBusinessId={hostProfileId} />
          </Suspense>
        );
      }
      case 'deals':
        return (
          <div className="pt-16">
            <BusinessGrid />
          </div>
        );
      case 'map':
        return (
          <div className="pt-16">
            <MapView />
          </div>
        );
      case 'passes':
        return (
          <div className="pt-16">
            <PassesEntryGate />
          </div>
        );
      case 'dashboard':
        return <Dashboard />;
      case 'my-favorites':
        return <MyFavoritesList />;
      case 'admin':
        return <AdminPanel />;
      case 'checkout':
        return <PaymentCheckout />;
      case 'payment-confirmation':
        return <PaymentConfirmation />;
      case 'business-dashboard':
        return <BusinessOwnerDashboard />;
      case 'help':
        return <HelpCenter />;
      case 'faq':
        return <HelpCenter initialSection="tourist-faq" />;
      case 'business-guide':
        return <HelpCenter initialSection="business-guide" />;
      case 'business-new':
        return <BusinessListingFormInLayout padded />;
      case 'business-join':
        return <ForBusinessLanding />;
      case 'home':
      default:
        return <HomePage />;
    }
  };

  const hideMainNav =
    currentView === 'business-dashboard' ||
    currentView === 'complete-profile' ||
    currentView === 'complete-business-profile' ||
    currentView === 'checkout' ||
    // Tourist home keeps SwipeDiscover's own branding/login chrome (not the full Navbar).
    (currentView === 'home' && user?.type !== 'business');
  const hideFooter =
    currentView === 'admin' ||
    currentView === 'checkout' ||
    currentView === 'payment-confirmation' ||
    currentView === 'business-dashboard' ||
    currentView === 'business-join' ||
    currentView === 'complete-profile' ||
    currentView === 'complete-business-profile' ||
    (currentView === 'home' && user?.type !== 'business') ||
    // Hub tabs use bottom nav — hide marketing footer on those surfaces.
    (user?.type !== 'business' && isHubBottomNavView(currentView));

  // Hybrid Hub bottom tabs for tourists + anonymous visitors (not business/admin shells).
  const showHubBottomNav =
    user?.type !== 'business' &&
    user?.type !== 'admin' &&
    user?.type !== 'staff' &&
    isHubBottomNavView(currentView);

  const showTouristProfileNudge =
    user?.type === 'tourist' &&
    userProfile &&
    !userProfileLoadError &&
    !isTouristProfileCompleteForGate(userProfile) &&
    TOURIST_BROWSE_VIEWS_WHILE_INCOMPLETE.includes(currentView);

  return (
    <div className={`min-h-screen bg-white${showHubBottomNav ? ' has-hub-bottom-nav' : ''}`}>
      {/* Skip Navigation Link - Accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-teal-600 focus:text-white focus:rounded-lg focus:text-sm focus:font-semibold focus:shadow-lg"
      >
        Skip to main content
      </a>

      {!hideMainNav && <Navbar />}

      <ListingsLoadBanner />

      {user && userProfileLoadError && (
        <div
          role="alert"
          className={`${hideMainNav ? 'pt-4' : 'pt-20'} px-4 pb-2 bg-red-50 border-b border-red-200 text-red-900 text-sm`}
        >
          <div className="max-w-3xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden />
              <p>{userProfileLoadError}</p>
            </div>
            <button
              type="button"
              onClick={() => void retryUserProfileFetch()}
              className="shrink-0 px-4 py-2 rounded-lg bg-red-700 text-white text-sm font-semibold hover:bg-red-800 transition-colors"
            >
              {language === 'en' ? 'Try again' : language === 'fr' ? 'Réessayer' : 'Traem bakeken'}
            </button>
          </div>
        </div>
      )}

      {showTouristProfileNudge && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-950 text-sm px-4 py-2.5 text-center">
          <span>
            {language === 'en'
              ? 'Finish your travel profile to unlock passes and the full app.'
              : language === 'fr'
                ? 'Terminez votre profil voyage pour débloquer les pass et toute l’application.'
                : 'Finisim travel profil blong yu blong save anlokem pas mo yusum ful ap.'}{' '}
          </span>
          <button
            type="button"
            onClick={() => setCurrentView('complete-profile')}
            className="font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-800"
          >
            {language === 'en' ? 'Continue setup' : language === 'fr' ? 'Poursuivre' : 'Go hed blong set ap'}
          </button>
        </div>
      )}

      <main
        id="main-content"
        role="main"
        aria-label="Main content"
        className={showHubBottomNav ? 'pb-[var(--hub-nav-offset)]' : undefined}
      >
        <Suspense fallback={<LoadingSkeleton />}>
          {renderView()}
        </Suspense>
      </main>

      {!hideFooter && <Footer />}
      <AuthModal />
      <CookieConsent />
      <InstallPrompt />
      <FloatingPassButton />
      {showHubBottomNav && <BottomNav />}
    </div>
  );
};

export default AppLayout;
