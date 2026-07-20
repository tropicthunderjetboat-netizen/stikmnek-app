import React, { useCallback } from 'react';
import { Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { listingOfferBadgeText, type Business } from '@/data/businesses';
import { absoluteDealUrl } from '@/lib/dealUrl';
import { cn } from '@/lib/utils';

export type ShareBusiness = Pick<Business, 'id' | 'name' | 'discount'> &
  Partial<Pick<Business, 'business_offerings'>> & {
    slug?: string | null;
  };

type ShareButtonProps = {
  business: ShareBusiness;
  /** Override discount text in the share title (defaults to listing badge / discount). */
  discountText?: string;
  className?: string;
  /** Visual style for different surfaces */
  variant?: 'icon' | 'icon-light' | 'button' | 'button-compact';
  label?: string;
  stopPropagation?: boolean;
};

function resolveDiscountText(business: ShareBusiness, override?: string): string {
  const fromOverride = String(override ?? '').trim();
  if (fromOverride) return fromOverride;
  try {
    const badge = listingOfferBadgeText(business as Business);
    if (badge) return badge;
  } catch {
    /* ignore */
  }
  return String(business.discount ?? '').trim();
}

function buildSharePayload(business: ShareBusiness, discountText?: string) {
  const discount = resolveDiscountText(business, discountText);
  const title = discount
    ? `${business.name} · ${discount} on StikmNek`
    : `${business.name} · StikmNek`;
  const text = `Check out ${business.name} in Vanuatu! Save direct with StikmNek.`;
  const url = absoluteDealUrl(business);
  return { title, text, url };
}

/** Native share (Web Share API) with clipboard fallback. */
export async function shareBusinessDeal(
  business: ShareBusiness,
  discountText?: string,
): Promise<void> {
  const shareData = buildSharePayload(business, discountText);
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      await navigator.share(shareData);
      return;
    }
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'name' in err && (err as { name?: string }).name === 'AbortError') {
      return;
    }
  }
  try {
    await navigator.clipboard.writeText(shareData.url);
    toast.success('Link copied!');
  } catch {
    toast.info('Copy this link to share:', { description: shareData.url, duration: 6000 });
  }
}

const ShareButton: React.FC<ShareButtonProps> = ({
  business,
  discountText,
  className,
  variant = 'icon',
  label = 'Share',
  stopPropagation = true,
}) => {
  const onClick = useCallback(
    (e: React.MouseEvent) => {
      if (stopPropagation) {
        e.stopPropagation();
        e.preventDefault();
      }
      void shareBusinessDeal(business, discountText);
    },
    [business, discountText, stopPropagation],
  );

  if (variant === 'button' || variant === 'button-compact') {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={`Share ${business.name}`}
        className={cn(
          'inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold transition-colors hover:border-teal-300',
          variant === 'button' ? 'flex-1 py-2.5' : 'min-h-9 px-3 text-xs',
          className,
        )}
      >
        <Share2 className={variant === 'button-compact' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
        {label}
      </button>
    );
  }

  const light = variant === 'icon-light';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Share ${business.name}`}
      className={cn(
        'p-2 rounded-full shadow-md transition-colors',
        light
          ? 'bg-white/92 text-[#0A0A0A] hover:bg-white'
          : 'border border-gray-200 bg-white text-gray-600 hover:border-teal-300 hover:text-teal-700',
        className,
      )}
    >
      <Share2 className="h-5 w-5" />
    </button>
  );
};

export default ShareButton;
