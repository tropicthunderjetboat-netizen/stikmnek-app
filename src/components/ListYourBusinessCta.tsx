import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '@/contexts/AppContext';
import { Store, ArrowRight, Sparkles, Users, Gift } from 'lucide-react';

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
          { t: 'List your products or business for FREE!', Icon: Gift },
          { t: 'WhatsApp-ready leads', Icon: Sparkles },
          { t: 'Reach visitors before they arrive!', Icon: Users },
        ]
      : language === 'fr'
        ? [
            { t: 'Listez vos produits ou votre entreprise GRATUITEMENT !', Icon: Gift },
            { t: 'Contacts prêts pour WhatsApp', Icon: Sparkles },
            { t: 'Touchez les visiteurs avant leur arrivée !', Icon: Users },
          ]
        : [
            { t: 'Listem ol product o bisnis blong yu — FREE!', Icon: Gift },
            { t: 'WhatsApp leads', Icon: Sparkles },
            { t: 'Rijim turis bifo oli arrive!', Icon: Users },
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
    <section className="relative py-16 sm:py-20 overflow-hidden border-t border-cyan-200/60">
      {/* Island-inspired backdrop: sky → lagoon → reef */}
      <div
        className="absolute inset-0 bg-gradient-to-b from-sky-200 via-cyan-300 to-teal-700"
        aria-hidden
      />
      <div
        className="absolute inset-0 bg-gradient-to-br from-amber-100/50 via-transparent to-emerald-700/35"
        aria-hidden
      />
      <div
        className="absolute inset-0 opacity-90 bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,rgba(255,255,255,0.75),transparent_55%),radial-gradient(circle_at_90%_15%,rgba(251,191,36,0.45),transparent_42%),radial-gradient(circle_at_5%_85%,rgba(16,185,129,0.25),transparent_45%)]"
        aria-hidden
      />
      {/* Colourful small green “reef tiles” mosaic */}
      <div
        className="absolute inset-0 opacity-[0.55] mix-blend-multiply bg-[length:36px_36px] bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2236%22%20height%3D%2236%22%3E%3Crect%20width%3D%2236%22%20height%3D%2236%22%20fill%3D%22none%22%2F%3E%3Crect%20x%3D%222%22%20y%3D%222%22%20width%3D%227%22%20height%3D%227%22%20rx%3D%221.5%22%20fill%3D%22%23059669%22%20fill-opacity%3D%220.35%22%2F%3E%3Crect%20x%3D%2211%22%20y%3D%223%22%20width%3D%226%22%20height%3D%226%22%20rx%3D%221.5%22%20fill%3D%22%2310b981%22%20fill-opacity%3D%220.4%22%2F%3E%3Crect%20x%3D%2219%22%20y%3D%222%22%20width%3D%228%22%20height%3D%227%22%20rx%3D%221.5%22%20fill%3D%22%2322c55e%22%20fill-opacity%3D%220.32%22%2F%3E%3Crect%20x%3D%2227%22%20y%3D%2211%22%20width%3D%227%22%20height%3D%226%22%20rx%3D%221.5%22%20fill%3D%22%23047857%22%20fill-opacity%3D%220.38%22%2F%3E%3Crect%20x%3D%223%22%20y%3D%2212%22%20width%3D%226%22%20height%3D%228%22%20rx%3D%221.5%22%20fill%3D%22%2314b8a6%22%20fill-opacity%3D%220.36%22%2F%3E%3Crect%20x%3D%2212%22%20y%3D%2212%22%20width%3D%227%22%20height%3D%227%22%20rx%3D%221.5%22%20fill%3D%22%2365a30d%22%20fill-opacity%3D%220.28%22%2F%3E%3Crect%20x%3D%2221%22%20y%3D%2213%22%20width%3D%226%22%20height%3D%226%22%20rx%3D%221.5%22%20fill%3D%22%230d9488%22%20fill-opacity%3D%220.42%22%2F%3E%3Crect%20x%3D%222%22%20y%3D%2222%22%20width%3D%228%22%20height%3D%227%22%20rx%3D%221.5%22%20fill%3D%22%2316a34a%22%20fill-opacity%3D%220.3%22%2F%3E%3Crect%20x%3D%2212%22%20y%3D%2223%22%20width%3D%227%22%20height%3D%227%22%20rx%3D%221.5%22%20fill%3D%22%23059669%22%20fill-opacity%3D%220.34%22%2F%3E%3Crect%20x%3D%2222%22%20y%3D%2222%22%20width%3D%226%22%20height%3D%228%22%20rx%3D%221.5%22%20fill%3D%22%234ade80%22%20fill-opacity%3D%220.25%22%2F%3E%3C%2Fsvg%3E')]"
        aria-hidden
      />
      {/* Soft horizon haze */}
      <div
        className="absolute inset-0 opacity-30 bg-[linear-gradient(180deg,transparent_0%,rgba(255,255,255,0.15)_40%,rgba(6,182,212,0.12)_100%)]"
        aria-hidden
      />

      <div className="relative max-w-4xl mx-auto px-4 sm:px-6">
        <div className="rounded-3xl border border-white/40 bg-white/[0.96] shadow-2xl shadow-teal-900/20 backdrop-blur-sm overflow-hidden ring-1 ring-cyan-100/80">
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
            <div className="relative min-h-[200px] lg:min-h-0 bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-900 p-8 sm:p-10 flex flex-col justify-between">
              <div
                className="absolute inset-0 opacity-25 bg-[length:28px_28px] mix-blend-overlay bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2228%22%20height%3D%2228%22%3E%3Crect%20x%3D%221%22%20y%3D%221%22%20width%3D%225%22%20height%3D%225%22%20rx%3D%221%22%20fill%3D%22%23fff%22%20fill-opacity%3D%220.12%22%2F%3E%3Crect%20x%3D%2215%22%20y%3D%228%22%20width%3D%225%22%20height%3D%225%22%20rx%3D%221%22%20fill%3D%22%23fff%22%20fill-opacity%3D%220.1%22%2F%3E%3Crect%20x%3D%228%22%20y%3D%2216%22%20width%3D%225%22%20height%3D%225%22%20rx%3D%221%22%20fill%3D%22%23fff%22%20fill-opacity%3D%220.14%22%2F%3E%3C%2Fsvg%3E')]"
                aria-hidden
              />
              <div
                className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_30%_15%,rgba(255,255,255,0.5),transparent_55%)]"
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
