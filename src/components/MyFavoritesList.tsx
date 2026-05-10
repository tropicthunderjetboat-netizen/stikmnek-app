import React, { useMemo } from 'react';
import { ArrowLeft, Heart, ChevronRight, MapPin } from 'lucide-react';
import { useAppContext } from '@/contexts/AppContext';
import { businesses as localBusinesses } from '@/data/businesses';
import { t } from '@/data/translations';

const MyFavoritesList: React.FC = () => {
  const {
    language,
    favorites,
    dbBusinesses,
    setCurrentView,
    setSelectedBusiness,
  } = useAppContext();

  const allBusinesses = dbBusinesses.length > 0 ? dbBusinesses : localBusinesses;
  const favBizs = useMemo(
    () => allBusinesses.filter((b) => favorites.includes(b.id)),
    [allBusinesses, favorites],
  );

  return (
    <div className="min-h-screen bg-gray-50 pt-20 pb-16">
      <div className="max-w-2xl mx-auto px-4 sm:px-6">
        <button
          type="button"
          onClick={() => setCurrentView('dashboard')}
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-teal-700 hover:text-teal-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('dash.favorites_back_dashboard', language)}
        </button>

        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center border border-red-100">
            <Heart className="w-6 h-6 text-red-500 fill-red-500/20" aria-hidden />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900">{t('dash.favorites', language)}</h1>
            <p className="text-sm text-gray-500">{t('dash.favorites_list_heading', language)}</p>
          </div>
        </div>

        <p className="text-sm text-gray-600 mb-6">
          {favBizs.length}{' '}
          {language === 'en' ? 'saved' : language === 'fr' ? 'enregistré(s)' : 'we i sevem'}
        </p>

        {favBizs.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
            <Heart className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-600 text-sm leading-relaxed">{t('dash.favorites_list_empty', language)}</p>
            <button
              type="button"
              onClick={() => setCurrentView('deals')}
              className="mt-6 px-5 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-bold hover:bg-teal-700 transition-colors"
            >
              {language === 'en' ? 'Browse deals' : language === 'fr' ? 'Voir les offres' : 'Lukluk ol diskaon'}
            </button>
          </div>
        ) : (
          <ul className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden divide-y divide-gray-100">
            {favBizs.map((biz) => (
              <li key={biz.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedBusiness(biz);
                    setCurrentView('business-detail');
                  }}
                  className="w-full flex items-center gap-4 p-4 text-left hover:bg-teal-50/50 transition-colors"
                >
                  <img
                    src={biz.image}
                    alt=""
                    className="w-14 h-14 rounded-xl object-cover shrink-0 border border-gray-100"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 truncate">{biz.name}</p>
                    {biz.discount ? (
                      <p className="text-xs font-semibold text-teal-700 truncate mt-0.5">{biz.discount}</p>
                    ) : null}
                    {biz.location ? (
                      <p className="text-xs text-gray-500 flex items-center gap-1 mt-1 truncate">
                        <MapPin className="w-3 h-3 shrink-0" />
                        {biz.location}
                      </p>
                    ) : null}
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-300 shrink-0" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default MyFavoritesList;
