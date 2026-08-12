import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '@/contexts/AppContext';
import { ArrowRight, Sparkles, Users, Gift, ListOrdered, PartyPopper } from 'lucide-react';

/** Multicolour micro-tile mosaic (same SVG as vibrant redesign; reads as confetti on a green base). */
const COLOUR_TILES_BG =
  "url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2240%22%20height%3D%2240%22%3E%3Crect%20width%3D%2240%22%20height%3D%2240%22%20fill%3D%22none%22%2F%3E%3Crect%20x%3D%222%22%20y%3D%223%22%20width%3D%227%22%20height%3D%227%22%20rx%3D%222%22%20fill%3D%22%23e879f9%22%20fill-opacity%3D%220.22%22%2F%3E%3Crect%20x%3D%2212%22%20y%3D%222%22%20width%3D%226%22%20height%3D%228%22%20rx%3D%222%22%20fill%3D%22%23fb923c%22%20fill-opacity%3D%220.2%22%2F%3E%3Crect%20x%3D%2220%22%20y%3D%224%22%20width%3D%228%22%20height%3D%226%22%20rx%3D%222%22%20fill%3D%22%23a78bfa%22%20fill-opacity%3D%220.24%22%2F%3E%3Crect%20x%3D%2230%22%20y%3D%2212%22%20width%3D%226%22%20height%3D%226%22%20rx%3D%222%22%20fill%3D%22%23fb7185%22%20fill-opacity%3D%220.18%22%2F%3E%3Crect%20x%3D%224%22%20y%3D%2214%22%20width%3D%226%22%20height%3D%226%22%20rx%3D%222%22%20fill%3D%22%23fbbf24%22%20fill-opacity%3D%220.2%22%2F%3E%3Crect%20x%3D%2214%22%20y%3D%2214%22%20width%3D%227%22%20height%3D%227%22%20rx%3D%222%22%20fill%3D%22%2338bdf8%22%20fill-opacity%3D%220.16%22%2F%3E%3Crect%20x%3D%2224%22%20y%3D%2216%22%20width%3D%227%22%20height%3D%226%22%20rx%3D%222%22%20fill%3D%22%23c084fc%22%20fill-opacity%3D%220.2%22%2F%3E%3Crect%20x%3D%223%22%20y%3D%2224%22%20width%3D%228%22%20height%3D%227%22%20rx%3D%222%22%20fill%3D%22%23f472b6%22%20fill-opacity%3D%220.17%22%2F%3E%3Crect%20x%3D%2214%22%20y%3D%2226%22%20width%3D%226%22%20height%3D%227%22%20rx%3D%222%22%20fill%3D%22%23fcd34d%22%20fill-opacity%3D%220.18%22%2F%3E%3Crect%20x%3D%2224%22%20y%3D%2224%22%20width%3D%227%22%20height%3D%228%22%20rx%3D%222%22%20fill%3D%22%238b5cf6%22%20fill-opacity%3D%220.2%22%2F%3E%3C%2Fsvg%3E')";

/**
 * Replaces the removed home-page listing form: prompts business owners to sign up / sign in
 * or opens the dedicated listing route when already on a business account.
 */
const ListYourBusinessCta: React.FC = () => {
  const navigate = useNavigate();
  const { language, user, setCurrentView } = useAppContext();

  const onClick = () => {
    setCurrentView('list-business');
    navigate('/list-your-business');
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

  const iconRing = 'from-teal-500 to-emerald-600';
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

  const processIntro =
    language === 'en'
      ? { kicker: 'How it works', title: 'List from your phone — a few quick steps' }
      : language === 'fr'
        ? { kicker: 'Comment ça marche', title: 'Tout depuis votre téléphone, en quelques étapes' }
        : { kicker: 'Hao i wok', title: 'Long fon — ol step i isi' };

  const processSteps: string[] =
    language === 'en'
      ? [
          'Log in (or create a free business account).',
          'Upload photos and add a short description.',
          'Set your price and discount.',
          'Add your contacts — phone, email & WhatsApp.',
          'Submit for approval.',
          'Once approved, your deal is live!',
        ]
      : language === 'fr'
        ? [
            'Connectez-vous (ou créez un compte entreprise gratuit).',
            'Ajoutez des photos et une courte description.',
            'Indiquez votre prix et votre remise.',
            'Ajoutez vos contacts : téléphone, e-mail et WhatsApp.',
            'Envoyez pour validation.',
            'Une fois validé, votre offre est en ligne !',
          ]
        : [
            'Log in (o mekem fri bisnis akaont).',
            'Uploadem foto mo wan smol description.',
            'Putem price mo discount.',
            'Putem kontak — fon, email mo WhatsApp.',
            'Submitem blong approval.',
            'Taim oli approvem, deal blong yu i stap LIVE!',
          ];

  return (
    <section className="relative py-16 sm:py-20 overflow-hidden border-t border-teal-200/50">
      {/* Green / lagoon base */}
      <div className="absolute inset-0 bg-gradient-to-b from-sky-200 via-cyan-300 to-teal-700" aria-hidden />
      <div
        className="absolute inset-0 bg-gradient-to-br from-amber-100/45 via-transparent to-emerald-800/30"
        aria-hidden
      />
      <div
        className="absolute inset-0 opacity-90 bg-[radial-gradient(ellipse_120%_80%_at_50%_-15%,rgba(255,255,255,0.7),transparent_55%),radial-gradient(circle_at_88%_12%,rgba(251,191,36,0.4),transparent_40%),radial-gradient(circle_at_8%_88%,rgba(20,184,166,0.28),transparent_42%)]"
        aria-hidden
      />

      {/* Colour tiles on top of green (kept from vibrant palette) */}
      <div
        className="absolute inset-0 opacity-[0.42] mix-blend-multiply bg-[length:40px_40px]"
        style={{ backgroundImage: COLOUR_TILES_BG }}
        aria-hidden
      />
      <div
        className="absolute inset-0 opacity-25 bg-[linear-gradient(180deg,transparent_0%,rgba(255,255,255,0.12)_45%,rgba(6,182,212,0.1)_100%)]"
        aria-hidden
      />

      <div className="relative z-[1] max-w-4xl mx-auto px-4 sm:px-6">
        <div className="rounded-3xl border border-white/50 bg-white/[0.97] shadow-2xl shadow-teal-900/25 backdrop-blur-sm overflow-hidden ring-1 ring-teal-100/90">
          <div className="grid lg:grid-cols-[1.15fr_0.85fr] gap-0">
            <div className="px-6 py-10 sm:px-10 sm:py-12 text-left border-b lg:border-b-0 lg:border-r border-teal-100/80">
              <div className="inline-flex items-center gap-2 rounded-full bg-teal-50 border border-teal-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-teal-800 mb-5">
                <Sparkles className="w-3.5 h-3.5 text-teal-600 shrink-0" aria-hidden />
                {badge}
              </div>

              <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-gray-900 leading-[1.1] mb-4">
                <span className="bg-gradient-to-r from-teal-700 via-emerald-600 to-cyan-700 bg-clip-text text-transparent">
                  {title}
                </span>
              </h2>

              <p className="text-gray-600 text-sm sm:text-base leading-relaxed mb-8 max-w-xl">
                {subtitle}
              </p>

              <ul className="space-y-3 mb-8">
                {bullets.map(({ t, Icon }) => (
                  <li
                    key={t}
                    className="flex items-start gap-3 text-gray-800 text-sm sm:text-base font-medium"
                  >
                    <span
                      className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${iconRing} text-white shadow-md shadow-teal-600/25`}
                    >
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
                  className="group inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl bg-gradient-to-r from-teal-600 via-emerald-600 to-teal-600 bg-[length:200%_100%] bg-left text-white font-bold text-base hover:bg-right transition-[background-position,transform] duration-500 shadow-lg shadow-teal-600/35 hover:-translate-y-0.5 active:translate-y-0"
                >
                  {cta}
                  <ArrowRight className="w-5 h-5 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </button>
                {!user && (
                  <p className="text-sm text-gray-500 sm:pl-1">
                    <span>
                      {language === 'en'
                        ? 'Already have an account?'
                        : language === 'fr'
                          ? 'Déjà un compte ?'
                          : 'Gat akaon?'}
                    </span>{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('signin');
                        setShowAuth(true);
                      }}
                      className="text-teal-700 font-semibold hover:underline underline-offset-2"
                    >
                      {language === 'en' ? 'Sign in' : language === 'fr' ? 'Se connecter' : 'Saen in'}
                    </button>
                  </p>
                )}
              </div>
            </div>

            <div className="relative min-h-[280px] lg:min-h-0 bg-gradient-to-br from-teal-600 via-emerald-600 to-teal-800 p-6 sm:p-8 flex flex-col">
              <div
                className="absolute inset-0 opacity-25 bg-[radial-gradient(circle_at_28%_18%,rgba(255,255,255,0.45),transparent_50%)]"
                aria-hidden
              />
              <div
                className="absolute inset-0 opacity-20 mix-blend-overlay bg-[length:28px_28px] bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2228%22%20height%3D%2228%22%3E%3Crect%20x%3D%221%22%20y%3D%221%22%20width%3D%225%22%20height%3D%225%22%20rx%3D%221%22%20fill%3D%22%23fff%22%20fill-opacity%3D%220.12%22%2F%3E%3Crect%20x%3D%2215%22%20y%3D%228%22%20width%3D%225%22%20height%3D%225%22%20rx%3D%221%22%20fill%3D%22%23fff%22%20fill-opacity%3D%220.1%22%2F%3E%3Crect%20x%3D%228%22%20y%3D%2216%22%20width%3D%225%22%20height%3D%225%22%20rx%3D%221%22%20fill%3D%22%23fff%22%20fill-opacity%3D%220.14%22%2F%3E%3C%2Fsvg%3E')]"
                aria-hidden
              />

              <div className="relative flex-1 min-h-0 flex flex-col">
                <div className="flex items-start gap-3 mb-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/30 backdrop-blur-sm">
                    <ListOrdered className="h-5 w-5 text-white" aria-hidden />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-teal-100/90 mb-1">
                      {processIntro.kicker}
                    </p>
                    <h3 className="text-base sm:text-lg font-bold text-white leading-snug">
                      {processIntro.title}
                    </h3>
                  </div>
                </div>

                <ul
                  className="list-none space-y-2.5 sm:space-y-3 flex-1 overflow-y-auto pr-1 [scrollbar-width:thin] m-0 p-0"
                  aria-label={processIntro.title}
                >
                  {processSteps.map((step, i) => {
                    const isLast = i === processSteps.length - 1;
                    return (
                      <li key={i} className="flex gap-3 items-start">
                        <span
                          className={`relative mt-0.5 flex shrink-0 items-center justify-center rounded-full font-black tabular-nums leading-none select-none ${
                            isLast
                              ? 'size-8 min-h-8 min-w-8 aspect-square bg-gradient-to-br from-amber-200 via-orange-400 to-rose-500 text-white text-sm shadow-[0_4px_14px_-2px_rgba(249,115,22,0.55)] ring-2 ring-white/70 ring-offset-2 ring-offset-teal-800/80'
                              : 'size-7 min-h-7 min-w-7 aspect-square bg-black/20 text-white text-xs ring-1 ring-white/25'
                          }`}
                        >
                          {isLast && (
                            <PartyPopper
                              className="pointer-events-none absolute -right-1 -top-1 h-3.5 w-3.5 text-amber-100 drop-shadow-md opacity-95"
                              aria-hidden
                            />
                          )}
                          <span className={isLast ? 'relative z-[1]' : undefined}>{i + 1}</span>
                        </span>
                        <span
                          className={`text-[13px] sm:text-sm leading-snug pt-0.5 ${
                            isLast ? 'text-white font-semibold' : 'text-teal-50/95 font-medium'
                          }`}
                        >
                          {step}
                        </span>
                      </li>
                    );
                  })}
                </ul>

                <div className="relative mt-5 pt-4 border-t border-white/15 flex flex-wrap gap-2">
                  <span className="inline-flex items-center rounded-lg bg-black/20 px-2.5 py-1 text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-white/95 ring-1 ring-white/10">
                    {language === 'en'
                      ? 'Made for mobile'
                      : language === 'fr'
                        ? 'Pensé pour le mobile'
                        : 'I stret long fon'}
                  </span>
                  <span className="inline-flex items-center rounded-lg bg-black/20 px-2.5 py-1 text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-white/95 ring-1 ring-white/10">
                    {language === 'en'
                      ? 'Vanuatu wide'
                      : language === 'fr'
                        ? 'Tout le Vanuatu'
                        : 'Vanuatu wide'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ListYourBusinessCta;
