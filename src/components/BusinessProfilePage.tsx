import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useAppContext } from '@/contexts/AppContext';
import { supabase, SUPABASE_URL } from '@/lib/supabase';
import { fetchBusinessProfilePage, type BusinessProfilePageData } from '@/lib/loadListings';
import { absoluteBusinessProfileUrl, businessProfilePath } from '@/lib/businessProfileUrl';
import BusinessProfileLogo from '@/components/BusinessProfileLogo';
import BusinessCard from '@/components/BusinessCard';
import LoadingSkeleton from '@/components/LoadingSkeleton';
import { MapPin, Star, Store, Sparkles, ArrowRight } from 'lucide-react';

interface BusinessProfilePageProps {
  profileBusinessId: string;
}

const BusinessProfilePage: React.FC<BusinessProfilePageProps> = ({ profileBusinessId }) => {
  const navigate = useNavigate();
  const { language, setCurrentView, setSelectedBusiness } = useAppContext();
  const [profile, setProfile] = useState<BusinessProfilePageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const t = (en: string, fr: string, bi: string) =>
    language === 'en' ? en : language === 'fr' ? fr : bi;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    void (async () => {
      const data = await fetchBusinessProfilePage(supabase, SUPABASE_URL, profileBusinessId);
      if (cancelled) return;
      if (!data) {
        setProfile(null);
        setNotFound(true);
      } else {
        setProfile(data);
        setNotFound(false);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [profileBusinessId]);

  /** Canonical `/partner/...` URL (migrates legacy `/host/...` shares). */
  useEffect(() => {
    if (!profile) return;
    const canonical = businessProfilePath({ id: profile.id, name: profile.name });
    if (typeof window !== 'undefined' && window.location.pathname !== canonical) {
      navigate(canonical, { replace: true });
    }
  }, [profile, navigate]);

  if (loading) {
    return (
      <div className="pt-16">
        <LoadingSkeleton />
      </div>
    );
  }

  if (notFound || !profile) {
    return (
      <div className="pt-20 px-4 max-w-lg mx-auto text-center">
        <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
          <Store className="mx-auto h-12 w-12 text-gray-300" />
          <h1 className="mt-4 text-xl font-bold text-gray-900">
            {t('Business not found', 'Entreprise introuvable', 'No faenem bisnis')}
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            {t(
              'This business page may have been removed or has no live deals yet.',
              'Cette page n’existe pas ou n’a pas encore d’offres en ligne.',
              'Ples ia i no gat live dil yet.',
            )}
          </p>
          <button
            type="button"
            onClick={() => {
              setCurrentView('deals');
              navigate('/deals');
            }}
            className="mt-6 rounded-xl bg-teal-600 px-6 py-3 text-sm font-bold text-white"
          >
            {t('Browse all deals', 'Voir toutes les offres', 'Lukim ol dil')}
          </button>
        </div>
      </div>
    );
  }

  const metaTitle = `${profile.name} · Deals on StikmNek`;
  const metaDescription = t(
    `${profile.offerings.length} live deal${profile.offerings.length === 1 ? '' : 's'} from ${profile.name}${profile.location ? ` in ${profile.location}` : ''}. Book tours, dining & activities in Vanuatu.`,
    `${profile.offerings.length} offre${profile.offerings.length === 1 ? '' : 's'} en ligne de ${profile.name}. Réservez tours, restaurants et activités au Vanuatu.`,
    `${profile.offerings.length} live dil from ${profile.name}. Bukim tour, kakae mo aktiviti long Vanuatu.`,
  );
  const metaUrl = absoluteBusinessProfileUrl({ id: profile.id, name: profile.name });
  const metaImage = (profile.logoUrl || profile.offerings[0]?.image || '').trim();
  const coverImage =
    metaImage && !metaImage.startsWith('http')
      ? `${typeof window !== 'undefined' ? window.location.origin : 'https://www.stikmnek.com'}${metaImage.startsWith('/') ? '' : '/'}${metaImage}`
      : metaImage;

  return (
    <div className="pt-16 pb-16 min-h-screen bg-gray-50/80">
      <Helmet prioritizeSeoTags>
        <title>{metaTitle}</title>
        <meta name="description" content={metaDescription} />
        <link rel="canonical" href={metaUrl} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="StikmNek" />
        <meta property="og:title" content={metaTitle} />
        <meta property="og:description" content={metaDescription} />
        <meta property="og:url" content={metaUrl} />
        {coverImage && <meta property="og:image" content={coverImage} />}
        <meta name="twitter:card" content={coverImage ? 'summary_large_image' : 'summary'} />
        <meta name="twitter:title" content={metaTitle} />
        <meta name="twitter:description" content={metaDescription} />
        {coverImage && <meta name="twitter:image" content={coverImage} />}
      </Helmet>

      <div className="relative overflow-hidden text-white">
        {/* Layered gradient + soft glow (Vanuatu / tropical feel) */}
        <div
          className="absolute inset-0 bg-gradient-to-br from-teal-900 via-emerald-800 to-teal-700"
          aria-hidden
        />
        <div
          className="absolute inset-0 bg-gradient-to-tr from-cyan-600/30 via-transparent to-emerald-400/20"
          aria-hidden
        />
        <div
          className="absolute -right-12 -top-20 h-56 w-56 rounded-full bg-emerald-300/25 blur-3xl sm:h-72 sm:w-72"
          aria-hidden
        />
        <div
          className="absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-cyan-400/20 blur-3xl sm:h-80 sm:w-80"
          aria-hidden
        />
        <div
          className="absolute left-1/2 top-0 h-32 w-[120%] -translate-x-1/2 bg-gradient-to-b from-white/10 to-transparent"
          aria-hidden
        />
        {/* Gentle wave into page body */}
        <div
          className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-gray-50/90 to-transparent sm:h-10"
          aria-hidden
        />

        <div className="relative mx-auto max-w-5xl px-4 pb-10 pt-8 sm:px-6 sm:pb-12 sm:pt-10">
          <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:items-center sm:gap-8 sm:text-left">
            {profile.logoUrl ? (
              <div className="mx-auto w-fit max-w-full shrink-0 sm:mx-0">
                <BusinessProfileLogo
                  src={profile.logoUrl}
                  alt={profile.name}
                  variant="profilePage"
                />
              </div>
            ) : null}
            <div className="min-w-0 flex-1">
              <span className="inline-flex items-center rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white/90 shadow-sm backdrop-blur-sm sm:text-xs">
                {t('StikmNek Partner', 'Partenaire StikmNek', 'StikmNek Partner')}
              </span>
              <h1 className="mt-3 text-2xl font-extrabold tracking-tight drop-shadow-sm sm:text-3xl">
                {profile.name}
              </h1>
              {profile.location && (
                <p className="mt-2 flex items-center justify-center gap-1.5 text-sm text-white/85 sm:justify-start">
                  <MapPin className="h-4 w-4 shrink-0 text-emerald-200" />
                  <span>{profile.location}</span>
                </p>
              )}
              {profile.rating > 0 && (
                <p className="mt-2 flex items-center justify-center gap-1.5 text-sm font-semibold text-white/95 sm:justify-start">
                  <Star className="h-4 w-4 fill-amber-300 text-amber-300" />
                  {profile.rating.toFixed(1)}
                  {profile.reviewCount > 0 && (
                    <span className="font-normal text-white/75">
                      ({profile.reviewCount} {t('reviews', 'avis', 'riviu')})
                    </span>
                  )}
                </p>
              )}
            </div>
          </div>
        </div>

        <svg
          className="relative block w-full text-gray-50/90"
          viewBox="0 0 1440 48"
          preserveAspectRatio="none"
          aria-hidden
        >
          <path
            fill="currentColor"
            d="M0,32 C360,48 720,8 1080,24 C1260,32 1380,40 1440,36 L1440,48 L0,48 Z"
          />
        </svg>
      </div>

      <div className="mx-auto max-w-5xl px-4 sm:px-6 -mt-2">
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-lg font-extrabold text-gray-900">
            {t('Our deals', 'Nos offres', 'Ol dil blong mifala')}
          </h2>
          {profile.offerings.length > 0 ? (
            <p className="mt-1 text-sm text-gray-500">
              {t(
                `${profile.offerings.length} live offer${profile.offerings.length === 1 ? '' : 's'} on StikmNek`,
                `${profile.offerings.length} offre${profile.offerings.length === 1 ? '' : 's'} en ligne`,
                `${profile.offerings.length} live dil`,
              )}
            </p>
          ) : (
            <p className="mt-2 text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              {t(
                'No live deals right now — check back soon or browse all StikmNek offers.',
                'Aucune offre en ligne pour le moment — revenez bientôt ou parcourez toutes les offres.',
                'No gat live dil right now — lukim bae o lukim olgeta dil long StikmNek.',
              )}
            </p>
          )}
        </div>

        {profile.offerings.length > 0 && (
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {profile.offerings.map((biz) => (
            <BusinessCard key={biz.id} business={biz} />
          ))}
        </div>
        )}

        <button
          type="button"
          onClick={() => {
            setCurrentView('deals');
            navigate('/deals');
          }}
          className="group relative mt-10 w-full overflow-hidden rounded-3xl bg-gradient-to-br from-teal-600 via-emerald-600 to-cyan-600 p-6 text-left text-white shadow-xl shadow-teal-300/40 transition-all hover:shadow-2xl active:scale-[0.98] sm:p-8"
        >
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10" />
          <div className="relative flex items-center gap-5">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/25 bg-white/20 shadow-lg">
              <Sparkles className="h-7 w-7" strokeWidth={2.25} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-widest text-white/75">
                {t('Explore Vanuatu', 'Explorez le Vanuatu', 'Lukim Vanuatu')}
              </p>
              <h3 className="mt-1 text-xl font-extrabold sm:text-2xl">
                {t('Discover more deals on StikmNek', 'Plus d’offres sur StikmNek', 'Faenem moa dil long StikmNek')}
              </h3>
              <p className="mt-1.5 text-sm text-white/85">
                {t(
                  'Tours, dining, spa, shopping & more — save with a StikmNek pass',
                  'Tours, restaurants, spa, shopping et plus — économisez avec un pass StikmNek',
                  'Tour, kakae, spa mo moa — savem wetem StikmNek pas',
                )}
              </p>
            </div>
            <ArrowRight className="h-7 w-7 shrink-0 text-white/90 transition-transform group-hover:translate-x-1" />
          </div>
        </button>
      </div>
    </div>
  );
};

export default BusinessProfilePage;
