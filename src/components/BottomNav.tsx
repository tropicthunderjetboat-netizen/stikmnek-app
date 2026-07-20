import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, Home, MapPin, User } from 'lucide-react';
import { useAppContext } from '@/contexts/AppContext';
import {
  HUB_BOTTOM_NAV_HEIGHT_PX,
  pathForHubView,
  type ViewMode,
} from '@/utils/viewModes';
import {
  loadMapView,
  loadMyFavoritesList,
  loadTouristDashboard,
  prefetchChunk,
} from '@/lib/heavyChunks';

type HubTab = {
  id: 'home' | 'map' | 'saved' | 'profile';
  view: ViewMode;
  label: { en: string; fr: string; bi: string };
  icon: React.ReactNode;
  prefetch?: () => Promise<unknown>;
};

const TABS: HubTab[] = [
  {
    id: 'home',
    view: 'home',
    label: { en: 'Home', fr: 'Accueil', bi: 'Hom' },
    icon: <Home className="w-5 h-5" strokeWidth={2.25} aria-hidden />,
  },
  {
    id: 'map',
    view: 'map',
    label: { en: 'Map', fr: 'Carte', bi: 'Map' },
    icon: <MapPin className="w-5 h-5" strokeWidth={2.25} aria-hidden />,
    prefetch: loadMapView,
  },
  {
    id: 'saved',
    view: 'my-favorites',
    label: { en: 'Saved', fr: 'Sauvé', bi: 'Sevem' },
    icon: <Heart className="w-5 h-5" strokeWidth={2.25} aria-hidden />,
    prefetch: loadMyFavoritesList,
  },
  {
    id: 'profile',
    view: 'dashboard',
    label: { en: 'Profile', fr: 'Profil', bi: 'Profil' },
    icon: <User className="w-5 h-5" strokeWidth={2.25} aria-hidden />,
    prefetch: loadTouristDashboard,
  },
];

/**
 * Persistent tourist Hybrid Hub bottom navigation.
 * Sticky on mobile; desktop also keeps it for a consistent PWA shell.
 */
const BottomNav: React.FC = () => {
  const navigate = useNavigate();
  const { language, currentView, setCurrentView } = useAppContext();

  const go = useCallback(
    (view: ViewMode) => {
      if (view === currentView) return;
      setCurrentView(view);
      const path = pathForHubView(view);
      if (path) navigate(path);
    },
    [currentView, navigate, setCurrentView],
  );

  return (
    <nav
      role="navigation"
      aria-label={
        language === 'fr'
          ? 'Navigation principale'
          : language === 'bi'
            ? 'Meni blong go long'
            : 'Main navigation'
      }
      className="hub-phone-fixed fixed bottom-0 z-[55] border-t border-teal-100/90 bg-white/95 backdrop-blur-md shadow-[0_-4px_20px_rgba(15,23,42,0.06)]"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div
        className="mx-auto flex max-w-lg items-stretch justify-around px-1"
        style={{ height: HUB_BOTTOM_NAV_HEIGHT_PX }}
      >
        {TABS.map((tab) => {
          const active = currentView === tab.view;
          const label =
            language === 'fr' ? tab.label.fr : language === 'bi' ? tab.label.bi : tab.label.en;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => go(tab.view)}
              onPointerEnter={() => {
                if (tab.prefetch) prefetchChunk(tab.prefetch);
              }}
              onFocus={() => {
                if (tab.prefetch) prefetchChunk(tab.prefetch);
              }}
              aria-current={active ? 'page' : undefined}
              className={`relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 transition-colors ${
                active ? 'text-teal-700' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-xl transition-colors ${
                  active ? 'bg-teal-50' : ''
                }`}
              >
                {tab.icon}
              </span>
              <span
                className={`max-w-full truncate text-[10px] font-semibold leading-none tracking-wide ${
                  active ? 'text-teal-800' : ''
                }`}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
