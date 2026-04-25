import React, { Suspense, useEffect, useRef } from 'react';
import { AlertCircle } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useAppContext, isTouristProfileCompleteForGate } from '@/contexts/AppContext';
import { isViewMode, type ViewMode } from '@/utils/viewModes';
import LegalDocumentPage from './LegalDocumentPage';

// ── Eagerly-loaded components ──
import Navbar from './Navbar';
import Hero from './Hero';
import HowItWorks from './HowItWorks';
import CategoryShowcase from './CategoryShowcase';
import FeaturedLeaderboard from './FeaturedLeaderboard';
import BusinessGrid from './BusinessGrid';
import PassCards from './PassCards';
import ReviewsSection from './ReviewsSection';
import ListYourBusinessCta from './ListYourBusinessCta';
import Footer from './Footer';
import AuthModal from './AuthModal';
import CookieConsent from './CookieConsent';
import PaymentConfirmation from './PaymentConfirmation';
import FloatingPassButton from './FloatingPassButton';
import LoadingSkeleton from './LoadingSkeleton';
import CompleteTouristProfile from './CompleteTouristProfile';
import CompleteBusinessProfile from './CompleteBusinessProfile';

// ── Lazy-loaded route components ──
const Dashboard = React.lazy(() => import('./Dashboard'));
const AdminPanel = React.lazy(() => import('./AdminPanel'));
const PaymentCheckout = React.lazy(() => import('./PaymentCheckout'));
const BusinessOwnerDashboard = React.lazy(() => import('./BusinessOwnerDashboard'));
const HelpCenter = React.lazy(() => import('./HelpCenter'));
const MapView = React.lazy(() => import('./MapView'));
const BusinessDetail = React.lazy(() => import('./BusinessDetail'));
const BusinessListingForm = React.lazy(() => import('./BusinessListingForm'));

/** URL path → in-app view (excludes /legal/* handled separately). */
const PATH_TO_VIEW: Record<string, ViewMode> = {
  '/': 'home',
  '/deals': 'deals',
  '/map': 'map',
  '/passes': 'passes',
  '/business/new': 'business-new',
  '/help': 'help',
  '/faq': 'faq',
  '/business-guide': 'business-guide',
};

/**
 * Tourists with an incomplete profile may still open these views (soft gate).
 * All other views keep hard redirect to complete-profile until the gate passes.
 * To expand browsing later, add view names here and optionally show a nav link to complete-profile.
 */
const TOURIST_BROWSE_VIEWS_WHILE_INCOMPLETE: ViewMode[] = [
  'deals',
  'map',
  'business-detail',
  'help',
  'faq',
  'business-guide',
];

function legalSlugFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/legal\/([^/]+)\/?$/);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Single listing form instance for home + /business/new (dashboard uses the same component in its Submit tab). */
function BusinessListingFormInLayout({ padded }: { padded: boolean }) {
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
  } = useAppContext();
  const prevViewRef = useRef(currentView);

  useEffect(() => {
    const p = location.pathname;
    if (p.startsWith('/legal/')) return;
    const next = PATH_TO_VIEW[p];
    if (next !== undefined && isViewMode(next)) {
      setCurrentView(next);
    }
  }, [location.pathname, setCurrentView]);

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

    // Prevent business users from accessing tourist dashboard
    if (role === 'business' && currentView === 'dashboard') {
      setCurrentView('business-dashboard');
      return;
    }

    // Business onboarding screen — do not bounce to dashboard until profile row exists
    if (role === 'business' && currentView === 'business-dashboard' && businessOwnerHasBusinessRow === false) {
      setCurrentView('complete-business-profile');
      return;
    }

    // Only admins can access admin panel
    if (currentView === 'admin' && role !== 'admin') {
      if (!userProfile) return;
      setCurrentView('home');
      return;
    }
  }, [currentView, user, userProfile, authLoading, businessOwnerHasBusinessRow, setCurrentView]);

  // ─── Profile-First gating (Tourists) ───
  useEffect(() => {
    if (!user || authLoading) return;
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
    if (businessOwnerHasBusinessRow === null) return;

    if (businessOwnerHasBusinessRow === false && currentView !== 'complete-business-profile') {
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
      case 'business-detail':
        return <BusinessDetail />;
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
            <PassCards />
          </div>
        );
      case 'dashboard':
        return <Dashboard />;
      case 'admin':
        return <AdminPanel />;
      case 'checkout':
        return <PaymentCheckout />;
      case 'payment-confirmation':
        return <PaymentConfirmation />;
      case 'business-dashboard':
        return <BusinessOwnerDashboard />;
      case 'help':
        return (
          <div className="pt-16">
            <HelpCenter />
          </div>
        );
      case 'faq':
        return (
          <div className="pt-16">
            <HelpCenter initialSection="tourist-faq" />
          </div>
        );
      case 'business-guide':
        return (
          <div className="pt-16">
            <HelpCenter initialSection="business-guide" />
          </div>
        );
      case 'business-new':
        return <BusinessListingFormInLayout padded />;
      case 'home':
      default:
        return (
          <>
            <Hero />
            <HowItWorks />
            <CategoryShowcase />
            <FeaturedLeaderboard />
            <PassCards />
            <MapView />
            <ReviewsSection />
            <ListYourBusinessCta />
          </>
        );
    }
  };

  const hideMainNav =
    currentView === 'business-dashboard' ||
    currentView === 'complete-profile' ||
    currentView === 'complete-business-profile';
  const hideFooter =
    currentView === 'admin' ||
    currentView === 'checkout' ||
    currentView === 'payment-confirmation' ||
    currentView === 'business-dashboard' ||
    currentView === 'complete-profile' ||
    currentView === 'complete-business-profile';

  const showTouristProfileNudge =
    user?.type === 'tourist' &&
    userProfile &&
    !userProfileLoadError &&
    !isTouristProfileCompleteForGate(userProfile) &&
    TOURIST_BROWSE_VIEWS_WHILE_INCOMPLETE.includes(currentView);

  return (
    <div className="min-h-screen bg-white">
      {/* Skip Navigation Link - Accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-teal-600 focus:text-white focus:rounded-lg focus:text-sm focus:font-semibold focus:shadow-lg"
      >
        Skip to main content
      </a>

      {!hideMainNav && <Navbar />}

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
              {language === 'en' ? 'Try again' : language === 'fr' ? 'Réessayer' : 'Traem gen'}
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
                : 'Finisem travel profil blong yu blong yusum fulap.'}{' '}
          </span>
          <button
            type="button"
            onClick={() => setCurrentView('complete-profile')}
            className="font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-800"
          >
            {language === 'en' ? 'Continue setup' : language === 'fr' ? 'Poursuivre' : 'Go hed'}
          </button>
        </div>
      )}

      <main id="main-content" role="main" aria-label="Main content">
        <Suspense fallback={<LoadingSkeleton />}>
          {renderView()}
        </Suspense>
      </main>

      {!hideFooter && <Footer />}
      <AuthModal />
      <CookieConsent />
      <FloatingPassButton />
    </div>
  );
};

export default AppLayout;
