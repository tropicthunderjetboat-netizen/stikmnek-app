import React, { Suspense, useEffect, useRef } from 'react';
import { useAppContext } from '@/contexts/AppContext';

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
import CompleteBusinessProfile from './CompleteBusinessProfile';

// ── Lazy-loaded route components ──
const Dashboard = React.lazy(() => import('./Dashboard'));
const AdminPanel = React.lazy(() => import('./AdminPanel'));
const PaymentCheckout = React.lazy(() => import('./PaymentCheckout'));
const BusinessOwnerDashboard = React.lazy(() => import('./BusinessOwnerDashboard'));
const HelpCenter = React.lazy(() => import('./HelpCenter'));

const AppLayout: React.FC = () => {
  const {
    currentView,
    user,
    userProfile,
    authLoading,
    setCurrentView,
    businessOwnerHasBusinessRow,
  } = useAppContext();
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

  // ─── Profile-First gating (Business owners — businesses.owner_id row) ───
  useEffect(() => {
    if (!user || authLoading) return;
    const role = userProfile?.role || user.type || 'tourist';
    if (role !== 'business') return;
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
        return <HelpCenter />;
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
            <BusinessListingForm />
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
