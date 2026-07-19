import React, { useCallback, useRef } from 'react';
import {
  Car,
  Compass,
  Heart,
  Home,
  ShoppingBag,
  SlidersHorizontal,
  Utensils,
  Waves,
} from 'lucide-react';
import { categories, type Category } from '@/data/businesses';
import { t } from '@/data/translations';

export type HomeCategoryKey = 'all' | Category;

const CATEGORY_ICONS: Record<HomeCategoryKey, React.ReactNode> = {
  all: <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" aria-hidden />,
  dining: <Utensils className="w-3.5 h-3.5 shrink-0" aria-hidden />,
  activities: <Waves className="w-3.5 h-3.5 shrink-0" aria-hidden />,
  tours: <Compass className="w-3.5 h-3.5 shrink-0" aria-hidden />,
  transportation: <Car className="w-3.5 h-3.5 shrink-0" aria-hidden />,
  shopping: <ShoppingBag className="w-3.5 h-3.5 shrink-0" aria-hidden />,
  spa: <Heart className="w-3.5 h-3.5 shrink-0" aria-hidden />,
  accommodation: <Home className="w-3.5 h-3.5 shrink-0" aria-hidden />,
};

type HomeCategoryPillsProps = {
  value: HomeCategoryKey;
  onChange: (key: HomeCategoryKey) => void;
  language: 'en' | 'fr' | 'bi';
  /** Tip/end cards use light chrome; place cards use dark overlays. */
  light?: boolean;
};

/**
 * Sticky horizontal category pills for the Hybrid Hub home feed.
 * Controlled — parent owns filter state so SwipeDiscover can memoize without remounting.
 */
const HomeCategoryPills: React.FC<HomeCategoryPillsProps> = ({
  value,
  onChange,
  language,
  light = false,
}) => {
  const scrollerRef = useRef<HTMLDivElement>(null);

  /** Keep horizontal pill scroll from leaking into the vertical swipe feed. */
  const stopFeedGestures = useCallback((e: React.SyntheticEvent) => {
    e.stopPropagation();
  }, []);

  const labelFor = (key: HomeCategoryKey): string => {
    if (key === 'all') return t('cat.all', language);
    const cat = categories.find((c) => c.key === key);
    if (!cat) return key;
    if (language === 'fr') return cat.labelFr;
    if (language === 'bi') return cat.labelBi;
    return cat.label;
  };

  const pills: HomeCategoryKey[] = ['all', ...categories.map((c) => c.key)];

  return (
    <div
      className="pointer-events-auto w-full"
      onTouchStart={stopFeedGestures}
      onTouchMove={stopFeedGestures}
      onTouchEnd={stopFeedGestures}
      onWheel={stopFeedGestures}
    >
      <div
        ref={scrollerRef}
        role="tablist"
        aria-label={
          language === 'fr'
            ? 'Filtrer par catégorie'
            : language === 'bi'
              ? 'Filta long kategori'
              : 'Filter by category'
        }
        className="flex gap-2 overflow-x-auto overscroll-x-contain touch-pan-x px-4 pb-2 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {pills.map((key) => {
          const active = value === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(key)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold tracking-wide transition-colors active:scale-[0.98] ${
                active
                  ? 'bg-teal-600 text-white shadow-md shadow-teal-900/25'
                  : light
                    ? 'bg-[#0A1F2A]/[0.08] text-[#0A1F2A] backdrop-blur-md'
                    : 'bg-black/35 text-white backdrop-blur-md ring-1 ring-white/15'
              }`}
            >
              {CATEGORY_ICONS[key]}
              <span>{labelFor(key)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default React.memo(HomeCategoryPills);
