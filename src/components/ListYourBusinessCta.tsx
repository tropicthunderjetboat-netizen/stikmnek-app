import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '@/contexts/AppContext';
import { Store, ArrowRight, Sparkles, Users, BadgePercent } from 'lucide-react';

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

  const badge =
    language === 'en'
      ? 'For Vanuatu businesses'
      : language === 'fr'
        ? 'Pour les entreprises au Vanuatu'
        : 'Blong bisnis long Vanuatu';

  const title =
    language === 'en'
      ? 'List your business for free'
      : language === 'fr'
        ? 'Inscrivez votre entreprise gratuitement'
        : 'Listem bisnis blong yu — fri';

  const subtitle =
    language === 'en'
      ? 'Put your deals in front of tourists planning their trip — StikmNek helps them discover you before they arrive.'
      : language === 'fr'
        ? 'Mettez vos offres sous les yeux des touristes qui préparent leur séjour — StikmNek les aide à vous découvrir avant leur arrivée.'
        : 'Putem ol dil blong yu long ai blong turis we oli planem trip — StikmNek i helpem oli faenem yu.';

  const bullets =
    language === 'en'
      ? [
          { t: 'Zero listing fee — ever', Icon: BadgePercent },
          { t: 'WhatsApp-ready leads', Icon: Sparkles },
          { t: 'Reach visitors before they land', Icon: Users },
        ]
      : language === 'fr'
        ? [
            { t: 'Aucun frais d’annonce', Icon: BadgePercent },
            { t: 'Contacts prêts pour WhatsApp', Icon: Sparkles },
            { t: 'Touchez les voyageurs en amont', Icon: Users },
          ]
        : [
            { t: 'No listing fee', Icon: BadgePercent },
            { t: 'WhatsApp leads', Icon: Sparkles },
            { t: 'Rijim turis bifo oli kam', Icon: Users },
          ];

  const cta =
    language === 'fr'
      ? user?.type === 'business'
        ? 'Soumettre une annonce'
        : 'Commencer'
      : language === 'bi'
        ? user?.type === 'business'
          ? 'Submitem listing'
          : 'Stat nao'
        : user?.type === 'business'
          ? 'Submit a listing'
          : 'Get started';

  return (
    <section className="relative py-16 sm:py-20 overflow-hidden border-t border-teal-200/40">
      {/* Background */}
      <div
        className="absolute inset-0 bg-gradient-to-br from-teal-600 via-emerald-600 to-cyan-700"
        aria-hidden
      />
      <div
        className="absolute inset-0 opacity-[0.12] bg-[radial-gradient(circle_at_20%_30%,white,transparent_45%),radial-gradient(circle_at_80%_70%,white,transparent_40%)]"
        aria-hidden
      />
      <div
        className="absolute inset-0 opacity-[0.35] bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20viewBox%3D%220%200%2060%2060%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cg%20fill%3D%22none%22%20fill-rule%3D%22evenodd%22%3E%3Cg%20fill%3D%22%23ffffff%22%20fill-opacity%3D%221%22%3E%3Cpath%20d%3D%22M36%2034v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6%2034v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6%204V0H4v4H0v2h4v4h2V6h4V4H6z%22%2F%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fsvg%3E')]"
        aria-hidden
      />
      <div
        className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-amber-300/25 blur-3xl"
        aria-hidden
      />
      <div
        className="absolute -bottom-32 -left-16 w-96 h-96 rounded-full bg-teal-300/20 blur-3xl"
        aria-hidden
      />

      <div className="relative max-w-4xl mx-auto px-4 sm:px-6">
        <div className="rounded-3xl border border-white/25 bg-white/[0.97] shadow-2xl shadow-teal-900/25 backdrop-blur-sm overflow-hidden">
          <div className="grid lg:grid-cols-[1.15fr_0.85fr] gap-0">
            <div className="px-6 py-10 sm:px-10 sm:py-12 text-left">
              <div className="inline-flex items-center gap-2 rounded-full bg-teal-50 border border-teal-100/80 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-teal-800 mb-5">
                <Sparkles className="w-3.5 h-3.5 text-teal-600 shrink-0" aria-hidden />
                {badge}
              </div>

              <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-gray-900 leading-[1.1] mb-4">
                <span className="bg-gradient-to-r from-teal-700 via-emerald-600 to-cyan-700 bg-clip-text text-transparent">
                  {title}
                </span>
              </h2>

              <p className="text-gray-600 text-base sm:text-lg leading-relaxed mb-8 max-w-xl">
                {subtitle}
              </p>

              <ul className="space-y-3 mb-8">
                {bullets.map(({ t, Icon }) => (
                  <li
                    key={t}
                    className="flex items-start gap-3 text-gray-800 text-sm sm:text-base font-medium"
                  >
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-md shadow-teal-600/25">
                      <Icon className="w-4 h-4" aria-hidden />
                    </span>
                    <span className="pt-1">{t}</span>
                  </li>
                ))}
              </ul>

              <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                <button
                  type="button"
                  onClick={onClick}
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl bg-gradient-to-r from-teal-600 via-emerald-600 to-teal-600 bg-[length:200%_100%] text-white font-bold text-base hover:bg-right transition-[background-position] duration-500 shadow-lg shadow-teal-600/35 ring-2 ring-white/60 ring-offset-2 ring-offset-white"
                >
                  {cta}
                  <ArrowRight className="w-5 h-5 shrink-0" aria-hidden />
                </button>
                {!user && (
                  <p className="text-sm text-gray-500 sm:pl-1">
                    <span>
                      {language === 'en'
                        ? 'Already have an account?'
                        : language === 'fr'
                          ? 'Déjà un compte ?'
                          : 'Gat akaont?'}
                    </span>{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('signin');
                        setShowAuth(true);
                      }}
                      className="text-teal-700 font-bold hover:underline underline-offset-2"
                    >
                      {language === 'en' ? 'Sign in' : language === 'fr' ? 'Se connecter' : 'Saen in'}
                    </button>
                  </p>
                )}
              </div>
            </div>

            {/* Accent column */}
            <div className="relative min-h-[200px] lg:min-h-0 bg-gradient-to-br from-teal-600 via-emerald-600 to-teal-800 p-8 sm:p-10 flex flex-col justify-between">
              <div
                className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_30%_20%,white,transparent_50%)]"
                aria-hidden
              />
              <div className="relative">
                <div className="w-16 h-16 mb-6 rounded-2xl bg-white/15 backdrop-blur-sm border border-white/25 flex items-center justify-center shadow-lg">
                  <Store className="w-8 h-8 text-white" aria-hidden />
                </div>
                <p className="text-white/95 text-lg sm:text-xl font-bold leading-snug mb-2">
                  {language === 'en'
                    ? 'Your next guests are browsing right now.'
                    : language === 'fr'
                      ? 'Vos prochains clients consultent l’appli maintenant.'
                      : 'Nex guest oli lukluk long app naoia.'}
                </p>
                <p className="text-teal-100/90 text-sm leading-relaxed">
                  {language === 'en'
                    ? 'Join StikmNek — simple onboarding, friendly review, then you’re live.'
                    : language === 'fr'
                      ? 'Rejoignez StikmNek — inscription simple, validation bienveillante, puis vous êtes en ligne.'
                      : 'Joinem StikmNek — isi onboarding, review gudfala, afta yu stap live.'}
                </p>
              </div>
              <div className="relative mt-8 flex flex-wrap gap-2">
                <span className="inline-flex items-center rounded-lg bg-black/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-white/90 border border-white/10">
                  {language === 'en' ? 'Port Vila & beyond' : language === 'fr' ? 'Port-Vila & plus' : 'Port Vila mo'}
                </span>
                <span className="inline-flex items-center rounded-lg bg-black/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-white/90 border border-white/10">
                  {language === 'en' ? 'Deals & discounts' : language === 'fr' ? 'Offres & promos' : 'Ol dil'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ListYourBusinessCta;
