import React, { useState } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { absoluteBusinessProfileUrl } from '@/lib/businessProfileUrl';
import BusinessProfileLogo from '@/components/BusinessProfileLogo';
import {
  ScanLine, Edit3, Link2, Share2, ChevronDown, ChevronUp,
  BarChart3, MessageSquare, Image, Plus, ClipboardList,
  ShieldCheck, Building2, Mail, CheckCircle,
} from 'lucide-react';

interface ListingOption {
  id: string;
  name: string;
  image?: string;
  isProfileRow?: boolean;
}

interface BusinessSimpleHubProps {
  /** Company / trading name from the master `businesses` profile row. */
  profileCompanyName: string;
  profileLogoUrl?: string | null;
  profileBusinessId: string;
  listingOptions: ListingOption[];
  selectedListingId: string;
  onSelectListing: (id: string) => void;
  reviewCount: number;
  submissionBadge?: string;
  hasBusinessProfile: boolean;
  onOpenScanner: () => void;
  onSwitchTab: (tab: string) => void;
}

const BusinessSimpleHub: React.FC<BusinessSimpleHubProps> = ({
  profileCompanyName,
  profileLogoUrl,
  profileBusinessId,
  listingOptions,
  selectedListingId,
  onSelectListing,
  reviewCount,
  submissionBadge,
  hasBusinessProfile,
  onOpenScanner,
  onSwitchTab,
}) => {
  const { language, user } = useAppContext();
  const [moreOpen, setMoreOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const businessPageUrl = profileBusinessId
    ? absoluteBusinessProfileUrl({ id: profileBusinessId, name: profileCompanyName })
    : '';

  const t = (en: string, fr: string, bi: string) =>
    language === 'en' ? en : language === 'fr' ? fr : bi;

  const handleCopyLink = async () => {
    if (!businessPageUrl) return;
    try {
      await navigator.clipboard.writeText(businessPageUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* clipboard may fail on insecure context */
    }
  };

  const handleNativeShare = async () => {
    if (!businessPageUrl) return;
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: profileCompanyName,
          text: t(
            'See all our StikmNek deals!',
            'Découvrez toutes nos offres StikmNek !',
            'Lukim ol dil blong mifala long StikmNek!',
          ),
          url: businessPageUrl,
        });
        return;
      } catch {
        /* user cancelled or share failed */
      }
    }
    await handleCopyLink();
  };

  const moreActions = [
    {
      key: 'analytics',
      label: t('Analytics', 'Statistiques', 'Analitiks'),
      icon: <BarChart3 className="w-5 h-5" />,
      color: 'text-rose-600 bg-rose-50',
    },
    {
      key: 'reviews',
      label: t('Reviews', 'Avis', 'Riviu'),
      icon: <MessageSquare className="w-5 h-5" />,
      color: 'text-amber-600 bg-amber-50',
      badge: reviewCount > 0 ? String(reviewCount) : undefined,
    },
    {
      key: 'photos',
      label: t('Photos', 'Photos', 'Foto'),
      icon: <Image className="w-5 h-5" />,
      color: 'text-purple-600 bg-purple-50',
    },
    {
      key: 'submissions',
      label: t('My Submissions', 'Mes soumissions', 'Ol sapmisen blong mi'),
      icon: <ClipboardList className="w-5 h-5" />,
      color: 'text-slate-600 bg-slate-50',
      badge: submissionBadge,
    },
    ...(hasBusinessProfile
      ? [
          {
            key: 'profile',
            label: t('Business Profile', 'Profil entreprise', 'Bisnis profael'),
            icon: <Building2 className="w-5 h-5" />,
            color: 'text-cyan-600 bg-cyan-50',
          },
          {
            key: 'credentials',
            label: t('Credentials', 'Accréditations', 'Kredensel'),
            icon: <ShieldCheck className="w-5 h-5" />,
            color: 'text-violet-600 bg-violet-50',
          },
        ]
      : []),
    {
      key: 'emails',
      label: t('Emails', 'E-mails', 'Imel'),
      icon: <Mail className="w-5 h-5" />,
      color: 'text-blue-600 bg-blue-50',
    },
    {
      key: 'submit',
      label: t('New Listing', 'Nouvelle annonce', 'Niufala listing'),
      icon: <Plus className="w-5 h-5" />,
      color: 'text-teal-600 bg-teal-50',
    },
  ];

  const showListingPicker = listingOptions.filter((l) => !l.isProfileRow).length > 1;
  const scanListingOptions = listingOptions.filter((l) => !l.isProfileRow);

  return (
    <div className="mx-auto max-w-lg space-y-5">
      {/* Profile header — company logo + greeting + business name */}
      <div className="rounded-2xl border border-teal-100 bg-white px-5 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          <BusinessProfileLogo
            src={profileLogoUrl}
            alt={profileCompanyName}
            variant="sidebar"
            className="h-12 w-12 shrink-0 rounded-xl shadow-md shadow-teal-200/40"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-extrabold text-gray-900">
              {user?.name
                ? t(`Hi, ${user.name.split(' ')[0]}`, `Bonjour, ${user.name.split(' ')[0]}`, `Halo, ${user.name.split(' ')[0]}`)
                : t('Welcome', 'Bienvenue', 'Welkam')}
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-medium text-gray-600">{profileCompanyName}</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
                {t('Live', 'En ligne', 'Live')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Hero: Scan QR — first action after header */}
      <button
        type="button"
        onClick={onOpenScanner}
        className="group relative w-full overflow-hidden rounded-3xl bg-gradient-to-br from-teal-600 via-emerald-600 to-teal-700 p-6 text-left text-white shadow-xl shadow-teal-300/40 transition-all active:scale-[0.98] hover:shadow-2xl hover:shadow-teal-400/50 sm:p-8"
      >
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10" />
        <div className="absolute -bottom-6 -left-6 h-24 w-24 rounded-full bg-white/5" />
        <div className="relative flex items-center gap-5">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-white/25 bg-white/20 shadow-lg backdrop-blur-sm transition-transform group-hover:scale-105">
            <ScanLine className="h-9 w-9" strokeWidth={2.25} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-widest text-white/70">
              {t('Tap to start', 'Appuyez pour commencer', 'Jusum blong stat')}
            </p>
            <h2 className="mt-1 text-2xl font-extrabold leading-tight sm:text-3xl">
              {t('Scan QR Code', 'Scanner le QR', 'Skanem QR Kod')}
            </h2>
            <p className="mt-1.5 text-sm text-white/75">
              {t(
                'Point your camera at a tourist\'s pass',
                'Pointez la caméra vers le pass du touriste',
                'Pointem kamera long pas blong turis',
              )}
            </p>
          </div>
        </div>
      </button>

      {/* Copy / share business page (all listings) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={handleCopyLink}
          disabled={!businessPageUrl}
          className="flex min-h-[56px] items-center justify-center gap-3 rounded-2xl border-2 border-teal-200 bg-white px-5 py-4 font-bold text-teal-800 shadow-sm transition-all hover:border-teal-300 hover:bg-teal-50 active:scale-[0.98] disabled:opacity-50"
        >
          {copied ? (
            <>
              <CheckCircle className="h-6 w-6 text-green-600" />
              <span className="text-green-700">{t('Copied!', 'Copié !', 'Kopim!')}</span>
            </>
          ) : (
            <>
              <Link2 className="h-6 w-6 text-teal-600" />
              <span>{t('Copy business page', 'Copier la page', 'Kopim business pej')}</span>
            </>
          )}
        </button>
        {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
          <button
            type="button"
            onClick={handleNativeShare}
            disabled={!businessPageUrl}
            className="flex min-h-[56px] items-center justify-center gap-3 rounded-2xl border border-gray-200 bg-white px-5 py-4 font-bold text-gray-800 shadow-sm transition-all hover:border-gray-300 hover:bg-gray-50 active:scale-[0.98] disabled:opacity-50"
          >
            <Share2 className="h-6 w-6 text-gray-600" />
            <span>{t('Share', 'Partager', 'Serem')}</span>
          </button>
        )}
      </div>
      {copied && (
        <p className="-mt-2 text-center text-xs text-gray-500">
          {t(
            'Paste in Facebook comments — tourists see all your deals',
            'Collez dans les commentaires Facebook — les touristes voient toutes vos offres',
            'Pastem long Facebook — turis i lukim ol dil blong yu',
          )}
        </p>
      )}

      {/* Edit listing */}
      <button
        type="button"
        onClick={() => onSwitchTab('edit')}
        className="flex w-full min-h-[56px] items-center gap-4 rounded-2xl border border-gray-200 bg-white px-5 py-4 text-left shadow-sm transition-all hover:border-blue-200 hover:shadow-md active:scale-[0.98]"
      >
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md shadow-blue-200/50">
          <Edit3 className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-gray-900">{t('Edit listing', 'Modifier l\'annonce', 'Editim listing')}</p>
          <p className="text-xs text-gray-500">
            {t('Update photos, prices, or your deal', 'Photos, prix ou offre', 'Apdeitem foto, praes mo dil')}
          </p>
        </div>
      </button>

      {/* Which listing — for scanning when owner has multiple deals */}
      {showListingPicker && (
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <label
            htmlFor="simple-hub-listing"
            className="mb-2 block text-[11px] font-bold uppercase tracking-wide text-gray-500"
          >
            {t('Which listing to scan?', 'Quelle annonce scanner ?', 'Wan listing blong skanem?')}
          </label>
          <div className="relative">
            <select
              id="simple-hub-listing"
              value={selectedListingId}
              onChange={(e) => onSelectListing(e.target.value)}
              className="w-full min-h-[48px] appearance-none rounded-xl border border-gray-200 bg-white px-4 py-3.5 pr-11 text-base font-semibold text-gray-900 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {scanListingOptions.map((l) => (
                <option key={l.id} value={l.id}>
                  {(l.name || 'Listing').trim()}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" aria-hidden />
          </div>
          <p className="mt-2 text-xs text-gray-500">
            {t(
              'Only needed when scanning — your shared link shows all deals',
              'Uniquement pour le scan — votre lien partagé montre toutes les offres',
              'Blong skanem nomo — link blong yu i soem ol dil',
            )}
          </p>
        </div>
      )}

      {/* More options */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          className="flex w-full min-h-[48px] items-center justify-between px-5 py-4 text-left"
          aria-expanded={moreOpen}
        >
          <span className="text-sm font-semibold text-gray-600">
            {t('More options', 'Plus d\'options', 'Mo opsen')}
          </span>
          {moreOpen ? (
            <ChevronUp className="h-5 w-5 text-gray-400" />
          ) : (
            <ChevronDown className="h-5 w-5 text-gray-400" />
          )}
        </button>
        {moreOpen && (
          <div className="grid grid-cols-2 gap-2 border-t border-gray-100 p-3 sm:grid-cols-3">
            {moreActions.map((action) => (
              <button
                key={action.key}
                type="button"
                onClick={() => onSwitchTab(action.key)}
                className="relative flex flex-col items-center gap-2 rounded-xl border border-gray-100 p-3 text-center transition-colors hover:bg-gray-50 active:scale-[0.98]"
              >
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${action.color}`}>
                  {action.icon}
                </div>
                <span className="text-[11px] font-semibold leading-tight text-gray-700">{action.label}</span>
                {action.badge && (
                  <span className="absolute right-2 top-2 rounded-full bg-orange-100 px-1.5 py-0.5 text-[9px] font-bold text-orange-700">
                    {action.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default BusinessSimpleHub;
