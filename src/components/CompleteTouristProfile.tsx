import React from 'react';
import { useAppContext } from '@/contexts/AppContext';
import TouristProfileForm from '@/components/TouristProfileForm';
import { Users, ArrowRight, AlertCircle } from 'lucide-react';

const CompleteTouristProfile: React.FC = () => {
  const {
    user,
    userProfile,
    language,
    refreshUserProfile,
    setCurrentView,
    userProfileLoadError,
    retryUserProfileFetch,
    touristOnboardingResume,
  } = useAppContext();

  if (!user?.id) return null;

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
                    : 'Go bek long profil blong yu'
                : language === 'en'
                  ? 'Complete your profile'
                  : language === 'fr'
                    ? 'Complétez votre profil'
                    : 'Komplitim profil blong yu'}
            </h1>
            <p className="text-white/80 text-sm mt-1">
              {touristOnboardingResume
                ? language === 'en'
                  ? 'Pick up where you left off — your details are saved as you go.'
                  : language === 'fr'
                    ? 'Reprenez où vous en étiez — vos informations sont enregistrées au fil du remplissage.'
                    : 'Go hed wea yu stap — ol samting i save lelebet.'
                : language === 'en'
                  ? 'We use this to recommend the right pass for your group and dates.'
                  : language === 'fr'
                    ? 'Nous l’utilisons pour recommander le bon pass selon votre groupe et vos dates.'
                    : 'Mifala i yusum blong rekomendem stret pas blong grup mo ol det.'}
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
                  {language === 'en' ? 'Try again' : language === 'fr' ? 'Réessayer' : 'Traem gen'}
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
                setCurrentView('passes');
              }}
            />

            <div className="mt-6 rounded-xl bg-teal-50 border border-teal-100 p-4 flex items-start gap-3">
              <ArrowRight className="w-5 h-5 text-teal-700 mt-0.5" />
              <p className="text-sm text-teal-800">
                {language === 'en'
                  ? 'Next, we’ll suggest the best pass for your trip.'
                  : language === 'fr'
                    ? 'Ensuite, nous vous suggérerons le meilleur pass pour votre séjour.'
                    : 'Biaen, bae mifala i soem best pas blong trip blong yu.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CompleteTouristProfile;

