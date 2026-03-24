import React, { useEffect, useState } from 'react';
import { Globe } from 'lucide-react';
import { displayWebsiteForInput, normalizeWebsiteForStorage } from '@/lib/urlHelpers';

interface WebsiteUrlInputProps {
  id?: string;
  website: string;
  onWebsiteChange: (value: string) => void;
  language?: string;
  className?: string;
}

/**
 * Website field without forcing "https://" in the editable part — prefix is shown visually;
 * stored value is normalized to a full https URL on blur.
 */
const WebsiteUrlInput: React.FC<WebsiteUrlInputProps> = ({
  id = 'business-website',
  website,
  onWebsiteChange,
  language = 'en',
  className = '',
}) => {
  const [draft, setDraft] = useState(() => displayWebsiteForInput(website));

  useEffect(() => {
    setDraft(displayWebsiteForInput(website));
  }, [website]);

  return (
    <div className={className}>
      <label htmlFor={id} className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1.5">
        <Globe className="w-3 h-3 text-blue-500" />
        {language === 'en' ? 'Website' : language === 'fr' ? 'Site Web' : 'Website'}
      </label>
      <div className="flex rounded-xl border border-gray-200 bg-white overflow-hidden focus-within:ring-2 focus-within:ring-purple-500">
        <span
          className="shrink-0 px-2.5 py-2.5 text-xs text-gray-400 bg-gray-50 border-r border-gray-200 select-none flex items-center"
          aria-hidden
        >
          https://
        </span>
        <input
          id={id}
          type="text"
          inputMode="url"
          autoComplete="url"
          value={draft}
          onChange={(e) => {
            const v = e.target.value;
            setDraft(v);
            onWebsiteChange(v);
          }}
          onBlur={() => {
            const n = normalizeWebsiteForStorage(draft);
            if (n) onWebsiteChange(n);
            else if (!draft.trim()) onWebsiteChange('');
          }}
          className="flex-1 min-w-0 px-3 py-2.5 text-sm border-0 focus:outline-none focus:ring-0 bg-white"
          placeholder={language === 'en' ? 'www.yourbusiness.com' : 'www.votresite.com'}
        />
      </div>
      <p className="text-[10px] text-gray-400 mt-0.5">
        {language === 'en'
          ? 'Your website or social page — no need to type https'
          : language === 'fr'
          ? 'Votre site ou page sociale — pas besoin de taper https'
          : 'Website blong yu — no nid taep https'}
      </p>
    </div>
  );
};

export default WebsiteUrlInput;
