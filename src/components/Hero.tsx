import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '@/contexts/AppContext';
import { t } from '@/data/translations';
import { touristFacingOfferings } from '@/data/businesses';
import { MapPin, Sparkles } from 'lucide-react';
import LocalOwnedBadge from './LocalOwnedBadge';

const Hero: React.FC = () => {
  const navigate = useNavigate();
  const { language, user, setShowAuth, setAuthMode, setCurrentView, dbBusinesses } = useAppContext();
  const signedInTourist = user?.type === 'tourist';

  const goToDeals = () => {
    setCurrentView('deals');
    navigate('/deals');
  };

  const scrollToListBusiness = () => {
    if (!user) {
      setAuthMode('signup-business');
      setShowAuth(true);
      return;
    }
    if (user.type === 'business') {
      navigate('/business/new');
      return;
    }
    setAuthMode('signup-business');
    setShowAuth(true);
  };

  const openTouristSignup = () => {
    setAuthMode('signup-tourist');
    setShowAuth(true);
  };

  const allBusinesses = useMemo(() => touristFacingOfferings(dbBusinesses), [dbBusinesses]);
  const businessCount = allBusinesses.length;

  // Calculate average discount
  const avgDiscount = Math.round(
    allBusinesses.reduce((sum, b) => {
      if (b.originalPrice > 0 && b.dealPrice > 0) {
        return sum + ((b.originalPrice - b.dealPrice) / b.originalPrice) * 100;
      }
      return sum;
    }, 0) / Math.max(allBusinesses.filter(b => b.originalPrice > 0).length, 1)
  );

  return (
    <section
      className={`relative flex items-center overflow-hidden pt-16 ${
        signedInTourist ? 'min-h-0 max-lg:py-8 lg:min-h-[80vh]' : 'min-h-[80vh]'
      }`}
    >
      {/* Background Image */}
      <div className="absolute inset-0">
        <img
          src="https://d64gsuwffb70l.cloudfront.net/698d2153e3f311f6bf471393_1770856886882_dff396d7.jpg"
          alt="Vanuatu"
          className="w-full h-full object-cover"
          style={{ filter: 'brightness(0.78) saturate(1.05) contrast(1.04)' }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-teal-950/90 via-teal-950/70 to-teal-950/35" />
        <div className="absolute inset-0 bg-gradient-to-t from-teal-950/75 via-teal-950/20 to-teal-950/45" />
      </div>

      {/* Decorative Elements */}
      <div className="absolute top-20 right-10 w-72 h-72 bg-emerald-400/10 rounded-full blur-3xl" />
      <div className="absolute bottom-10 left-10 w-96 h-96 bg-teal-400/10 rounded-full blur-3xl" />

      <div
        className={`relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full flex flex-col justify-center ${
          signedInTourist ? 'py-6 sm:py-10 lg:py-20' : 'py-12 sm:py-16 lg:py-20'
        }`}
      >
        <div className="max-w-2xl">
          <div className={`flex flex-col gap-2 sm:gap-3 ${signedInTourist ? 'mb-4' : 'mb-6'}`}>
            <div className="inline-flex w-fit items-center gap-2 px-4 py-1.5 rounded-full bg-white/15 backdrop-blur-sm border border-white/20 text-white/90 text-sm">
              <MapPin className="w-4 h-4 text-emerald-400" />
              Vanuatu
            </div>
            {!signedInTourist && <LocalOwnedBadge variant="hero" language={language} />}
          </div>

          <h1
            className={`font-extrabold text-white leading-tight drop-shadow-[0_2px_12px_rgba(0,0,0,0.55)] ${
              signedInTourist
                ? 'text-3xl sm:text-4xl lg:text-6xl mb-3'
                : 'text-4xl sm:text-5xl lg:text-6xl mb-6'
            }`}
          >
            {signedInTourist ? t('hero.browseDeals', language) : t('hero.title', language)}
          </h1>

          <p
            className={`text-white/95 leading-relaxed max-w-xl drop-shadow-[0_1px_8px_rgba(0,0,0,0.5)] ${
              signedInTourist ? 'text-base sm:text-lg mb-5' : 'text-lg sm:text-xl mb-8'
            }`}
          >
            {signedInTourist ? t('hero.welcomeBack', language) : t('hero.subtitle', language)}
          </p>

          <div className={`flex flex-col gap-3 w-full max-w-md ${signedInTourist ? 'mb-6' : 'mb-12'}`}>
            {user?.type === 'business' ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setCurrentView('business-dashboard');
                    navigate('/hub');
                  }}
                  className="group flex w-full items-center justify-center gap-2 px-8 py-4 rounded-xl bg-orange-500 text-white font-bold text-lg hover:bg-orange-600 transition-all shadow-xl shadow-orange-500/35 hover:shadow-orange-500/50 hover:-translate-y-0.5 min-h-[3.25rem]"
                >
                  <Sparkles className="w-5 h-5 shrink-0 text-amber-100 opacity-95 group-hover:scale-110 transition-transform" aria-hidden />
                  {language === 'en'
                    ? 'Go to my dashboard'
                    : language === 'fr'
                      ? 'Aller à mon tableau de bord'
                      : 'Go long dasbod blong mi'}
                </button>
                <button
                  type="button"
                  onClick={scrollToListBusiness}
                  className="flex w-full items-center justify-center gap-2 px-8 py-3.5 rounded-xl border-2 border-white/90 bg-white/5 text-white font-semibold text-base hover:bg-white/15 transition-all min-h-[3rem] backdrop-blur-[2px]"
                >
                  {t('hero.ctaBusiness', language)}
                </button>
              </>
            ) : signedInTourist ? (
              <>
                <button
                  type="button"
                  onClick={goToDeals}
                  className="group flex w-full items-center justify-center gap-2 px-8 py-4 rounded-xl bg-orange-500 text-white font-bold text-lg hover:bg-orange-600 transition-all shadow-xl shadow-orange-500/35 hover:shadow-orange-500/50 hover:-translate-y-0.5 min-h-[3.25rem]"
                >
                  <Sparkles className="w-5 h-5 shrink-0 text-amber-100 opacity-95 group-hover:scale-110 transition-transform" aria-hidden />
                  {t('hero.explore', language)}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCurrentView('map');
                    navigate('/map');
                  }}
                  className="flex w-full items-center justify-center gap-2 px-8 py-3.5 rounded-xl border-2 border-white/90 bg-white/5 text-white font-semibold text-base hover:bg-white/15 transition-all min-h-[3rem] backdrop-blur-[2px]"
                >
                  {language === 'en' ? 'View on map' : language === 'fr' ? 'Voir sur la carte' : 'Lukim long map'}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={openTouristSignup}
                  className="group flex w-full items-center justify-center gap-2 px-8 py-4 sm:py-5 rounded-xl bg-orange-500 text-white font-bold text-lg hover:bg-orange-600 transition-all shadow-xl shadow-orange-500/35 hover:shadow-orange-500/50 hover:-translate-y-0.5 min-h-[3.25rem]"
                >
                  <Sparkles className="w-5 h-5 shrink-0 text-amber-100 opacity-95 group-hover:scale-110 transition-transform" aria-hidden />
                  {t('hero.ctaTourist', language)}
                </button>
                <p className="text-center text-xs text-white/70 sm:text-left sm:pl-1">
                  {t('hero.businessOwnersHint', language)}
                </p>
                <button
                  type="button"
                  onClick={scrollToListBusiness}
                  className="flex w-full items-center justify-center gap-2 px-8 py-3.5 sm:py-4 rounded-xl border-2 border-white/90 bg-white/5 text-white font-semibold text-base hover:bg-white/15 transition-all min-h-[3rem] backdrop-blur-[2px]"
                >
                  {t('hero.ctaBusiness', language)}
                </button>
              </>
            )}
          </div>

          {/* Stats — hidden on mobile for signed-in tourists to save scroll */}
          <div
            className={`grid grid-cols-3 gap-6 max-w-lg ${
              signedInTourist ? 'hidden sm:grid' : ''
            }`}
          >
            <div className="text-center">
              <div className="text-3xl font-extrabold text-white">{businessCount}+</div>
              <div className="text-sm text-white/60 mt-1">{t('hero.businesses', language)}</div>
            </div>
            <div className="text-center border-x border-white/20">
              <div className="text-3xl font-extrabold text-emerald-400">{avgDiscount}%</div>
              <div className="text-sm text-white/60 mt-1">{t('hero.savings', language)}</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-extrabold text-white">5K+</div>
              <div className="text-sm text-white/60 mt-1">{t('hero.tourists', language)}</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
