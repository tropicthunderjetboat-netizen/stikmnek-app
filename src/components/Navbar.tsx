import React from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { t } from '@/data/translations';
import { shouldOpenCheckoutInsteadOfPassesPage } from '@/utils/passNavigation';
import { Menu, X, User, MapPin, Tag, LayoutDashboard, Shield, Ticket, Store, Plane, Briefcase, HelpCircle } from 'lucide-react';
import {
  loadAdminPanel,
  loadBusinessOwnerDashboard,
  loadMapView,
  loadTouristDashboard,
  prefetchChunk,
} from '@/lib/heavyChunks';

const APP_ICON = '/logo-icon.png';

const Navbar: React.FC = () => {
  const {
    language, setLanguage, currentView, setCurrentView,
    user, signOut, setShowAuth, setAuthMode,
    sidebarOpen, toggleSidebar,
    purchasePass,
  } = useAppContext();

  // ─── Build role-based navigation ───
  const navItems: { key: string; view: any; icon: React.ReactNode; label: string }[] = [
    { key: 'home', view: 'home', icon: <Tag className="w-4 h-4" />, label: t('nav.home', language) },
  ];

  if (!user || user.type === 'tourist' || user.type === 'admin') {
    // Tourist navigation items
    navItems.push(
      { key: 'deals', view: 'deals', icon: <Ticket className="w-4 h-4" />, label: t('nav.deals', language) },
      { key: 'map', view: 'map', icon: <MapPin className="w-4 h-4" />, label: t('nav.map', language) },
      { key: 'passes', view: 'passes', icon: <Tag className="w-4 h-4" />, label: t('nav.passes', language) },
    );
  }

  if (user) {
    if (user.type === 'tourist') {
      // Tourist dashboard
      navItems.push({ key: 'dashboard', view: 'dashboard', icon: <LayoutDashboard className="w-4 h-4" />, label: language === 'en' ? 'My Dashboard' : language === 'fr' ? 'Mon Tableau de Bord' : 'Dasbod Blong Mi' });
    } else if (user.type === 'business') {
      // Business dashboard - primary navigation for business users
      navItems.push(
        { key: 'deals', view: 'deals', icon: <Ticket className="w-4 h-4" />, label: t('nav.deals', language) },
        { key: 'business-dashboard', view: 'business-dashboard', icon: <Store className="w-4 h-4" />, label: language === 'en' ? 'My Business' : language === 'fr' ? 'Mon Entreprise' : 'Bisnis Blong Mi' },
      );
    } else if (user.type === 'admin') {
      // Admin: only Admin panel (no My Dashboard or Business Hub)
      navItems.push({ key: 'admin', view: 'admin', icon: <Shield className="w-4 h-4" />, label: t('nav.admin', language) });
    }
  }

  // Help link for everyone
  navItems.push({ key: 'help', view: 'help', icon: <HelpCircle className="w-4 h-4" />, label: language === 'en' ? 'Help' : language === 'fr' ? 'Aide' : 'Halpem' });

  const goToPassesOrCheckout = (view: string) => {
    if (view === 'passes' && shouldOpenCheckoutInsteadOfPassesPage(user)) {
      void purchasePass();
      return;
    }
    setCurrentView(view);
  };

  const langOptions = [
    { code: 'en' as const, label: 'EN', flag: '🇬🇧' },
    { code: 'fr' as const, label: 'FR', flag: '🇫🇷' },
    { code: 'bi' as const, label: 'BI', flag: '🇻🇺' },
  ];

  // Role badge for user
  const getRoleBadge = () => {
    if (!user) return null;
    if (user.type === 'business') {
      return (
        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-700 uppercase flex items-center gap-0.5">
          <Briefcase className="w-2.5 h-2.5" />
          {language === 'en' ? 'Business' : 'Entreprise'}
        </span>
      );
    }
    if (user.type === 'admin') {
      return (
        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-100 text-purple-700 uppercase flex items-center gap-0.5">
          <Shield className="w-2.5 h-2.5" />
          Admin
        </span>
      );
    }
    if (user.type === 'tourist') {
      return (
        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-sky-100 text-sky-700 uppercase flex items-center gap-0.5">
          <Plane className="w-2.5 h-2.5" />
          {language === 'en' ? 'Tourist' : 'Touriste'}
        </span>
      );
    }
    return null;
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-b border-teal-100 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <button
            onClick={() => setCurrentView('home')}
            className="flex items-center gap-2.5 group text-left"
          >
            <div className="w-9 h-9 rounded-xl overflow-hidden shadow-lg shadow-teal-200 group-hover:shadow-teal-300 transition-shadow shrink-0">
              <img
                src={APP_ICON}
                alt=""
                className="w-full h-full object-cover"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  target.parentElement!.classList.add(
                    'bg-gradient-to-br',
                    'from-teal-500',
                    'to-emerald-600',
                    'flex',
                    'items-center',
                    'justify-center',
                  );
                  target.parentElement!.innerHTML = '<span class="text-white text-sm font-bold">S</span>';
                }}
              />
            </div>
            <div className="min-w-0">
              <span className="block text-xl font-bold bg-gradient-to-r from-teal-700 to-emerald-600 bg-clip-text text-transparent leading-tight">
                StikmNek
              </span>
              <span className="hidden xl:block text-[10px] font-medium text-teal-800/75 leading-snug max-w-[240px] truncate">
                {t('footer.local_badge', language)}
              </span>
            </div>
          </button>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1">
            {navItems.map(item => (
              <button
                key={item.key}
                onClick={() => goToPassesOrCheckout(item.view)}
                onMouseEnter={() => {
                  // Strategic prefetch on intent (hover/focus) only.
                  if (item.view === 'map') prefetchChunk(loadMapView);
                  if (item.view === 'dashboard') prefetchChunk(loadTouristDashboard);
                  if (item.view === 'business-dashboard') prefetchChunk(loadBusinessOwnerDashboard);
                  if (item.view === 'admin') prefetchChunk(loadAdminPanel);
                }}
                onFocus={() => {
                  // Keyboard users: prefetch on focus.
                  if (item.view === 'map') prefetchChunk(loadMapView);
                  if (item.view === 'dashboard') prefetchChunk(loadTouristDashboard);
                  if (item.view === 'business-dashboard') prefetchChunk(loadBusinessOwnerDashboard);
                  if (item.view === 'admin') prefetchChunk(loadAdminPanel);
                }}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  currentView === item.view
                    ? 'bg-teal-50 text-teal-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>

          {/* Right Side */}
          <div className="flex items-center gap-2">
            {/* Language Switcher */}
            <div className="hidden sm:flex items-center bg-gray-100 rounded-lg p-0.5">
              {langOptions.map(opt => (
                <button
                  key={opt.code}
                  onClick={() => setLanguage(opt.code)}
                  className={`px-2 py-1 rounded-md text-xs font-semibold transition-all ${
                    language === opt.code
                      ? 'bg-white text-teal-700 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Auth Button */}
            {user ? (
              <div className="hidden sm:flex items-center gap-2">
                <button
                  onClick={() => setCurrentView(user.type === 'admin' ? 'admin' : user.type === 'business' ? 'business-dashboard' : 'dashboard')}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-teal-50 text-teal-700 hover:bg-teal-100 transition-colors"
                >
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt={user.name} className="w-6 h-6 rounded-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center text-white text-xs font-bold">
                      {user.name.charAt(0)}
                    </div>
                  )}
                  <span className="text-sm font-medium">{user.name.split(' ')[0]}</span>
                  {getRoleBadge()}
                </button>

                <button
                  onClick={signOut}
                  className="text-sm text-gray-500 hover:text-red-500 transition-colors px-2"
                >
                  {t('nav.signout', language)}
                </button>
              </div>
            ) : (
              <div className="hidden sm:flex items-center gap-2">
                <button
                  onClick={() => { setShowAuth(true); setAuthMode('signin'); }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-teal-600 to-emerald-600 text-white text-sm font-medium hover:from-teal-700 hover:to-emerald-700 transition-all shadow-md shadow-teal-200 hover:shadow-lg"
                >
                  <User className="w-4 h-4" />
                  {t('nav.signin', language)}
                </button>
              </div>
            )}

            {/* Mobile Menu Toggle */}
            <button
              onClick={toggleSidebar}
              className="md:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
            >
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {sidebarOpen && (
        <div className="md:hidden bg-white border-t border-gray-100 shadow-lg">
          <div className="px-4 py-3 space-y-1">
            {/* User info banner for mobile */}
            {user && (
              <div className="flex items-center gap-3 px-3 py-3 mb-2 rounded-xl bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-100">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center text-white text-sm font-bold">
                  {user.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{user.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {getRoleBadge()}
                  </div>
                </div>
              </div>
            )}

            {navItems.map(item => (
              <button
                key={item.key}
                onClick={() => { goToPassesOrCheckout(item.view); toggleSidebar(); }}
                className={`flex items-center gap-2 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  currentView === item.view
                    ? 'bg-teal-50 text-teal-700'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
            <div className="flex items-center gap-1 pt-2 border-t border-gray-100 mt-2">
              {langOptions.map(opt => (
                <button
                  key={opt.code}
                  onClick={() => setLanguage(opt.code)}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                    language === opt.code
                      ? 'bg-teal-50 text-teal-700'
                      : 'text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {!user && (
              <div className="space-y-2 pt-2">
                <button
                  onClick={() => { setShowAuth(true); setAuthMode('signin'); toggleSidebar(); }}
                  className="w-full px-4 py-2.5 rounded-lg bg-gradient-to-r from-teal-600 to-emerald-600 text-white text-sm font-medium"
                >
                  {t('nav.signin', language)}
                </button>
                <button
                  onClick={() => { setShowAuth(true); setAuthMode('signup'); toggleSidebar(); }}
                  className="w-full px-4 py-2.5 rounded-lg border border-teal-200 text-teal-700 text-sm font-medium hover:bg-teal-50"
                >
                  {language === 'en' ? 'Create Account' : language === 'fr' ? 'Créer un compte' : 'Mekem Akaont'}
                </button>
              </div>
            )}
            {user && (
              <button
                onClick={() => { signOut(); toggleSidebar(); }}
                className="w-full mt-2 px-4 py-2.5 rounded-lg border border-red-200 text-red-600 text-sm font-medium"
              >
                {t('nav.signout', language)}
              </button>
            )}
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
