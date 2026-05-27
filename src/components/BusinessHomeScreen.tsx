import React from 'react';
import { useAppContext } from '@/contexts/AppContext';
import {
  ScanLine, Edit3, Plus, MessageSquare, Home, BarChart3,
  Store, Sparkles, ArrowRight, Wifi, Clock, CheckCircle,
  Star, Users, TrendingUp, Zap, ShieldCheck
} from 'lucide-react';

interface BusinessHomeScreenProps {
  selectedBusiness: any | null;
  hasApprovedBusinesses: boolean;
  hasBusinessProfile?: boolean;
  pendingCount: number;
  reviewCount: number;
  onSwitchTab: (tab: string) => void;
  onOpenScanner: () => void;
}


const BusinessHomeScreen: React.FC<BusinessHomeScreenProps> = ({
  selectedBusiness,
  hasApprovedBusinesses,
  hasBusinessProfile = false,
  pendingCount,
  reviewCount,
  onSwitchTab,
  onOpenScanner,
}) => {
  const { user, setCurrentView, language } = useAppContext();

  const openCredentials = () => {
    window.dispatchEvent(new CustomEvent('switch-dashboard-tab', { detail: { tab: 'credentials' } }));
  };

  const mainActions = [
    {
      key: 'scan',
      label: language === 'en' ? 'Scan a Pass' : language === 'fr' ? 'Scanner un Pass' : 'Skanem wan Pas',
      description: language === 'en' ? 'Scan tourist QR codes to verify and redeem discounts' : language === 'fr' ? 'Scannez les codes QR des touristes' : 'Skanem QR kod blong turis',
      icon: <ScanLine className="w-7 h-7" />,
      gradient: 'from-teal-500 to-emerald-600',
      shadow: 'shadow-teal-200/60',
      bgHover: 'hover:shadow-teal-300/60',
      onClick: onOpenScanner,
      badge: null,
      disabled: !hasApprovedBusinesses,
      disabledMsg: 'Available after listing approval',
    },
    {
      key: 'edit',
      label: language === 'en' ? 'Edit my Listing' : language === 'fr' ? 'Modifier mon annonce' : 'Editim Listing Blong Mi',
      description: language === 'en' ? 'Update your business details, photos, and deals' : language === 'fr' ? 'Mettez à jour vos détails' : 'Apdeitim ditel blong bisnis blong yu',
      icon: <Edit3 className="w-7 h-7" />,
      gradient: 'from-blue-500 to-indigo-600',
      shadow: 'shadow-blue-200/60',
      bgHover: 'hover:shadow-blue-300/60',
      onClick: () => onSwitchTab('edit'),
      badge: null,
      disabled: !hasApprovedBusinesses,
      disabledMsg: 'Available after listing approval',
    },
    ...(hasBusinessProfile
      ? [
          {
            key: 'credentials',
            label: language === 'en' ? 'Credentials' : language === 'fr' ? 'Accréditations' : 'Kredensel',
            description:
              language === 'en'
                ? 'Upload licence, insurance, and permits'
                : language === 'fr'
                  ? 'Téléversez licence, assurance et permis'
                  : 'Uploadem permit mo insurance',
            icon: <ShieldCheck className="w-7 h-7" />,
            gradient: 'from-violet-500 to-indigo-600',
            shadow: 'shadow-violet-200/60',
            bgHover: 'hover:shadow-violet-300/60',
            onClick: openCredentials,
            badge: null,
            disabled: false,
            disabledMsg: '',
          },
        ]
      : []),
    {
      key: 'create',
      label: language === 'en' ? 'Create a New Listing' : language === 'fr' ? 'Créer une annonce' : 'Mekem Niufala Listing',
      description: language === 'en' ? 'Submit a new business listing for approval' : language === 'fr' ? 'Soumettre une nouvelle annonce' : 'Sakem niufala bisnis listing',
      icon: <Plus className="w-7 h-7" />,
      gradient: 'from-purple-500 to-violet-600',
      shadow: 'shadow-purple-200/60',
      bgHover: 'hover:shadow-purple-300/60',
      onClick: () => onSwitchTab('submit'),
      badge: pendingCount > 0 ? `${pendingCount} pending` : null,
      disabled: false,
      disabledMsg: '',
    },
    {
      key: 'reviews',
      label: language === 'en' ? 'My Reviews' : language === 'fr' ? 'Mes Avis' : 'Riviu Blong Mi',
      description: language === 'en' ? 'Read and respond to customer reviews' : language === 'fr' ? 'Lire et répondre aux avis' : 'Ridim mo ansarem riviu',
      icon: <MessageSquare className="w-7 h-7" />,
      gradient: 'from-amber-500 to-orange-600',
      shadow: 'shadow-amber-200/60',
      bgHover: 'hover:shadow-amber-300/60',
      onClick: () => onSwitchTab('reviews'),
      badge: reviewCount > 0 ? `${reviewCount}` : null,
      disabled: !hasApprovedBusinesses,
      disabledMsg: 'Available after listing approval',
    },
    {
      key: 'home',
      label: language === 'en' ? 'Home' : language === 'fr' ? 'Accueil' : 'Hom',
      description: language === 'en' ? 'Return to the main StikmNek app' : language === 'fr' ? 'Retourner à l\'app principale' : 'Go bak long main app',
      icon: <Home className="w-7 h-7" />,
      gradient: 'from-slate-500 to-gray-700',
      shadow: 'shadow-gray-200/60',
      bgHover: 'hover:shadow-gray-300/60',
      onClick: () => setCurrentView('home'),
      badge: null,
      disabled: false,
      disabledMsg: '',
    },
    {
      key: 'stats',
      label: language === 'en' ? 'Stats' : language === 'fr' ? 'Statistiques' : 'Stat',
      description: language === 'en' ? 'View your business analytics and performance' : language === 'fr' ? 'Voir vos analyses et performances' : 'Lukim analitiks mo pefomans',
      icon: <BarChart3 className="w-7 h-7" />,
      gradient: 'from-rose-500 to-pink-600',
      shadow: 'shadow-rose-200/60',
      bgHover: 'hover:shadow-rose-300/60',
      onClick: () => onSwitchTab('analytics'),
      badge: null,
      disabled: !hasApprovedBusinesses,
      disabledMsg: 'Available after listing approval',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <div className="bg-gradient-to-br from-teal-600 via-emerald-600 to-teal-700 rounded-3xl p-6 sm:p-8 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-32 translate-x-32" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-24 -translate-x-24" />
        <div className="relative">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center border border-white/20">
              <Store className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold">
                {language === 'en' ? 'Welcome back' : language === 'fr' ? 'Bienvenue' : 'Welkam bak'}
                {user?.name ? `, ${user.name.split(' ')[0]}` : ''}!
              </h1>
              <p className="text-white/70 text-sm mt-0.5">
                {language === 'en' ? 'Manage your business from here' : language === 'fr' ? 'Gérez votre entreprise ici' : 'Managem bisnis blong yu long hia'}
              </p>
            </div>
          </div>

          {/* Quick stats row */}
          {selectedBusiness && (
            <div className="flex flex-wrap items-center gap-3 mt-4">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/15 backdrop-blur-sm border border-white/10">
                <Store className="w-4 h-4 text-white/80" />
                <span className="text-sm font-semibold truncate max-w-[180px]">{selectedBusiness.name}</span>
              </div>
              {selectedBusiness._status === 'approved' && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-green-500/20 border border-green-400/30">
                  <div className="w-2 h-2 rounded-full bg-green-300 animate-pulse" />
                  <span className="text-xs font-bold text-green-200">Live</span>
                </div>
              )}
              {selectedBusiness._status === 'pending' && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-yellow-500/20 border border-yellow-400/30">
                  <Clock className="w-3.5 h-3.5 text-yellow-300" />
                  <span className="text-xs font-bold text-yellow-200">Pending Review</span>
                </div>
              )}
              {selectedBusiness.rating > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/15 border border-white/10">
                  <Star className="w-3.5 h-3.5 text-yellow-300 fill-yellow-300" />
                  <span className="text-xs font-bold">{selectedBusiness.rating}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 6 Main Action Buttons Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
        {mainActions.map((action) => (
          <button
            key={action.key}
            onClick={action.disabled ? undefined : action.onClick}
            disabled={action.disabled}
            className={`group relative bg-white rounded-2xl p-6 shadow-sm border border-gray-100 text-left transition-all duration-200 ${
              action.disabled
                ? 'opacity-60 cursor-not-allowed'
                : `hover:-translate-y-1 hover:shadow-xl ${action.bgHover} active:scale-[0.98]`
            }`}
          >
            {/* Icon */}
            <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${action.gradient} flex items-center justify-center text-white mb-4 shadow-lg ${action.shadow} ${
              !action.disabled ? 'group-hover:scale-110 transition-transform duration-200' : ''
            }`}>
              {action.icon}
            </div>

            {/* Label & Description */}
            <h3 className="text-base font-bold text-gray-900 mb-1">{action.label}</h3>
            <p className="text-xs text-gray-500 leading-relaxed">
              {action.disabled ? action.disabledMsg : action.description}
            </p>

            {/* Badge */}
            {action.badge && (
              <div className="absolute top-4 right-4 px-2.5 py-1 rounded-lg bg-orange-50 border border-orange-200 text-orange-700 text-[10px] font-bold">
                {action.badge}
              </div>
            )}

            {/* Arrow indicator */}
            {!action.disabled && (
              <div className="absolute bottom-5 right-5 w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <ArrowRight className="w-4 h-4 text-gray-400" />
              </div>
            )}

            {/* Disabled overlay */}
            {action.disabled && (
              <div className="absolute top-4 right-4 px-2 py-1 rounded-lg bg-gray-100 text-gray-400 text-[10px] font-semibold flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Pending
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Quick Tips Section */}
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-2xl border border-indigo-100 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 text-sm">
              {language === 'en' ? 'Quick Tips' : language === 'fr' ? 'Conseils rapides' : 'Kwik Tips'}
            </h3>
            <p className="text-xs text-gray-500">
              {language === 'en' ? 'Get the most out of StikmNek' : language === 'fr' ? 'Tirez le meilleur parti de StikmNek' : 'Kasem moa long StikmNek'}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="flex items-start gap-3 p-3 rounded-xl bg-white/70 border border-indigo-100/50">
            <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center flex-shrink-0">
              <ScanLine className="w-4 h-4 text-teal-600" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-800">
                {language === 'en' ? 'Scan passes quickly' : 'Scannez rapidement'}
              </p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {language === 'en' ? 'Use the floating scan button at the bottom right for fast QR scanning.' : 'Utilisez le bouton flottant en bas à droite.'}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-xl bg-white/70 border border-indigo-100/50">
            <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
              <Star className="w-4 h-4 text-amber-500" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-800">
                {language === 'en' ? 'Respond to reviews' : 'Répondez aux avis'}
              </p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {language === 'en' ? 'Engaging with reviews boosts your listing visibility.' : 'Répondre aux avis améliore votre visibilité.'}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-xl bg-white/70 border border-indigo-100/50">
            <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0">
              <TrendingUp className="w-4 h-4 text-purple-600" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-800">
                {language === 'en' ? 'Track your stats' : 'Suivez vos stats'}
              </p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {language === 'en' ? 'Check analytics regularly to understand tourist engagement.' : 'Consultez les analyses pour comprendre l\'engagement.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BusinessHomeScreen;
