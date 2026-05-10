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
      ? 'Vanuatu — let’s glow up your listing'
      : language === 'fr'
        ? 'Vanuatu — mettez votre annonce en lumière'
        : 'Vanuatu — mekem listing blong yu i stap strong';

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
          { t: 'List your products or business for FREE!', Icon: Gift, ring: 'from-amber-400 to-orange-500' },
          { t: 'WhatsApp-ready leads', Icon: Sparkles, ring: 'from-fuchsia-500 to-violet-600' },
          { t: 'Reach visitors before they arrive!', Icon: Users, ring: 'from-sky-400 to-blue-600' },
        ]
      : language === 'fr'
        ? [
            {
              t: 'Listez vos produits ou votre entreprise GRATUITEMENT !',
              Icon: Gift,
              ring: 'from-amber-400 to-orange-500',
            },
            { t: 'Contacts prêts pour WhatsApp', Icon: Sparkles, ring: 'from-fuchsia-500 to-violet-600' },
            { t: 'Touchez les visiteurs avant leur arrivée !', Icon: Users, ring: 'from-sky-400 to-blue-600' },
          ]
        : [
            { t: 'Listem ol product o bisnis blong yu — FREE!', Icon: Gift, ring: 'from-amber-400 to-orange-500' },
            { t: 'WhatsApp leads', Icon: Sparkles, ring: 'from-fuchsia-500 to-violet-600' },
            { t: 'Rijim turis bifo oli arrive!', Icon: Users, ring: 'from-sky-400 to-blue-600' },
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
    <section className="relative py-20 sm:py-24 overflow-hidden border-t border-white/5">
      {/* Night-sky base + tropical sunset glows (no green) */}
      <div className="absolute inset-0 bg-[#0a0612]" aria-hidden />
      <div
        className="absolute inset-0 bg-gradient-to-br from-violet-950 via-[#1a0b2e] to-indigo-950"
        aria-hidden
      />
      <div
        className="absolute -top-32 left-[10%] h-[420px] w-[420px] rounded-full bg-orange-500/40 blur-[110px]"
        aria-hidden
      />
      <div
        className="absolute top-1/3 -right-20 h-[380px] w-[380px] rounded-full bg-fuchsia-500/35 blur-[100px]"
        aria-hidden
      />
      <div
        className="absolute bottom-0 left-1/3 h-[320px] w-[320px] rounded-full bg-rose-500/25 blur-[90px]"
        aria-hidden
      />
      <div
        className="absolute bottom-10 right-1/4 h-48 w-48 rounded-full bg-cyan-400/15 blur-[70px]"
        aria-hidden
      />

      {/* Vibrant micro-tiles: coral / violet / mango / electric blue */}
      <div
        className="absolute inset-0 opacity-[0.45] mix-blend-screen bg-[length:40px_40px] bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2240%22%20height%3D%2240%22%3E%3Crect%20width%3D%2240%22%20height%3D%2240%22%20fill%3D%22none%22%2F%3E%3Crect%20x%3D%222%22%20y%3D%223%22%20width%3D%227%22%20height%3D%227%22%20rx%3D%222%22%20fill%3D%22%23e879f9%22%20fill-opacity%3D%220.22%22%2F%3E%3Crect%20x%3D%2212%22%20y%3D%222%22%20width%3D%226%22%20height%3D%228%22%20rx%3D%222%22%20fill%3D%22%23fb923c%22%20fill-opacity%3D%220.2%22%2F%3E%3Crect%20x%3D%2220%22%20y%3D%224%22%20width%3D%228%22%20height%3D%226%22%20rx%3D%222%22%20fill%3D%22%23a78bfa%22%20fill-opacity%3D%220.24%22%2F%3E%3Crect%20x%3D%2230%22%20y%3D%2212%22%20width%3D%226%22%20height%3D%226%22%20rx%3D%222%22%20fill%3D%22%23fb7185%22%20fill-opacity%3D%220.18%22%2F%3E%3Crect%20x%3D%224%22%20y%3D%2214%22%20width%3D%226%22%20height%3D%226%22%20rx%3D%222%22%20fill%3D%22%23fbbf24%22%20fill-opacity%3D%220.2%22%2F%3E%3Crect%20x%3D%2214%22%20y%3D%2214%22%20width%3D%227%22%20height%3D%227%22%20rx%3D%222%22%20fill%3D%22%2338bdf8%22%20fill-opacity%3D%220.16%22%2F%3E%3Crect%20x%3D%2224%22%20y%3D%2216%22%20width%3D%227%22%20height%3D%226%22%20rx%3D%222%22%20fill%3D%22%23c084fc%22%20fill-opacity%3D%220.2%22%2F%3E%3Crect%20x%3D%223%22%20y%3D%2224%22%20width%3D%228%22%20height%3D%227%22%20rx%3D%222%22%20fill%3D%22%23f472b6%22%20fill-opacity%3D%220.17%22%2F%3E%3Crect%20x%3D%2214%22%20y%3D%2226%22%20width%3D%226%22%20height%3D%227%22%20rx%3D%222%22%20fill%3D%22%23fcd34d%22%20fill-opacity%3D%220.18%22%2F%3E%3Crect%20x%3D%2224%22%20y%3D%2224%22%20width%3D%227%22%20height%3D%228%22%20rx%3D%222%22%20fill%3D%22%238b5cf6%22%20fill-opacity%3D%220.2%22%2F%3E%3C%2Fsvg%3E')]"
        aria-hidden
      />
      <div
        className="absolute inset-0 opacity-[0.07] bg-[linear-gradient(105deg,transparent_40%,rgba(255,255,255,0.9)_50%,transparent_60%)] bg-[length:200%_100%]"
        aria-hidden
      />

      <div className="relative z-[1] max-w-5xl mx-auto px-4 sm:px-6">
        <div className="relative rounded-[2rem] overflow-hidden shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_25px_80px_-12px_rgba(0,0,0,0.65),0_0_120px_-20px_rgba(236,72,153,0.35)]">
          {/* Outer glow frame */}
          <div
            className="pointer-events-none absolute -inset-px rounded-[2rem] bg-gradient-to-br from-fuchsia-500/50 via-orange-400/40 to-cyan-400/30 opacity-80 blur-sm"
            aria-hidden
          />

          <div className="relative grid lg:grid-cols-12 gap-0 min-h-[320px]">
            {/* Copy column — dark glass */}
            <div className="lg:col-span-7 relative px-6 py-10 sm:px-10 sm:py-12 bg-slate-950/88 backdrop-blur-xl border-b lg:border-b-0 lg:border-r border-white/10">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-400 via-fuchsia-500 to-violet-600 opacity-90" aria-hidden />

              <div className="inline-flex items-center gap-2 rounded-full border border-fuchsia-400/35 bg-gradient-to-r from-fuchsia-500/15 to-orange-500/10 px-3.5 py-1.5 text-[11px] sm:text-xs font-bold uppercase tracking-[0.2em] text-fuchsia-100 mb-6 pl-4">
                <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0" aria-hidden />
                {badge}
              </div>

              <h2 className="text-3xl sm:text-4xl lg:text-[2.35rem] font-black tracking-tight text-white leading-[1.08] mb-5">
                <span className="block text-white/95">{title}</span>
                <span className="mt-2 block text-lg sm:text-xl font-extrabold bg-gradient-to-r from-amber-300 via-orange-400 to-rose-400 bg-clip-text text-transparent">
                  {language === 'en'
                    ? 'Turn heads. Fill seats. Start tonight.'
                    : language === 'fr'
                      ? 'Attirez l’œil. Remplissez vos créneaux. Lancez-vous ce soir.'
                      : 'Mekem turis i lukim yu. Fullem spot. Stat naoia.'}
                </span>
              </h2>

              <p className="text-slate-300 text-sm sm:text-base leading-relaxed mb-8 max-w-lg">
                {subtitle}
              </p>

              <ul className="space-y-4 mb-10">
                {bullets.map(({ t, Icon, ring }) => (
                  <li
                    key={t}
                    className="flex items-start gap-3.5 text-slate-100 text-sm sm:text-base font-semibold leading-snug"
                  >
                    <span
                      className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${ring} text-white shadow-lg shadow-black/30 ring-2 ring-white/15`}
                    >
                      <Icon className="w-[18px] h-[18px]" aria-hidden />
                    </span>
                    <span className="pt-1.5">{t}</span>
                  </li>
                ))}
              </ul>

              <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-4">
                <button
                  type="button"
                  onClick={onClick}
                  className="group inline-flex items-center justify-center gap-2 px-9 py-4 rounded-2xl font-black text-base uppercase tracking-wide text-slate-950 bg-gradient-to-r from-amber-300 via-orange-400 to-rose-500 bg-[length:180%_100%] bg-left hover:bg-right transition-[background-position,transform] duration-500 shadow-[0_12px_40px_-8px_rgba(251,146,60,0.55)] hover:shadow-[0_16px_48px_-6px_rgba(244,63,94,0.5)] hover:-translate-y-0.5 active:translate-y-0"
                >
                  {cta}
                  <ArrowRight className="w-5 h-5 shrink-0 transition-transform group-hover:translate-x-1" aria-hidden />
                </button>
                {!user && (
                  <p className="text-sm text-slate-400">
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
                      className="text-fuchsia-300 font-bold hover:text-white underline decoration-fuchsia-500/60 underline-offset-4 transition-colors"
                    >
                      {language === 'en' ? 'Sign in' : language === 'fr' ? 'Se connecter' : 'Saen in'}
                    </button>
                  </p>
                )}
              </div>
            </div>

            {/* Energy column — sunset gradient */}
            <div className="lg:col-span-5 relative flex flex-col justify-between min-h-[260px] p-8 sm:p-10 bg-gradient-to-br from-violet-600 via-fuchsia-600 to-orange-500">
              <div
                className="absolute inset-0 opacity-30 mix-blend-overlay bg-[radial-gradient(circle_at_20%_30%,white,transparent_45%)]"
                aria-hidden
              />
              <div
                className="absolute inset-0 opacity-25 bg-[length:24px_24px] bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%3E%3Ccircle%20cx%3D%224%22%20cy%3D%224%22%20r%3D%221.5%22%20fill%3D%22%23fff%22%20fill-opacity%3D%220.15%22%2F%3E%3Ccircle%20cx%3D%2216%22%20cy%3D%2212%22%20r%3D%221%22%20fill%3D%22%23fff%22%20fill-opacity%3D%220.2%22%2F%3E%3Ccircle%20cx%3D%2210%22%20cy%3D%2218%22%20r%3D%221.2%22%20fill%3D%22%23fff%22%20fill-opacity%3D%220.12%22%2F%3E%3C%2Fsvg%3E')]"
                aria-hidden
              />

              <div className="relative">
                <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-black/20 ring-2 ring-white/30 backdrop-blur-sm mb-6 shadow-lg">
                  <Store className="w-7 h-7 text-white drop-shadow-md" aria-hidden />
                </div>
                <p className="text-white font-black text-2xl sm:text-3xl leading-tight drop-shadow-md mb-3">
                  {language === 'en'
                    ? 'Guests are scrolling. Be the stop they save.'
                    : language === 'fr'
                      ? 'Les voyageurs scrollent. Soyez leur coup de cœur.'
                      : 'Turis oli scroll. Mekem yu nambawan we oli save.'}
                </p>
                <p className="text-white/90 text-sm sm:text-base font-medium leading-relaxed max-w-sm">
                  {language === 'en'
                    ? 'StikmNek is built for quick setup, real WhatsApp connections, and deals that feel alive — not a dusty directory.'
                    : language === 'fr'
                      ? 'StikmNek, c’est une mise en ligne rapide, du WhatsApp réel, et des offres vivantes — pas un annuaire poussiéreux.'
                      : 'StikmNek i isi blong setup, WhatsApp stret, mo ol dil we i laef — no wan ol directory we i ded.'}
                </p>
              </div>

              <div className="relative mt-8 flex flex-wrap gap-2">
                <span className="rounded-full bg-black/25 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-white ring-1 ring-white/25 backdrop-blur-sm">
                  {language === 'en' ? 'Island deals' : language === 'fr' ? 'Offres insulaires' : 'Ol dil blong aelan'}
                </span>
                <span className="rounded-full bg-black/25 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-white ring-1 ring-white/25 backdrop-blur-sm">
                  {language === 'en' ? 'Live in minutes' : language === 'fr' ? 'En ligne vite' : 'Live kwiktaem'}
                </span>
                <span className="rounded-full bg-black/25 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-white ring-1 ring-white/25 backdrop-blur-sm">
                  {language === 'en' ? 'Port Vila +' : language === 'fr' ? 'Port-Vila +' : 'Port Vila +'}
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
