import React, { useId } from 'react';

export type FlagCode = 'en' | 'fr' | 'bi';

/**
 * Inline SVG flags for the language switcher.
 *
 * We previously used emoji flags, but Windows ships no flag-emoji glyphs, so
 * desktop Chrome/Edge render the bare region letters ("GB", "FR", "VU") instead.
 * These SVGs render identically on every OS.
 *
 * All flags use a 3:2 viewBox and fill the 3:2 tile exactly (no cropping).
 *
 * - en → United Kingdom (Union Jack)
 * - fr → France (tricolore)
 * - bi → Bislama / Vanuatu
 */
const LanguageFlag: React.FC<{ code: FlagCode; className?: string }> = ({ code, className }) => {
  const rawId = useId().replace(/[:]/g, '');
  const wrapperClass = `inline-block w-[18px] h-[12px] rounded-[3px] overflow-hidden ring-1 ring-black/10 shadow-sm shrink-0 ${className ?? ''}`;

  if (code === 'fr') {
    return (
      <span className={wrapperClass} aria-hidden>
        <svg viewBox="0 0 3 2" className="w-full h-full" preserveAspectRatio="none">
          <rect width="3" height="2" fill="#fff" />
          <rect width="1" height="2" fill="#0055A4" />
          <rect x="2" width="1" height="2" fill="#EF4135" />
        </svg>
      </span>
    );
  }

  if (code === 'bi') {
    // Vanuatu: red over green, black triangle at the hoist, yellow Y (fimbriated black),
    // with the boar's-tusk ring + crossed namele fern emblem inside the triangle.
    return (
      <span className={wrapperClass} aria-hidden>
        <svg viewBox="0 0 540 360" className="w-full h-full" preserveAspectRatio="none">
          <rect width="540" height="180" fill="#D21034" />
          <rect y="180" width="540" height="180" fill="#009543" />
          {/* Black triangle at the hoist */}
          <path d="M0,0 L228,180 L0,360 Z" fill="#000" />
          <g fill="none" strokeLinejoin="round" strokeLinecap="butt">
            {/* black fimbriation of the Y */}
            <path d="M0,0 L228,180 L0,360 M212,180 L540,180" stroke="#000" strokeWidth="56" />
            {/* yellow Y */}
            <path d="M0,0 L228,180 L0,360 M212,180 L540,180" stroke="#FDCE12" strokeWidth="30" />
          </g>
          {/* Emblem: boar's tusk ring + crossed namele ferns (concentric at the group origin) */}
          <g transform="translate(96,180)">
            <path
              d="M 50.8,-35.6 A 62,62 0 1 0 50.8,35.6"
              fill="none"
              stroke="#FDCE12"
              strokeWidth="13"
              strokeLinecap="round"
            />
            <g fill="#FDCE12">
              <ellipse cx="0" cy="0" rx="50" ry="8" transform="rotate(40)" />
              <ellipse cx="0" cy="0" rx="50" ry="8" transform="rotate(-40)" />
            </g>
          </g>
        </svg>
      </span>
    );
  }

  // en → Union Jack (3:2 tile)
  const clipId = `uj-${rawId}`;
  return (
    <span className={wrapperClass} aria-hidden>
      <svg viewBox="0 0 36 24" className="w-full h-full" preserveAspectRatio="none">
        <clipPath id={clipId}>
          <path d="M18,12 h18 v12 z v12 h-18 z h-18 v-12 z v-12 h18 z" />
        </clipPath>
        <rect width="36" height="24" fill="#012169" />
        <path d="M0,0 L36,24 M36,0 L0,24" stroke="#fff" strokeWidth="4.8" />
        <path d="M0,0 L36,24 M36,0 L0,24" clipPath={`url(#${clipId})`} stroke="#C8102E" strokeWidth="3.2" />
        <path d="M18,0 v24 M0,12 h36" stroke="#fff" strokeWidth="8" />
        <path d="M18,0 v24 M0,12 h36" stroke="#C8102E" strokeWidth="4.8" />
      </svg>
    </span>
  );
};

export default LanguageFlag;
