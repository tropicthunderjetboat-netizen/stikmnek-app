import React, { useId } from 'react';

export type FlagCode = 'en' | 'fr' | 'bi';

/**
 * Inline SVG flags for the language switcher.
 *
 * We previously used emoji flags (🇬🇧 🇫🇷 🇻🇺), but Windows ships no flag-emoji
 * glyphs, so desktop Chrome/Edge render the bare region letters ("GB", "FR", "VU")
 * instead. These SVGs render identically on every OS.
 *
 * - en → United Kingdom (Union Jack)
 * - fr → France (tricolore)
 * - bi → Bislama / Vanuatu
 */
const LanguageFlag: React.FC<{ code: FlagCode; className?: string }> = ({ code, className }) => {
  const rawId = useId().replace(/[:]/g, '');
  const wrapperClass = `inline-block w-[18px] h-[13px] rounded-[3px] overflow-hidden ring-1 ring-black/10 shadow-sm shrink-0 ${className ?? ''}`;

  if (code === 'fr') {
    return (
      <span className={wrapperClass} aria-hidden>
        <svg viewBox="0 0 3 2" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
          <rect width="3" height="2" fill="#fff" />
          <rect width="1" height="2" fill="#0055A4" />
          <rect x="2" width="1" height="2" fill="#EF4135" />
        </svg>
      </span>
    );
  }

  if (code === 'bi') {
    return (
      <span className={wrapperClass} aria-hidden>
        <svg viewBox="0 0 60 36" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
          <rect width="60" height="18" fill="#D21034" />
          <rect y="18" width="60" height="18" fill="#009543" />
          {/* Black triangle at the hoist */}
          <path d="M0,0 L34,18 L0,36 Z" fill="#000" />
          {/* Horizontal Y band: black fimbriation then yellow */}
          <path d="M0,18 H60" stroke="#000" stroke-width="9" />
          <path d="M0,18 H60" stroke="#FDCE12" stroke-width="5" />
          {/* Yellow Y fork following the triangle edges */}
          <path d="M2,2 L30,18 L2,34" fill="none" stroke="#000" stroke-width="9" strokeLinejoin="round" />
          <path d="M2,4 L27,18 L2,32" fill="none" stroke="#FDCE12" stroke-width="4" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }

  // en → Union Jack
  const clipId = `uj-${rawId}`;
  return (
    <span className={wrapperClass} aria-hidden>
      <svg viewBox="0 0 60 30" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
        <clipPath id={clipId}>
          <path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" />
        </clipPath>
        <rect width="60" height="30" fill="#012169" />
        <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
        <path d="M0,0 L60,30 M60,0 L0,30" clipPath={`url(#${clipId})`} stroke="#C8102E" strokeWidth="4" />
        <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
        <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
      </svg>
    </span>
  );
};

export default LanguageFlag;
