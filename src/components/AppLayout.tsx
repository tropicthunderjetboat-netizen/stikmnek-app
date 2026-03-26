import React, { Suspense, useEffect, useRef } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { Store, ArrowRight } from 'lucide-react';

// ── Eagerly-loaded components ──
import Navbar from './Navbar';
import Hero from './Hero';
import HowItWorks from './HowItWorks';
import CategoryShowcase from './CategoryShowcase';
import FeaturedLeaderboard from './FeaturedLeaderboard';
import BusinessGrid from './BusinessGrid';
import PassCards from './PassCards';
import MapView from './MapView';
import ReviewsSection from './ReviewsSection';
import BusinessListingForm from './BusinessListingForm';
import Footer from './Footer';
import AuthModal from './AuthModal';
import BusinessDetail from './BusinessDetail';
import CookieConsent from './CookieConsent';
import PaymentConfirmation from './PaymentConfirmation';
import PayPalReturnHandler from './PayPalReturnHandler';
import FloatingPassButton from './FloatingPassButton';
import LoadingSkeleton from './LoadingSkeleton';
import CompleteTouristProfile from './CompleteTouristProfile';

// ── Lazy-loaded route components ──
const Dashboard = React.lazy(() => import('./Dashboard'));
const AdminPanel = React.lazy(() => import('./AdminPanel'));
const PaymentCheckout = React.lazy(() => import('./PaymentCheckout'));
const BusinessOwnerDashboard = React.lazy(() => import('./BusinessOwnerDashboard'));
const HelpCenter = React.lazy(() => import('./HelpCenter'));

const ListYourBusinessBanner: React.FC = () => {
  const { language, user, setShowAuth, setAuthMode } = useAppContext();

  // Don't show the banner to business users
  if (user?.type === 'business') return null;

  const handleClick = () => {
    if (!user) {
      setShowAuth(true);
      setAuthMode('signup-business');
      return;
    }
    const el = document.getElementById('list-business');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="relative pt-16">
      <div className="bg-gradient-to-r from-teal-600 via-emerald-600 to-teal-700 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-3 sm:py-3.5">
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex w-9 h-9 rounded-lg bg-white/20 backdrop-blur-sm items-center justify-center flex-shrink-0">
                <Store className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm sm:text-base font-semibold leading-tight">
                  {language === 'en'
                    ? 'Own a business in Vanuatu?'
                    : language === 'fr'
                    ? 'Vous avez une entreprise au Vanuatu ?'
                    : 'Yu gat wan bisnis long Vanuatu?'}
                </p>
                <p className="text-xs sm:text-sm text-white/80 hidden sm:block">
                  {language === 'en'
                    ? 'Reach thousands of tourists — list your business for free today!'
                    : language === 'fr'
                    ? 'Atteignez des milliers de touristes — inscrivez votre entreprise gratuitement !'
                    : 'Rijim plante turis — listem bisnis blong yu fri tede!'}
                </p>
              </div>
            </div>
            <button
              onClick={handleClick}
              className="flex items-center gap-2 px-5 py-2.5 sm:px-6 sm:py-2.5 rounded-xl bg-white text-teal-700 font-bold text-sm sm:text-base hover:bg-teal-50 transition-all shadow-lg shadow-teal-900/20 hover:shadow-xl hover:-translate-y-0.5 flex-shrink-0"
            >
              <Store className="w-4 h-4 sm:hidden" />
              <span className="hidden sm:inline">
                {language === 'en' ? 'List Your Business' : language === 'fr' ? 'Inscrivez votre entreprise' : 'Listem Bisnis Blong Yu'}
              </span>
              <span className="sm:hidden">
                {language === 'en' ? 'List Your Business' : language === 'fr' ? 'Inscrire' : 'Listem'}
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const AppLayout: React.FC = () => {
  const { currentView, user, userProfile, authLoading, setCurrentView } = useAppContext();
  const prevViewRef = useRef(currentView);

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

    // Only admins can access admin panel
    if (currentView === 'admin' && role !== 'admin') {
      if (!userProfile) return;
      setCurrentView('home');
      return;
    }
  }, [currentView, user, userProfile, authLoading, setCurrentView]);

  // ─── Profile-First gating (Tourists) ───
  useEffect(() => {
    if (!user || authLoading) return;
    if (user.type !== 'tourist') return;
    if (!userProfile) return; // wait for profile load

    const profileDone =
      userProfile.post_pass_profile_completed === true &&
      Boolean(userProfile.name || userProfile.full_name || userProfile.display_name) &&
      (userProfile.num_adults ?? 0) >= 1 &&
      Boolean((userProfile as any).expected_arrival_date) &&
      Boolean((userProfile as any).expected_departure_date);

    if (!profileDone && currentView !== 'complete-profile') {
      setCurrentView('complete-profile');
    }
  }, [user, userProfile, authLoading, currentView, setCurrentView]);

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
    switch (currentView) {
      case 'complete-profile':
        return <CompleteTouristProfile />;
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
        return <HelpCenter />;
      case 'home':
      default:
        return (
          <>
            <ListYourBusinessBanner />
            <Hero />
            <HowItWorks />
            <CategoryShowcase />
            <FeaturedLeaderboard />
            <PassCards />
            <MapView />
            <ReviewsSection />
            <BusinessListingForm />
          </>
        );
    }
  };

  const hideMainNav = currentView === 'business-dashboard' || currentView === 'complete-profile';
  const hideFooter =
    currentView === 'admin' ||
    currentView === 'checkout' ||
    currentView === 'payment-confirmation' ||
    currentView === 'business-dashboard' ||
    currentView === 'complete-profile';

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
      <main id="main-content" role="main" aria-label="Main content">
        <Suspense fallback={<LoadingSkeleton />}>
          {renderView()}
        </Suspense>
      </main>

      {!hideFooter && <Footer />}
      <AuthModal />
      <CookieConsent />
      <PayPalReturnHandler />
      <FloatingPassButton />
    </div>
  );
};

export default AppLayout;
