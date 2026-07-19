import React from 'react';
import { List, Map } from 'lucide-react';

type MapToggleFabProps = {
  isMapMode: boolean;
  onToggle: () => void;
  language: 'en' | 'fr' | 'bi';
  /** Hide when overlays (detail/search) cover the feed */
  hidden?: boolean;
  /** Match light (tip/map) vs dark (place photo) top chrome. */
  light?: boolean;
};

/**
 * Compact map/list toggle for the Home top chrome (below search/trip, above category pills).
 * Kept as an auxiliary control — not a bottom primary CTA.
 */
const MapToggleFab: React.FC<MapToggleFabProps> = ({
  isMapMode,
  onToggle,
  language,
  hidden = false,
  light = false,
}) => {
  if (hidden) return null;

  const label = isMapMode
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

  const fullLabel = isMapMode
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

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`pointer-events-auto inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[11px] font-semibold tracking-wide backdrop-blur-md transition-colors active:scale-95 ${
        light
          ? 'bg-[#0A1F2A]/[0.08] text-[#0A1F2A] ring-1 ring-[#0A1F2A]/10'
          : 'bg-black/40 text-white ring-1 ring-white/25'
      }`}
      aria-pressed={isMapMode}
      aria-label={fullLabel}
      title={fullLabel}
    >
      {isMapMode ? (
        <List className="h-3.5 w-3.5 shrink-0" aria-hidden />
      ) : (
        <Map className="h-3.5 w-3.5 shrink-0" aria-hidden />
      )}
      <span>{label}</span>
    </button>
  );
};

export default React.memo(MapToggleFab);
