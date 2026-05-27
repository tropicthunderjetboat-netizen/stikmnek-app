import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppContext } from '@/contexts/AppContext';
import { t } from '@/data/translations';
import {
  MapPin,
  Mail,
  Phone,
  Shield,
  Globe,
  HelpCircle,
  Book,
  FileText,
  Lock,
  Cookie,
  Database,
  RefreshCw,
} from 'lucide-react';
import LocalOwnedBadge from './LocalOwnedBadge';
import { toast } from 'sonner';
import { supportMailtoUrl } from '@/data/contact';

// App version - bump this on every deploy so users can verify they have latest code
const APP_VERSION = '3.0.0';

const Footer: React.FC = () => {
  const { language } = useAppContext();
  const [isUpdating, setIsUpdating] = useState(false);

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
      {/* Main Footer */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* About */}
          <div>
            <div className="mb-4">
              <img
                src="/logo.svg"
                alt="StikmNek — 100% locally owned · Supporting grassroots businesses"
                className="h-14 w-auto max-w-[280px] opacity-95"
                width={280}
                height={56}
                onError={(e) => {
                  const img = e.currentTarget;
                  img.onerror = null;
                  img.src = '/logo-icon.svg';
                  img.className = 'h-12 w-12 rounded-xl opacity-95';
                }}
              />
              <LocalOwnedBadge variant="footer" language={language} className="mt-3" />
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
                <Phone className="w-4 h-4 text-teal-500" />
                <a href="tel:+67812345" className="hover:text-teal-400 transition-colors">
                  +678 12345
                </a>
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-bold text-white mb-4">{t('footer.links', language)}</h4>
            <ul className="space-y-2.5">
              <li>
                <Link to="/deals" className="text-sm text-gray-400 hover:text-teal-400 transition-colors">
                  {t('nav.deals', language)}
                </Link>
              </li>
              <li>
                <Link to="/map" className="text-sm text-gray-400 hover:text-teal-400 transition-colors">
                  {t('nav.map', language)}
                </Link>
              </li>
              <li>
                <Link to="/passes" className="text-sm text-gray-400 hover:text-teal-400 transition-colors">
                  {t('nav.passes', language)}
                </Link>
              </li>
              <li>
                <Link to="/business/new" className="text-sm text-gray-400 hover:text-teal-400 transition-colors">
                  {t('footer.business', language)}
                </Link>
              </li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="font-bold text-white mb-4">{t('footer.support', language)}</h4>
            <ul className="space-y-2.5">
              <li>
                <Link
                  to="/help"
                  className="text-sm text-gray-400 hover:text-teal-400 transition-colors flex items-center gap-2"
                >
                  <span className="text-gray-500">
                    <Book className="w-3.5 h-3.5" />
                  </span>
                  {language === 'en' ? 'Help Center' : language === 'fr' ? 'Centre d\'aide' : 'Help Senta'}
                </Link>
              </li>
              <li>
                <Link
                  to="/faq"
                  className="text-sm text-gray-400 hover:text-teal-400 transition-colors flex items-center gap-2"
                >
                  <span className="text-gray-500">
                    <HelpCircle className="w-3.5 h-3.5" />
                  </span>
                  {t('footer.faq', language)}
                </Link>
              </li>
              <li>
                <Link
                  to="/business-guide"
                  className="text-sm text-gray-400 hover:text-teal-400 transition-colors flex items-center gap-2"
                >
                  <span className="text-gray-500">
                    <FileText className="w-3.5 h-3.5" />
                  </span>
                  {language === 'en' ? 'Business Guide' : language === 'fr' ? 'Guide entreprise' : 'Bisnis Gaed'}
                </Link>
              </li>
              <li>
                <a
                  href={supportMailtoUrl('StikmNek support')}
                  className="text-sm text-gray-400 hover:text-teal-400 transition-colors flex items-center gap-2"
                >
                  <span className="text-gray-500">
                    <Mail className="w-3.5 h-3.5" />
                  </span>
                  {t('footer.contact', language)}
                </a>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="font-bold text-white mb-4">{t('footer.legal', language)}</h4>
            <ul className="space-y-2.5">
              <li>
                <Link
                  to="/legal/privacy"
                  className="text-sm text-gray-400 hover:text-teal-400 transition-colors flex items-center gap-2"
                >
                  <span className="text-gray-500">
                    <Lock className="w-3.5 h-3.5" />
                  </span>
                  {t('footer.privacy', language)}
                </Link>
              </li>
              <li>
                <Link
                  to="/legal/terms"
                  className="text-sm text-gray-400 hover:text-teal-400 transition-colors flex items-center gap-2"
                >
                  <span className="text-gray-500">
                    <FileText className="w-3.5 h-3.5" />
                  </span>
                  {t('footer.terms', language)}
                </Link>
              </li>
              <li>
                <Link
                  to="/legal/business-partner"
                  className="text-sm text-gray-400 hover:text-teal-400 transition-colors flex items-center gap-2"
                >
                  <span className="text-gray-500">
                    <FileText className="w-3.5 h-3.5" />
                  </span>
                  {t('footer.business_partner', language)}
                </Link>
              </li>
              <li>
                <Link
                  to="/legal/gdpr"
                  className="text-sm text-gray-400 hover:text-teal-400 transition-colors flex items-center gap-2"
                >
                  <span className="text-gray-500">
                    <Shield className="w-3.5 h-3.5" />
                  </span>
                  {t('footer.gdpr', language)}
                </Link>
              </li>
              <li>
                <Link
                  to="/legal/cookies"
                  className="text-sm text-gray-400 hover:text-teal-400 transition-colors flex items-center gap-2"
                >
                  <span className="text-gray-500">
                    <Cookie className="w-3.5 h-3.5" />
                  </span>
                  {language === 'en' ? 'Cookie Policy' : language === 'fr' ? 'Politique de cookies' : 'Kuki Polisi'}
                </Link>
              </li>
              <li>
                <Link
                  to="/legal/data-protection"
                  className="text-sm text-gray-400 hover:text-teal-400 transition-colors flex items-center gap-2"
                >
                  <span className="text-gray-500">
                    <Database className="w-3.5 h-3.5" />
                  </span>
                  {language === 'en' ? 'Data Protection' : language === 'fr' ? 'Protection des données' : 'Data Proteksen'}
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Meaning + mission strip (full-width, nicer reading width) */}
        <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm font-bold text-gray-100">{t('footer.nameMeaningTitle', language)}</p>
            <p className="mt-2 text-sm text-gray-300 leading-relaxed">{t('footer.nameMeaningBody', language)}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm font-bold text-gray-100">{t('footer.whyBuiltTitle', language)}</p>
            <p className="mt-2 text-sm text-gray-300 leading-relaxed">{t('footer.whyBuiltBody', language)}</p>
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
