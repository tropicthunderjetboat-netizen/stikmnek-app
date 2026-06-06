import React, { useState, useEffect } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { Shield } from 'lucide-react';
import { analytics } from '@/lib/analytics';

const CookieConsent: React.FC = () => {
  const { language } = useAppContext();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('stikm-cookie-consent');
    if (!consent) {
      const timer = setTimeout(() => setVisible(true), 2000);
      return () => clearTimeout(timer);
    }
  }, []);

  const resolveConsent = (value: 'accepted' | 'declined') => {
    localStorage.setItem('stikm-cookie-consent', value);
    window.dispatchEvent(new CustomEvent('stikmnek-cookie-consent-set'));
    setVisible(false);
  };

  const handleAccept = () => {
    analytics.onConsentAccepted();
    resolveConsent('accepted');
  };

  const handleDecline = () => {
    analytics.onConsentDeclined();
    resolveConsent('declined');
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[90] p-4">
      <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-2xl border border-gray-200 p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex items-start gap-3 flex-1">
            <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center shrink-0">
              <Shield className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <h4 className="font-bold text-gray-900 text-sm mb-1">
                {language === 'en' ? 'We value your privacy' : language === 'fr' ? 'Nous respectons votre vie privée' : 'Mifala i respektem praevesi blong yu'}
              </h4>
              <p className="text-xs text-gray-500 leading-relaxed">
                {language === 'en'
                  ? 'We use cookies and analytics to enhance your experience, provide personalized deals, and analyze traffic. By clicking "Accept", you consent to our use of cookies and Google Analytics tracking in accordance with GDPR.'
                  : language === 'fr'
                  ? 'Nous utilisons des cookies et des analyses pour améliorer votre expérience, fournir des offres personnalisées et analyser le trafic. En cliquant sur "Accepter", vous consentez à notre utilisation des cookies et du suivi Google Analytics conformément au RGPD.'
                  : 'Mifala i yusim kukis mo analytics blong mekem eksperiens blong yu i moa gud. Taem yu klikim "Akseptim", yu agri long yus blong kukis mo Google Analytics.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
            <button
              onClick={handleDecline}
              className="flex-1 sm:flex-none px-4 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              {language === 'en' ? 'Decline' : language === 'fr' ? 'Refuser' : 'Refusim'}
            </button>
            <button
              onClick={handleAccept}
              className="flex-1 sm:flex-none px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 transition-colors"
            >
              {language === 'en' ? 'Accept' : language === 'fr' ? 'Accepter' : 'Akseptim'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CookieConsent;
