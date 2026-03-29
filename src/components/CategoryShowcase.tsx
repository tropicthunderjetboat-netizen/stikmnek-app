import React, { useMemo } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { businesses as localBusinesses, categories, publicListingBusinesses } from '@/data/businesses';

const CategoryShowcase: React.FC = () => {
  const { language, setSelectedCategory, setCurrentView, dbBusinesses, dataLoaded } = useAppContext();

  const allBusinesses = useMemo(
    () => publicListingBusinesses(dbBusinesses, localBusinesses),
    [dbBusinesses],
  );

  // Compute real-time category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const biz of allBusinesses) {
      counts[biz.category] = (counts[biz.category] || 0) + 1;
    }
    return counts;
  }, [allBusinesses]);

  const cats = [
    {
      key: 'dining',
      label: language === 'en' ? 'Dining' : language === 'fr' ? 'Restauration' : 'Kakae',
      desc: language === 'en' ? 'Fresh seafood & local cuisine' : language === 'fr' ? 'Fruits de mer frais & cuisine locale' : 'Fres sifud & lokal kakae',
      image: 'https://d64gsuwffb70l.cloudfront.net/698d2153e3f311f6bf471393_1770856900792_67ead30b.jpg',
      gradient: 'from-orange-600/80 to-red-600/80',
    },
    {
      key: 'activities',
      label: language === 'en' ? 'Activities' : language === 'fr' ? 'Activités' : 'Aktiviti',
      desc: language === 'en' ? 'Snorkeling, diving & more' : language === 'fr' ? 'Plongée, kayak & plus' : 'Snokling, daeving & moa',
      image: 'https://d64gsuwffb70l.cloudfront.net/698d2153e3f311f6bf471393_1770856938935_27ebc816.png',
      gradient: 'from-cyan-600/80 to-blue-600/80',
    },
    {
      key: 'tours',
      label: language === 'en' ? 'Tours' : language === 'fr' ? 'Visites' : 'Tua',
      desc: language === 'en' ? 'Cultural & adventure tours' : language === 'fr' ? 'Visites culturelles & aventure' : 'Kalsa & advencha tua',
      image: 'https://d64gsuwffb70l.cloudfront.net/698d2153e3f311f6bf471393_1770856976443_5ee434da.png',
      gradient: 'from-purple-600/80 to-violet-600/80',
    },
    {
      key: 'spa',
      label: language === 'en' ? 'Spa & Wellness' : language === 'fr' ? 'Spa & Bien-être' : 'Spa & Helt',
      desc: language === 'en' ? 'Relax & rejuvenate' : language === 'fr' ? 'Détendez-vous & rajeunissez' : 'Rilaks & rifresen',
      image: 'https://d64gsuwffb70l.cloudfront.net/698d2153e3f311f6bf471393_1770857000182_f55ad882.jpg',
      gradient: 'from-emerald-600/80 to-teal-600/80',
    },
    {
      key: 'accommodation',
      label: language === 'en' ? 'Accommodation' : language === 'fr' ? 'Hébergement' : 'Ples blong slip',
      desc: language === 'en' ? 'Beachfront stays' : language === 'fr' ? 'Séjours en bord de mer' : 'Bichfron stei',
      image: 'https://d64gsuwffb70l.cloudfront.net/698d2153e3f311f6bf471393_1770856999889_357acdad.jpg',
      gradient: 'from-amber-600/80 to-orange-600/80',
    },
    {
      key: 'shopping',
      label: language === 'en' ? 'Shopping' : language === 'fr' ? 'Shopping' : 'Soping',
      desc: language === 'en' ? 'Local crafts & souvenirs' : language === 'fr' ? 'Artisanat local & souvenirs' : 'Lokal kraft & suvenia',
      image: 'https://d64gsuwffb70l.cloudfront.net/698d2153e3f311f6bf471393_1770857002898_1909faf0.jpg',
      gradient: 'from-pink-600/80 to-rose-600/80',
    },
  ];

  const handleCategoryClick = (key: string) => {
    setSelectedCategory(key);
    setCurrentView('deals');
  };

  const totalListings = allBusinesses.length;

  return (
    <section className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-3">
            {language === 'en' ? 'Explore by Category' : language === 'fr' ? 'Explorer par catégorie' : 'Eksploarem bae Kategori'}
          </h2>
          <p className="text-gray-500 max-w-lg mx-auto">
            {language === 'en' ? 'Find the perfect deal for every type of adventure' :
             language === 'fr' ? 'Trouvez l\'offre parfaite pour chaque type d\'aventure' :
             'Faenem nambawan dil blong evri kaen advencha'}
          </p>
          {/* Live data indicator + total count */}
          <div className="flex items-center justify-center gap-3 mt-3">
            <span className="text-sm font-semibold text-gray-700">
              {totalListings} {language === 'en' ? 'active listings' : language === 'fr' ? 'annonces actives' : 'aktiv listing'}
            </span>
            {dbBusinesses.length > 0 && (
              <span className="flex items-center gap-1 text-xs text-teal-600 font-medium">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                {language === 'en' ? 'Live counts' : 'En direct'}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {cats.map((cat) => {
            const count = categoryCounts[cat.key] || 0;
            return (
              <button
                key={cat.key}
                onClick={() => handleCategoryClick(cat.key)}
                className="group relative h-40 sm:h-52 rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
              >
                <img
                  src={cat.image}
                  alt={cat.label}
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                />
                <div className={`absolute inset-0 bg-gradient-to-t ${cat.gradient}`} />
                <div className="absolute inset-0 flex flex-col justify-end p-4 sm:p-6 text-white text-left">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-lg sm:text-xl font-bold">{cat.label}</h3>
                    {/* Count Badge */}
                    <span className="px-2 py-0.5 rounded-full bg-white/25 backdrop-blur-sm text-white text-xs font-bold border border-white/20">
                      {count}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-white/80 hidden sm:block">{cat.desc}</p>
                  <p className="text-xs text-white/60 mt-1">
                    {count} {count === 1
                      ? (language === 'en' ? 'deal' : language === 'fr' ? 'offre' : 'dil')
                      : (language === 'en' ? 'deals' : language === 'fr' ? 'offres' : 'dils')
                    }
                    {' '}
                    {language === 'en' ? 'available' : language === 'fr' ? 'disponible' : 'i stap'}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default CategoryShowcase;
