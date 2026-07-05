import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '@/contexts/AppContext';
import { supabase, SUPABASE_URL } from '@/lib/supabase';
import { fetchBusinessProfilePage, type BusinessProfilePageData } from '@/lib/loadListings';
import BusinessProfileLogo from '@/components/BusinessProfileLogo';
import BusinessCard from '@/components/BusinessCard';
import LoadingSkeleton from '@/components/LoadingSkeleton';
import { MapPin, Star, Store } from 'lucide-react';

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
      if (!data || data.offerings.length === 0) {
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

  return (
    <div className="pt-16 pb-16 min-h-screen bg-gray-50/80">
      <div className="bg-gradient-to-br from-teal-700 via-emerald-700 to-teal-800 text-white">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
          <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
            <BusinessProfileLogo
              src={profile.logoUrl}
              alt={profile.name}
              variant="hero"
              className="shrink-0 ring-4 ring-white/20"
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-widest text-white/60">
                {t('StikmNek Partner', 'Partenaire StikmNek', 'StikmNek Partner')}
              </p>
              <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">{profile.name}</h1>
              {profile.location && (
                <p className="mt-2 flex items-center justify-center gap-1.5 text-sm text-white/80 sm:justify-start">
                  <MapPin className="h-4 w-4 shrink-0" />
                  <span>{profile.location}</span>
                </p>
              )}
              {profile.rating > 0 && (
                <p className="mt-2 flex items-center justify-center gap-1.5 text-sm font-semibold text-white/90 sm:justify-start">
                  <Star className="h-4 w-4 fill-yellow-300 text-yellow-300" />
                  {profile.rating.toFixed(1)}
                  {profile.reviewCount > 0 && (
                    <span className="font-normal text-white/70">
                      ({profile.reviewCount} {t('reviews', 'avis', 'riviu')})
                    </span>
                  )}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 sm:px-6 -mt-4">
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-lg font-extrabold text-gray-900">
            {t('Our deals', 'Nos offres', 'Ol dil blong mifala')}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {t(
              `${profile.offerings.length} live offer${profile.offerings.length === 1 ? '' : 's'} on StikmNek`,
              `${profile.offerings.length} offre${profile.offerings.length === 1 ? '' : 's'} en ligne`,
              `${profile.offerings.length} live dil`,
            )}
          </p>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {profile.offerings.map((biz) => (
            <BusinessCard key={biz.id} business={biz} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default BusinessProfilePage;
