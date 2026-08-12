import React from 'react';
import { Heart } from 'lucide-react';
import { t, type Language } from '@/data/translations';

type LocalOwnedBadgeProps = {
  language: Language | string;
  variant?: 'footer' | 'hero';
  className?: string;
};

const variantClasses: Record<NonNullable<LocalOwnedBadgeProps['variant']>, string> = {
  footer:
    'inline-flex max-w-sm items-start gap-1.5 rounded-lg border border-teal-500/35 bg-teal-500/10 px-3 py-2 text-[11px] font-medium leading-snug text-teal-100/95',
  hero:
    'inline-flex max-w-md items-start gap-1.5 rounded-lg border border-white/25 bg-white/10 backdrop-blur-sm px-3 py-2 text-xs sm:text-sm font-medium leading-snug text-white/95',
};

const heartClasses: Record<NonNullable<LocalOwnedBadgeProps['variant']>, string> = {
  footer: 'mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-400',
  hero: 'mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300',
};

const LocalOwnedBadge: React.FC<LocalOwnedBadgeProps> = ({
  language,
  variant = 'footer',
  className = '',
}) => {
  const lang: Language = language === 'fr' ? 'fr' : 'en';

  return (
    <p className={`${variantClasses[variant]} ${className}`.trim()} role="note">
      <Heart className={heartClasses[variant]} aria-hidden />
      {t('footer.local_badge', lang)}
    </p>
  );
};

export default LocalOwnedBadge;
