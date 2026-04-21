import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '@/contexts/AppContext';
import { Store, ArrowRight } from 'lucide-react';

/**
 * Replaces the removed home-page listing form: prompts business owners to sign up / sign in
 * or opens the dedicated listing route when already on a business account.
 */
const ListYourBusinessCta: React.FC = () => {
  const navigate = useNavigate();
  const { language, user, setShowAuth, setAuthMode } = useAppContext();

  const onClick = () => {
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

  return (
    <section className="py-14 sm:py-16 bg-gradient-to-b from-white to-teal-50/60 border-t border-teal-100/80">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
        <div className="rounded-2xl border border-teal-100 bg-white/90 shadow-sm shadow-teal-100/50 px-6 py-8 sm:px-10 sm:py-10">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center">
            <Store className="w-7 h-7 text-white" aria-hidden />
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 mb-2">
            {language === 'en'
              ? 'List your business for free'
              : language === 'fr'
                ? 'Inscrivez votre entreprise gratuitement'
                : 'Listem bisnis blong yu — fri'}
          </h2>
          <p className="text-gray-600 text-sm sm:text-base max-w-xl mx-auto mb-6 leading-relaxed">
            {language === 'en'
              ? 'Reach tourists visiting Vanuatu with deals on StikmNek. Create an account or sign in to submit your listing for review — no listing fee.'
              : language === 'fr'
                ? 'Touchez les touristes au Vanuatu avec vos offres sur StikmNek. Créez un compte ou connectez-vous pour soumettre votre annonce — sans frais d’inscription.'
                : 'Rijim turis long Vanuatu wetem ol dil long StikmNek. Mekem akaont o saen in blong submitem listing — no listing fee.'}
          </p>
          <button
            type="button"
            onClick={onClick}
            className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-bold text-base hover:from-teal-700 hover:to-emerald-700 transition-all shadow-lg shadow-teal-200/60"
          >
            {language === 'fr'
              ? user?.type === 'business'
                ? 'Soumettre une annonce'
                : 'Commencer'
              : language === 'bi'
                ? user?.type === 'business'
                  ? 'Submitem listing'
                  : 'Stat nao'
                : user?.type === 'business'
                  ? 'Submit a listing'
                  : 'Get started'}
            <ArrowRight className="w-5 h-5 shrink-0" aria-hidden />
          </button>
          {!user && (
            <p className="text-xs text-gray-500 mt-4 flex flex-wrap items-center justify-center gap-x-1 gap-y-1">
              <span>
                {language === 'en'
                  ? 'Already have an account?'
                  : language === 'fr'
                    ? 'Déjà un compte ?'
                    : 'Gat akaont?'}
              </span>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('signin');
                  setShowAuth(true);
                }}
                className="text-teal-700 font-semibold hover:underline"
              >
                {language === 'en' ? 'Sign in' : language === 'fr' ? 'Se connecter' : 'Saen in'}
              </button>
            </p>
          )}
        </div>
      </div>
    </section>
  );
};

export default ListYourBusinessCta;
