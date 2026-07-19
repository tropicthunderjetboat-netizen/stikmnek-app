import React from 'react';
import { List, Map } from 'lucide-react';

/** Matches PlaceCard / trip strip reserved height (thumb row + padding). */
export const TRIP_STRIP_FAB_OFFSET = '4.75rem';

type MapToggleFabProps = {
  isMapMode: boolean;
  onToggle: () => void;
  language: 'en' | 'fr' | 'bi';
  /** Hide when overlays (detail/search) cover the feed */
  hidden?: boolean;
  /**
   * When the bottom trip/itinerary strip is visible on the feed,
   * lift the FAB so it does not cover the thumbnails.
   */
  liftForTripStrip?: boolean;
};

/**
 * Home hub FAB — toggles Discovery feed ↔ embedded MapView.
 * Sits above BottomNav via --hub-nav-offset; bottom-center to clear side FABs.
 */
const MapToggleFab: React.FC<MapToggleFabProps> = ({
  isMapMode,
  onToggle,
  language,
  hidden = false,
  liftForTripStrip = false,
}) => {
  if (hidden) return null;

  const label = isMapMode
    ? language === 'fr'
      ? 'Voir la liste'
      : language === 'bi'
        ? 'Luk list'
        : 'View List'
    : language === 'fr'
      ? 'Voir la carte'
      : language === 'bi'
        ? 'Luk map'
        : 'View Map';

  const tripLift = liftForTripStrip ? TRIP_STRIP_FAB_OFFSET : '0px';

  return (
    <button
      type="button"
      onClick={onToggle}
      className="pointer-events-auto fixed left-1/2 z-[45] flex h-12 -translate-x-1/2 items-center gap-2 rounded-full bg-[#0A1F2A]/90 px-5 text-sm font-bold text-white shadow-xl shadow-black/30 backdrop-blur-md ring-1 ring-white/15 transition-[bottom,transform] duration-200 active:scale-95 hover:bg-[#0A1F2A]"
      style={{
        bottom: `calc(var(--hub-nav-offset, 0px) + ${tripLift} + 1rem)`,
      }}
      aria-pressed={isMapMode}
      aria-label={label}
    >
      {isMapMode ? (
        <List className="h-4 w-4 shrink-0" aria-hidden />
      ) : (
        <Map className="h-4 w-4 shrink-0" aria-hidden />
      )}
      <span>{label}</span>
    </button>
  );
};

export default React.memo(MapToggleFab);
