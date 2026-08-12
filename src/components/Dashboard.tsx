import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '@/contexts/AppContext';
import { t } from '@/data/translations';
import type { Language } from '@/data/translations';
import { pathForHubView } from '@/utils/viewModes';
import { Ticket, Heart, ChevronRight, Users } from 'lucide-react';
import PassCard from './PassCard';
import TouristProfileForm from './TouristProfileForm';

/**
 * Tourist Profile tab (`/profile` / BottomNav Profile).
 * Same trip questions as checkout / CompleteTouristProfile (TouristProfileForm).
 */
const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const {
    language,
    user,
    userProfile,
    favorites,
    setCurrentView,
    purchasePass,
    refreshUserPass,
    refreshUserProfile,
    setShowAuth,
    setAuthMode,
    signOut,
  } = useAppContext();
  const profileLang: Language = language === 'fr' ? 'fr' : 'en';

  useEffect(() => {
    if (user) void refreshUserPass();
  }, [user, refreshUserPass]);

  const goSaved = () => {
    setCurrentView('my-favorites');
    const path = pathForHubView('my-favorites');
    if (path) navigate(path);
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-teal-50/80 via-white to-gray-50 pt-20 pb-28">
        <div className="max-w-lg mx-auto px-4">
          <div className="rounded-2xl border border-teal-100 bg-white shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-teal-600 to-emerald-600 px-6 py-8 text-white">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-white/20">
                <Users className="h-6 w-6" />
              </div>
              <h1 className="text-2xl font-extrabold">
                {language === 'en' ? 'Your trip profile' : 'Votre profil voyage'}
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-white/85">
                {language === 'en'
                  ? 'Sign in to save your name, party size, resort, and contact prefs — the same details we use at checkout for your Holiday Pass.'
                  : 'Connectez-vous pour enregistrer nom, taille du groupe, resort et contact — les mêmes infos qu’au paiement du Pass.'}
              </p>
            </div>
            <div className="space-y-3 p-6">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('signin');
                  setShowAuth(true);
                }}
                className="min-h-[3rem] w-full rounded-xl bg-teal-600 font-bold text-white transition-colors hover:bg-teal-700"
              >
                {language === 'en' ? 'Sign in' : 'Se connecter'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('signup-tourist');
                  setShowAuth(true);
                }}
                className="min-h-[3rem] w-full rounded-xl border border-teal-200 bg-teal-50 font-semibold text-teal-800 transition-colors hover:bg-teal-100"
              >
                {language === 'en' ? 'Create free account' : 'Créer un compte gratuit'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pt-20 pb-28">
      <div className="mx-auto max-w-lg px-4 sm:px-6">
        <div className="mb-6 flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-500 text-xl font-bold text-white shadow-lg shadow-teal-200">
            {user.name.charAt(0)}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-extrabold text-gray-900">
              {language === 'en' ? 'Profile' : 'Profil'}
            </h1>
            <p className="truncate text-sm text-gray-500">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={() => void signOut()}
            className="shrink-0 text-xs font-semibold text-gray-500 underline underline-offset-2 hover:text-teal-700"
          >
            {language === 'en' ? 'Sign out' : 'Déconnexion'}
          </button>
        </div>

        <div className="mb-5 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 p-4">
            <h2 className="flex items-center gap-2 text-sm font-bold text-gray-900">
              <Ticket className="h-4 w-4 text-teal-600" />
              {t('dash.passes', language)}
            </h2>
          </div>
          {user.pass ? (
            <div className="p-4">
              <PassCard />
            </div>
          ) : (
            <div className="p-6 text-center">
              <p className="mb-3 text-sm text-gray-400">{t('dash.nopass', language)}</p>
              <button
                type="button"
                onClick={() => void purchasePass()}
                className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-700"
              >
                {t('hero.cta', language)}
              </button>
            </div>
          )}
        </div>

        <div className="mb-5 overflow-hidden rounded-xl border border-teal-100 bg-white shadow-sm">
          <div className="border-b border-teal-50 bg-gradient-to-r from-teal-50/80 to-emerald-50/50 px-5 py-4">
            <h2 className="flex items-center gap-2 font-bold text-gray-900">
              <Users className="h-5 w-5 text-teal-600" />
              {language === 'en' ? 'Trip details for checkout' : 'Détails voyage (paiement)'}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-gray-500">
              {language === 'en'
                ? 'Party size, dates, resort, and how we contact you — used when you buy a Holiday Pass.'
                : 'Taille du groupe, dates, resort et contact — utilisés à l’achat du Pass.'}
            </p>
          </div>
          <div className="p-5">
            <TouristProfileForm
              userId={user.id}
              language={profileLang}
              accountEmail={user.email}
              accountName={user.name}
              userProfile={userProfile}
              embedded
              hideTitle
              onSuccess={async () => {
                await refreshUserProfile();
              }}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={goSaved}
          className="mb-4 flex w-full items-center gap-3 rounded-xl border border-gray-100 bg-white p-4 text-left shadow-sm transition-colors hover:border-red-200"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50">
            <Heart className="h-5 w-5 text-red-500" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900">{t('dash.favorites', language)}</p>
            <p className="text-xs text-gray-500">
              {favorites.length}{' '}
              {language === 'en' ? 'saved places' : 'lieux enregistrés'}
            </p>
          </div>
          <ChevronRight className="h-4 w-4 text-gray-300" />
        </button>
      </div>
    </div>
  );
};

export default Dashboard;
