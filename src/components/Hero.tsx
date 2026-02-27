import React from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { t } from '@/data/translations';
import { businesses as localBusinesses } from '@/data/businesses';
import { ArrowRight, MapPin, Star, Users } from 'lucide-react';

const Hero: React.FC = () => {
  const { language, setCurrentView, dbBusinesses } = useAppContext();

  // Use real business count from DB, fallback to local
  const allBusinesses = dbBusinesses.length > 0 ? dbBusinesses : localBusinesses;
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
    <section className="relative min-h-[600px] lg:min-h-[700px] flex items-center overflow-hidden">
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

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-32 w-full">
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
              onClick={() => setCurrentView('passes')}
              className="group flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold text-lg hover:from-orange-600 hover:to-amber-600 transition-all shadow-xl shadow-orange-500/30 hover:shadow-orange-500/50 hover:-translate-y-0.5"
            >
              {t('hero.cta', language)}
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
            <button
              onClick={() => setCurrentView('deals')}
              className="flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-white/15 backdrop-blur-sm border border-white/30 text-white font-semibold text-lg hover:bg-white/25 transition-all"
            >
              {t('hero.explore', language)}
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
