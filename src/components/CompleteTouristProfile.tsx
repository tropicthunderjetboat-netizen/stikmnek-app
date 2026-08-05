import React, { useEffect } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import TouristProfileForm from '@/components/TouristProfileForm';
import { canAccessAdminPanel } from '@/lib/adminRoles';
import { Users, ArrowRight, AlertCircle } from 'lucide-react';

const CompleteTouristProfile: React.FC = () => {
  const {
    user,
    userProfile,
    purchasePass,
    language,
    refreshUserProfile,
    userProfileLoadError,
    retryUserProfileFetch,
    touristOnboardingResume,
    setCurrentView,
  } = useAppContext();

  // Staff/admin accounts must never complete the tourist profile flow.
  useEffect(() => {
    if (!user) return;
    const role = userProfile?.role || user.type || 'tourist';
    if (canAccessAdminPanel(role, user.email)) {
      setCurrentView('admin');
    }
  }, [user, userProfile?.role, setCurrentView]);

  if (!user?.id) return null;

  const role = userProfile?.role || user.type || 'tourist';
  if (canAccessAdminPanel(role, user.email)) return null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-teal-50/40 pt-20 pb-16">
      <div className="max-w-xl mx-auto px-4">
        <div className="bg-white rounded-2xl border border-teal-100 shadow-lg overflow-hidden">
          <div className="p-6 sm:p-8 bg-gradient-to-r from-teal-600 to-emerald-600 text-white">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center mb-3">
              <Users className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-extrabold">
              {touristOnboardingResume
                ? language === 'en'
                  ? 'Resume your profile'
                  : language === 'fr'
                    ? 'Reprendre votre profil'
                    : 'Go bak long profael blong yu'
                : language === 'en'
                  ? 'Complete your profile'
                  : language === 'fr'
                    ? 'Complétez votre profil'
                    : 'Komplitim profaael blong yu'}
            </h1>
            <p className="text-white/80 text-sm mt-1">
              {touristOnboardingResume
                ? language === 'en'
                  ? 'Pick up where you left off — your details are saved as you go.'
                  : language === 'fr'
                    ? 'Reprenez où vous en étiez — vos informations sont enregistrées au fil du remplissage.'
                    : 'Go hed long wea yu stop long hem — ol samting i save sef taem yu muv iko lelebet.'
                : language === 'en'
                  ? 'Sign in is done — add your name, WhatsApp, and trip dates. Then we’ll issue your pass QR (free for the first 25 travelers).'
                  : language === 'fr'
                    ? 'Connexion OK — ajoutez nom, WhatsApp et dates. Ensuite nous délivrons votre QR (gratuit pour les 25 premiers voyageurs).'
                    : 'Login i redi — putum nem, WhatsApp mo det blong trip. Bae mifala i givim QR (fri long fes 25).'}
            </p>
          </div>

          <div className="p-6 sm:p-8">
            {userProfileLoadError && (
              <div
                role="alert"
                className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
              >
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden />
                  <p>{userProfileLoadError}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void retryUserProfileFetch()}
                  className="shrink-0 px-4 py-2 rounded-lg bg-red-700 text-white font-semibold hover:bg-red-800"
                >
                  {language === 'en' ? 'Try again' : language === 'fr' ? 'Réessayer' : 'Traem bakeken'}
                </button>
              </div>
            )}

            <TouristProfileForm
              userId={user.id}
              language={language}
              accountEmail={user.email}
              accountName={user.name}
              userProfile={userProfile}
              onSuccess={async () => {
                await refreshUserProfile();
                void purchasePass();
              }}
            />

            <div className="mt-6 rounded-xl bg-teal-50 border border-teal-100 p-4 flex items-start gap-3">
              <ArrowRight className="w-5 h-5 text-teal-700 mt-0.5" />
              <p className="text-sm text-teal-800">
                {language === 'en'
                  ? 'Next: claim your free pass (if still available) or pay — then your QR unlocks WhatsApp and member rates.'
                  : language === 'fr'
                    ? 'Ensuite : passe gratuit (si disponible) ou paiement — le QR débloque WhatsApp et les tarifs membres.'
                    : 'Nekis: kliem fri pas (sipos i stap) o pe — QR i openem WhatsApp mo memba praes.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CompleteTouristProfile;

