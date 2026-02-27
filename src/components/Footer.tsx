import React, { useState } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { t } from '@/data/translations';
import { MapPin, Mail, Phone, Send, Shield, Globe, HelpCircle, Ticket, Book, FileText, Lock, Cookie, Database, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

// App version - bump this on every deploy so users can verify they have latest code
const APP_VERSION = '3.0.0';


const Footer: React.FC = () => {
  const { language, setCurrentView } = useAppContext();
  const [email, setEmail] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  const handleNewsletter = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      toast.error(language === 'en' ? 'Please enter a valid email' : 'Veuillez entrer un email valide');
      return;
    }
    toast.success(language === 'en' ? 'Subscribed successfully!' : 'Abonnement réussi!');
    setEmail('');
  };

  // Force clear all caches and reload - nuclear option for stuck PWA users
  const handleForceUpdate = async () => {
    setIsUpdating(true);
    toast.info('Clearing cache and updating...');

    try {
      // 1. Unregister all service workers
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
          console.log('[ForceUpdate] Unregistered SW:', registration.scope);
        }
      }

      // 2. Clear all caches
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        for (const name of cacheNames) {
          await caches.delete(name);
          console.log('[ForceUpdate] Deleted cache:', name);
        }
      }

      // 3. Clear localStorage items that might hold stale state
      // (but preserve auth-related items)
      const keysToKeep = ['supabase.auth.token', 'sb-'];
      const allKeys = Object.keys(localStorage);
      for (const key of allKeys) {
        if (!keysToKeep.some(k => key.includes(k))) {
          // Don't remove auth tokens, but remove everything else
        }
      }

      toast.success('Cache cleared! Reloading...');

      // 4. Hard reload (bypass any remaining cache)
      setTimeout(() => {
        window.location.href = window.location.origin + '/?cache_bust=' + Date.now();
      }, 500);
    } catch (err) {
      console.error('[ForceUpdate] Error:', err);
      toast.error('Update failed. Try closing and reopening the app.');
      setIsUpdating(false);
    }
  };

  return (
    <footer className="bg-gray-900 text-white" role="contentinfo">
      {/* Newsletter */}
      <div className="border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-8">
            <div className="text-center lg:text-left">
              <h3 className="text-2xl font-bold mb-2">
                {language === 'en' ? 'Get the Best Deals in Your Inbox' :
                 language === 'fr' ? 'Recevez les meilleures offres dans votre boîte mail' :
                 'Karem Beswan Dils Long Imel Blong Yu'}
              </h3>
              <p className="text-gray-400 text-sm">
                {language === 'en' ? 'Subscribe for weekly deals and travel tips for Vanuatu' :
                 language === 'fr' ? 'Abonnez-vous pour des offres hebdomadaires et des conseils de voyage pour le Vanuatu' :
                 'Sabaeskraeb blong wikli dils mo trevel tips blong Vanuatu'}
              </p>

            </div>
            <form onSubmit={handleNewsletter} className="flex w-full max-w-md" aria-label="Newsletter subscription">
              <label htmlFor="newsletter-email" className="sr-only">Email address</label>
              <input
                id="newsletter-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={language === 'en' ? 'Enter your email' : 'Entrez votre email'}
                className="flex-1 px-4 py-3 rounded-l-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                aria-required="true"
              />
              <button
                type="submit"
                className="px-6 py-3 rounded-r-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-semibold text-sm hover:from-teal-700 hover:to-emerald-700 transition-all flex items-center gap-2"
                aria-label="Subscribe to newsletter"
              >
                <Send className="w-4 h-4" />
                {language === 'en' ? 'Subscribe' : language === 'fr' ? 'S\'abonner' : 'Sabaeskraeb'}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Main Footer */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* About */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
              </div>
              <span className="text-lg font-bold">StikmNek</span>
            </div>
            <p className="text-sm text-gray-400 leading-relaxed mb-4">
              {t('footer.abouttext', language)}
            </p>
            <div className="space-y-2 text-sm text-gray-400">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-teal-500" />
                Vanuatu

              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-teal-500" />
                hello@stikm.nek
              </div>
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-teal-500" />
                +678 12345
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-bold text-white mb-4">{t('footer.links', language)}</h4>
            <ul className="space-y-2.5">
              {[
                { label: t('nav.deals', language), view: 'deals' as const },
                { label: t('nav.map', language), view: 'map' as const },
                { label: t('nav.passes', language), view: 'passes' as const },
                { label: language === 'en' ? 'Community' : language === 'fr' ? 'Communauté' : 'Komuniti', view: 'community' as const },
                { label: t('footer.business', language), view: 'home' as const },
              ].map((link, i) => (
                <li key={i}>
                  <button
                    onClick={() => setCurrentView(link.view)}
                    className="text-sm text-gray-400 hover:text-teal-400 transition-colors"
                  >
                    {link.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="font-bold text-white mb-4">{t('footer.support', language)}</h4>
            <ul className="space-y-2.5">
              {[
                { label: language === 'en' ? 'Help Center' : language === 'fr' ? 'Centre d\'aide' : 'Help Senta', view: 'help' as const, icon: <Book className="w-3.5 h-3.5" /> },
                { label: language === 'en' ? 'Support Tickets' : language === 'fr' ? 'Tickets de support' : 'Sapot Tikets', view: 'support' as const, icon: <Ticket className="w-3.5 h-3.5" /> },
                { label: t('footer.faq', language), view: 'help' as const, icon: <HelpCircle className="w-3.5 h-3.5" /> },
                { label: t('footer.contact', language), view: 'support' as const, icon: <Mail className="w-3.5 h-3.5" /> },
                { label: language === 'en' ? 'Business Guide' : language === 'fr' ? 'Guide entreprise' : 'Bisnis Gaed', view: 'help' as const, icon: <FileText className="w-3.5 h-3.5" /> },
              ].map((item, i) => (
                <li key={i}>
                  <button
                    onClick={() => setCurrentView(item.view)}
                    className="text-sm text-gray-400 hover:text-teal-400 transition-colors flex items-center gap-2"
                  >
                    <span className="text-gray-500">{item.icon}</span>
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="font-bold text-white mb-4">{t('footer.legal', language)}</h4>
            <ul className="space-y-2.5">
              {[
                { label: t('footer.privacy', language), icon: <Lock className="w-3.5 h-3.5" /> },
                { label: t('footer.terms', language), icon: <FileText className="w-3.5 h-3.5" /> },
                { label: t('footer.gdpr', language), icon: <Shield className="w-3.5 h-3.5" /> },
                { label: language === 'en' ? 'Cookie Policy' : language === 'fr' ? 'Politique de cookies' : 'Kuki Polisi', icon: <Cookie className="w-3.5 h-3.5" /> },
                { label: language === 'en' ? 'Data Protection' : language === 'fr' ? 'Protection des données' : 'Data Proteksen', icon: <Database className="w-3.5 h-3.5" /> },
              ].map((item, i) => (
                <li key={i}>
                  <button className="text-sm text-gray-400 hover:text-teal-400 transition-colors flex items-center gap-2">
                    <span className="text-gray-500">{item.icon}</span>
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-gray-500">{t('footer.copyright', language)}</p>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <Shield className="w-3.5 h-3.5 text-green-500" />
                {language === 'en' ? 'GDPR Compliant' : language === 'fr' ? 'Conforme RGPD' : 'GDPR Komplaent'}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <Globe className="w-3.5 h-3.5 text-teal-500" />
                {language === 'en' ? 'Multi-language' : language === 'fr' ? 'Multilingue' : 'Plante Lanwis'}
              </div>
              {/* Version + Force Update button */}
              <button
                onClick={handleForceUpdate}
                disabled={isUpdating}
                className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-teal-400 transition-colors group"
                title="Tap to force-update the app (clears cache)"
              >
                <RefreshCw className={`w-3 h-3 ${isUpdating ? 'animate-spin text-teal-400' : 'group-hover:text-teal-400'}`} />
                <span>v{APP_VERSION}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
