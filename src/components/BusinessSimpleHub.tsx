import React, { useEffect, useMemo, useState } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { absoluteBusinessProfileUrl } from '@/lib/businessProfileUrl';
import BusinessProfileLogo from '@/components/BusinessProfileLogo';
import { getEdgeAuthHeaders, supabase } from '@/lib/supabase';
import {
  Edit3, Share2, ChevronDown, ChevronUp,
  BarChart3, MessageSquare, Image, Plus, ClipboardList,
  ShieldCheck, Building2, Mail, CheckCircle, Sparkles, Eye, Heart,
} from 'lucide-react';

interface ListingOption {
  id: string;
  name: string;
  image?: string;
  isProfileRow?: boolean;
  /** Discount % for the selected offer, when known */
  discountPercent?: number | null;
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
  onSwitchTab: (tab: string) => void;
  /** Pass discount shown on the selected listing */
  offerDiscountPercent?: number | null;
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
  onSwitchTab,
  offerDiscountPercent,
}) => {
  const { language, user } = useAppContext();
  const [moreOpen, setMoreOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [travelerSaves, setTravelerSaves] = useState(0);
  const [pageViews, setPageViews] = useState(0);

  const businessPageUrl = profileBusinessId
    ? absoluteBusinessProfileUrl({ id: profileBusinessId, name: profileCompanyName })
    : '';

  const tr = (en: string, fr: string) => (language === 'fr' ? fr : en);

  const selected = useMemo(
    () => listingOptions.find((l) => l.id === selectedListingId),
    [listingOptions, selectedListingId],
  );

  const discount =
    offerDiscountPercent ??
    selected?.discountPercent ??
    20;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!profileBusinessId) return;
      try {
        const headers = await getEdgeAuthHeaders();
        const offeringId =
          selectedListingId && selectedListingId !== profileBusinessId ? selectedListingId : null;
        const { data, error } = await supabase.functions.invoke('manage-business', {
          headers,
          body: {
            action: 'get_analytics',
            businessId: profileBusinessId,
            offeringId,
            rangeDays: 30,
          },
        });
        if (cancelled || error || data?.error) return;
        setTravelerSaves(Number(data?.redemptionCount) || 0);
        setPageViews(Number(data?.viewCount) || 0);
      } catch {
        /* keep zeros */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profileBusinessId, selectedListingId]);

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
          text: tr('See all our StikmNek deals!', 'Découvrez toutes nos offres StikmNek !'),
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
      label: tr('Stats', 'Stats'),
      icon: <BarChart3 className="w-5 h-5" />,
      color: 'text-rose-600 bg-rose-50',
    },
    {
      key: 'reviews',
      label: tr('Reviews', 'Avis'),
      icon: <MessageSquare className="w-5 h-5" />,
      color: 'text-amber-600 bg-amber-50',
      badge: reviewCount > 0 ? String(reviewCount) : undefined,
    },
    {
      key: 'photos',
      label: tr('Photos', 'Photos'),
      icon: <Image className="w-5 h-5" />,
      color: 'text-purple-600 bg-purple-50',
    },
    {
      key: 'submissions',
      label: tr('My Submissions', 'Mes soumissions'),
      icon: <ClipboardList className="w-5 h-5" />,
      color: 'text-slate-600 bg-slate-50',
      badge: submissionBadge,
    },
    ...(hasBusinessProfile
      ? [
          {
            key: 'profile',
            label: tr('Business Profile', 'Profil entreprise'),
            icon: <Building2 className="w-5 h-5" />,
            color: 'text-cyan-600 bg-cyan-50',
          },
          {
            key: 'credentials',
            label: tr('Credentials', 'Accréditations'),
            icon: <ShieldCheck className="w-5 h-5" />,
            color: 'text-violet-600 bg-violet-50',
          },
        ]
      : []),
    {
      key: 'emails',
      label: tr('Emails', 'E-mails'),
      icon: <Mail className="w-5 h-5" />,
      color: 'text-blue-600 bg-blue-50',
    },
    {
      key: 'submit',
      label: tr('New Listing', 'Nouvelle annonce'),
      icon: <Plus className="w-5 h-5" />,
      color: 'text-teal-600 bg-teal-50',
    },
  ];

  const showListingPicker = listingOptions.filter((l) => !l.isProfileRow).length > 1;
  const dealListingOptions = listingOptions.filter((l) => !l.isProfileRow);

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div className="rounded-2xl border border-teal-100 bg-white px-5 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          <BusinessProfileLogo
            src={profileLogoUrl}
            alt={profileCompanyName}
            variant="inline"
            className="h-14 min-w-[3.5rem] max-w-[5.5rem] shrink-0 shadow-md shadow-teal-200/30"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-extrabold text-gray-900">
              {user?.name
                ? tr(`Hi, ${user.name.split(' ')[0]}`, `Bonjour, ${user.name.split(' ')[0]}`)
                : tr('Welcome', 'Bienvenue')}
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-medium text-gray-600">{profileCompanyName}</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
                {tr('Live', 'En ligne')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Simple stats — no scanner, no charts */}
      <div className="grid grid-cols-1 gap-3">
        <div className="rounded-2xl border border-teal-100 bg-gradient-to-br from-teal-50 to-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-100 text-teal-700">
              <Heart className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-black text-gray-900 tabular-nums">{travelerSaves}</p>
              <p className="text-sm font-medium text-gray-600">
                {tr('travelers saved you', 'voyageurs vous ont sauvés')}
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50 to-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
              <Eye className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-black text-gray-900 tabular-nums">{pageViews}</p>
              <p className="text-sm font-medium text-gray-600">
                {tr('viewed your page', 'ont vu votre page')}
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 to-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-amber-900">
            {tr(
              `Your offer: Save ${Math.round(discount)}% with Pass`,
              `Votre offre : −${Math.round(discount)} % avec Pass`,
            )}
          </p>
          <p className="mt-1 text-xs text-amber-800/80">
            {tr('Listing is free forever. No scanning needed.', 'Annonce gratuite pour toujours. Pas de scan.')}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={handleCopyLink}
        disabled={!businessPageUrl}
        className={`group relative w-full overflow-hidden rounded-3xl p-5 text-left shadow-xl transition-all active:scale-[0.98] disabled:opacity-50 sm:p-6 ${
          copied
            ? 'bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-300/40'
            : 'bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 shadow-orange-300/50 hover:shadow-2xl hover:shadow-orange-400/50'
        }`}
      >
        <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-white/15" />
        <div className="relative flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/30 bg-white/20 shadow-lg backdrop-blur-sm">
            {copied ? (
              <CheckCircle className="h-8 w-8 text-white" strokeWidth={2.25} />
            ) : (
              <Sparkles className="h-7 w-7 text-white" strokeWidth={2.25} />
            )}
          </div>
          <div className="min-w-0 flex-1 text-white">
            <p className="text-[11px] font-bold uppercase tracking-widest text-white/80">
              {copied
                ? tr('Link copied!', 'Lien copié !')
                : tr('Tap to copy', 'Appuyez pour copier')}
            </p>
            <h3 className="mt-1 text-lg font-extrabold leading-snug sm:text-xl">
              {copied
                ? tr('Paste in Facebook now', 'Collez sur Facebook')
                : tr('Share all your deals on Facebook', 'Partagez toutes vos offres')}
            </h3>
          </div>
        </div>
      </button>
      {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
        <button
          type="button"
          onClick={handleNativeShare}
          disabled={!businessPageUrl}
          className="flex w-full min-h-[48px] items-center justify-center gap-2 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-bold text-orange-800 transition-all hover:bg-orange-100 active:scale-[0.98] disabled:opacity-50"
        >
          <Share2 className="h-5 w-5" />
          <span>{tr('Or share directly from your phone', 'Ou partager depuis le téléphone')}</span>
        </button>
      )}

      <button
        type="button"
        onClick={() => onSwitchTab('edit')}
        className="flex w-full min-h-[56px] items-center gap-4 rounded-2xl border border-gray-200 bg-white px-5 py-4 text-left shadow-sm transition-all hover:border-blue-200 hover:shadow-md active:scale-[0.98]"
      >
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md shadow-blue-200/50">
          <Edit3 className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-gray-900">{tr('Edit listing', "Modifier l'annonce")}</p>
          <p className="text-xs text-gray-500">
            {tr('Update photos, prices, or your deal', 'Photos, prix ou offre')}
          </p>
        </div>
      </button>

      {showListingPicker && (
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <label
            htmlFor="simple-hub-listing"
            className="mb-2 block text-[11px] font-bold uppercase tracking-wide text-gray-500"
          >
            {tr('Which listing?', 'Quelle annonce ?')}
          </label>
          <div className="relative">
            <select
              id="simple-hub-listing"
              value={selectedListingId}
              onChange={(e) => onSelectListing(e.target.value)}
              className="w-full min-h-[48px] appearance-none rounded-xl border border-gray-200 bg-white px-4 py-3.5 pr-11 text-base font-semibold text-gray-900 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {dealListingOptions.map((l) => (
                <option key={l.id} value={l.id}>
                  {(l.name || 'Listing').trim()}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" aria-hidden />
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          className="flex w-full min-h-[48px] items-center justify-between px-5 py-4 text-left"
          aria-expanded={moreOpen}
        >
          <span className="text-sm font-semibold text-gray-600">
            {tr('More options', "Plus d'options")}
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
                {'badge' in action && action.badge ? (
                  <span className="absolute right-2 top-2 rounded-full bg-orange-100 px-1.5 py-0.5 text-[9px] font-bold text-orange-700">
                    {action.badge}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default BusinessSimpleHub;
