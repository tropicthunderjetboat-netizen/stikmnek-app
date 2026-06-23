import React from 'react';
import { useAppContext } from '@/contexts/AppContext';
import type { Language } from '@/data/translations';

const OPTIONS: { code: Language; label: string; flag: string }[] = [
  { code: 'en', label: 'EN', flag: '🇬🇧' },
  { code: 'fr', label: 'FR', flag: '🇫🇷' },
  { code: 'bi', label: 'BI', flag: '🇻🇺' },
];

/**
 * Compact in-flow language switcher for the onboarding wizards, so owners can
 * switch into Bislama right where they're working instead of hunting for the navbar.
 */
const WizardLanguageToggle: React.FC<{ className?: string }> = ({ className }) => {
  const { language, setLanguage } = useAppContext();
  return (
    <div
      className={`inline-flex items-center gap-1 rounded-full bg-gray-100 p-1 ${className ?? ''}`}
      role="group"
      aria-label="Language"
    >
      {OPTIONS.map((o) => (
        <button
          key={o.code}
          type="button"
          onClick={() => setLanguage(o.code)}
          aria-pressed={language === o.code}
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold transition-colors ${
            language === o.code
              ? 'bg-white text-teal-700 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <span aria-hidden>{o.flag}</span>
          {o.label}
        </button>
      ))}
    </div>
  );
};

export default WizardLanguageToggle;
