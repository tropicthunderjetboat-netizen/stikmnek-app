import React, { useState } from 'react';
import { Store } from 'lucide-react';
import { cn } from '@/lib/utils';

export type BusinessProfileLogoVariant = 'hero' | 'inline' | 'chip' | 'sidebar' | 'profilePage';

type BusinessProfileLogoProps = {
  src: string | null | undefined;
  alt?: string;
  /**
   * `hero` — on dark photo overlays (wide slot for landscape wordmarks).
   * `inline` — beside titles on white cards.
   * `chip` — compact rows (admin lists).
   */
  variant?: BusinessProfileLogoVariant;
  className?: string;
};

const VARIANT: Record<
  BusinessProfileLogoVariant,
  { wrap: string; img: string; fallbackIcon: string }
> = {
  hero: {
    wrap:
      'h-12 sm:h-[3.25rem] min-w-[2.75rem] max-w-[9.5rem] sm:max-w-[11.5rem] rounded-xl bg-white/95 px-2.5 sm:px-3 py-1.5 shadow-lg ring-1 ring-white/70 backdrop-blur-sm',
    img: 'max-h-full max-w-full w-auto h-auto object-contain object-center',
    fallbackIcon: 'w-6 h-6',
  },
  inline: {
    wrap:
      'h-11 min-w-[2.5rem] max-w-[8.5rem] rounded-lg bg-white border border-gray-100 px-2 py-1 shadow-sm',
    img: 'max-h-full max-w-full w-auto h-auto object-contain object-center',
    fallbackIcon: 'w-5 h-5',
  },
  chip: {
    wrap:
      'h-10 min-w-[2.25rem] max-w-[6.5rem] rounded-lg bg-white border border-gray-100 px-1.5 py-1',
    img: 'max-h-full max-w-full w-auto h-auto object-contain object-center',
    fallbackIcon: 'w-4 h-4',
  },
  /** Listing detail sidebar — square tile, fills frame (matches logo crop) */
  sidebar: {
    wrap:
      'w-full max-w-[220px] mx-auto aspect-square overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm',
    img: 'w-full h-full object-cover object-center',
    fallbackIcon: 'w-8 h-8',
  },
  /** Public `/host/...` business page — large showcase for wide wordmarks */
  profilePage: {
    wrap:
      'h-[5.5rem] sm:h-28 w-[min(100%,18rem)] sm:w-80 rounded-2xl bg-white px-4 py-3 shadow-xl ring-2 ring-white/40',
    img: 'h-full w-full object-contain object-center',
    fallbackIcon: 'w-10 h-10',
  },
};

/**
 * Business profile logo — uses a wide flexible frame so horizontal wordmarks stay readable
 * (not squeezed into a tiny square).
 */
const BusinessProfileLogo: React.FC<BusinessProfileLogoProps> = ({
  src,
  alt = '',
  variant = 'hero',
  className,
}) => {
  const [failed, setFailed] = useState(false);
  const trimmed = (src || '').trim();
  const styles = VARIANT[variant];

  if (!trimmed || failed) {
    if (variant === 'hero' || variant === 'sidebar') return null;
    if (variant === 'profilePage') {
      return (
        <div
          className={cn(
            'flex shrink-0 items-center justify-center text-teal-600/40',
            styles.wrap,
            className,
          )}
          aria-hidden
        >
          <Store className={styles.fallbackIcon} />
        </div>
      );
    }
    return (
      <div
        className={cn('flex shrink-0 items-center justify-center text-gray-300', styles.wrap, className)}
        aria-hidden
      >
        <Store className={styles.fallbackIcon} />
      </div>
    );
  }

  const isSidebar = variant === 'sidebar';

  return (
    <div
      className={cn(
        'flex items-center justify-center',
        isSidebar ? 'w-full h-full shrink' : 'shrink-0',
        styles.wrap,
        className,
      )}
      title={alt || undefined}
    >
      <img
        src={trimmed}
        alt={alt}
        className={styles.img}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    </div>
  );
};

export default BusinessProfileLogo;
