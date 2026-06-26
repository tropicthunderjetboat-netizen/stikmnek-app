import React from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { shouldOpenCheckoutInsteadOfPassesPage } from '@/utils/passNavigation';
import { t } from '@/data/translations';
import type { Language } from '@/data/translations';
import { Ticket, QrCode, MapPin, Smile } from 'lucide-react';

const HowItWorks: React.FC = () => {
  const { language, setCurrentView, user, purchasePass } = useAppContext();
  const lang: Language = language === 'fr' ? 'fr' : language === 'bi' ? 'bi' : 'en';

  const steps = [
    {
      icon: <Ticket className="w-7 h-7" />,
      title: t('passSelection.title', lang),
      desc: t('pass.build_how_desc', lang),

      color: 'from-sky-500 to-blue-600',
      shadow: 'shadow-sky-200',
    },
    {
      icon: <MapPin className="w-7 h-7" />,
      title: language === 'en' ? 'Explore Deals' : language === 'fr' ? 'Explorez les offres' : 'Eksploarem Dils',
      desc: language === 'en' ? 'Browse 120+ deals on the map or by category. Find what excites you!' : language === 'fr' ? 'Parcourez plus de 120 offres sur la carte ou par catégorie.' : 'Lukim 120+ dils long map o bae kategori. Faenem wanem i eksaetem yu!',
      color: 'from-teal-500 to-emerald-600',
      shadow: 'shadow-teal-200',
    },
    {
      icon: <QrCode className="w-7 h-7" />,
      title: language === 'en' ? 'Show QR Code' : language === 'fr' ? 'Montrez le QR code' : 'Soem QR Kod',
      desc: language === 'en' ? 'Present your QR code at the business to redeem your exclusive discount' : language === 'fr' ? 'Présentez votre QR code à l\'entreprise pour utiliser votre réduction exclusive' : 'Soem QR kod blong yu long bisnis blong yusim ekslusiv diskount blong yu',
      color: 'from-purple-500 to-violet-600',
      shadow: 'shadow-purple-200',
    },
    {
      icon: <Smile className="w-7 h-7" />,
      title: language === 'en' ? 'Save & Enjoy' : language === 'fr' ? 'Économisez et profitez' : 'Sevem mo Enjoem',
      desc: language === 'en' ? 'Save up to 35% on dining, tours, activities and more across Vanuatu' : language === 'fr' ? 'Économisez jusqu\'à 35% sur la restauration, les visites, les activités et plus à travers le Vanuatu' : 'Sevem kasem 35% long kakae, tua, aktiviti mo moa long Vanuatu',

      color: 'from-orange-500 to-amber-600',
      shadow: 'shadow-orange-200',
    },
  ];

  return (
    <section className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-3">
            {language === 'en' ? 'How StikmNek Works' : language === 'fr' ? 'Comment fonctionne StikmNek' : 'Ao nao StikmNek i Wok'}
          </h2>
          <p className="text-gray-500 max-w-lg mx-auto">
            {language === 'en' ? 'Four simple steps to start saving on your Vanuatu adventure' :
             language === 'fr' ? 'Quatre étapes simples pour commencer à économiser sur votre aventure au Vanuatu' :
             'Fo simpol step blong stat sevem long Vanuatu advenja blong yu'}
          </p>

        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((step, i) => (
            <div key={i} className="text-center group">
              <div className="relative inline-block mb-6">
                <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${step.color} flex items-center justify-center text-white shadow-lg ${step.shadow} group-hover:scale-110 transition-transform`}>
                  {step.icon}
                </div>
                <div className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-white border-2 border-gray-200 flex items-center justify-center text-xs font-bold text-gray-600 shadow-sm">
                  {i + 1}
                </div>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">{step.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>

        <div className="text-center mt-12">
          <button
            type="button"
            onClick={() => {
              if (shouldOpenCheckoutInsteadOfPassesPage(user)) void purchasePass();
              else setCurrentView('passes');
            }}
            className="px-8 py-3.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-bold hover:from-teal-700 hover:to-emerald-700 transition-all shadow-lg shadow-teal-200 hover:shadow-xl"
          >
            {language === 'en' ? 'Start Saving Today' : language === 'fr' ? 'Commencez à économiser aujourd\'hui' : 'Stat Sevem Tede'}
          </button>
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
