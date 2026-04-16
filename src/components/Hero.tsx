import React, { useMemo } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { t } from '@/data/translations';
import { touristFacingOfferings } from '@/data/businesses';
import { ArrowRight, MapPin, Star, Users } from 'lucide-react';

const Hero: React.FC = () => {
  const { language, user, setShowAuth, setAuthMode, dbBusinesses } = useAppContext();

  const scrollToListBusiness = () => {
    if (!user) {
      setAuthMode('signup-business');
      setShowAuth(true);
      return;
    }
    document.getElementById('list-business')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    <section className="relative min-h-[80vh] flex items-center overflow-hidden pt-16">
      {/* Background Image */}
      <div className="absolute inset-0">
        <img
          src="https://d64gsuwffb70l.cloudfront.net/698d2153e3f311f6bf471393_1770856886882_dff396d7.jpg"
          alt="Vanuatu"

          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-teal-950/80 via-teal-900/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-teal-950/50 via-transparent to-teal-950/30" />
      </div>

      {/* Decorative Elements */}
      <div className="absolute top-20 right-10 w-72 h-72 bg-emerald-400/10 rounded-full blur-3xl" />
      <div className="absolute bottom-10 left-10 w-96 h-96 bg-teal-400/10 rounded-full blur-3xl" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20 w-full flex flex-col justify-center">
        <div className="max-w-2xl">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/15 backdrop-blur-sm border border-white/20 text-white/90 text-sm mb-6">
            <MapPin className="w-4 h-4 text-emerald-400" />
            Vanuatu

          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-tight mb-6">
            {t('hero.title', language)}
          </h1>

          <p className="text-lg sm:text-xl text-white/80 mb-8 leading-relaxed max-w-xl">
            {t('hero.subtitle', language)}
          </p>

          <div className="flex flex-col sm:flex-row gap-4 mb-12">
            <button
              type="button"
              onClick={openTouristSignup}
              className="group flex items-center justify-center gap-2 px-8 py-4 sm:py-5 rounded-xl bg-orange-500 text-white font-bold text-lg hover:bg-orange-600 transition-all shadow-xl shadow-orange-500/35 hover:shadow-orange-500/50 hover:-translate-y-0.5 sm:flex-1 sm:min-h-[3.5rem]"
            >
              {t('hero.ctaTourist', language)}
              <ArrowRight className="w-5 h-5 shrink-0 group-hover:translate-x-1 transition-transform" />
            </button>
            <button
              type="button"
              onClick={scrollToListBusiness}
              className="flex items-center justify-center gap-2 px-8 py-4 sm:py-5 rounded-xl border-[3px] border-white bg-transparent text-white font-bold text-lg hover:bg-white/10 transition-all sm:flex-1 sm:min-h-[3.5rem]"
            >
              {t('hero.ctaBusiness', language)}
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-6 max-w-lg">
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
