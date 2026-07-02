import React, { useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Banknote,
  Gift,
  Globe,
  Heart,
  MessageCircle,
  Sparkles,
  Store,
  Ticket,
  Check,
} from 'lucide-react';
import { useAppContext } from '@/contexts/AppContext';
import { APP_ICON } from '@/lib/brand';
import { touristFacingOfferings } from '@/data/businesses';
import { t } from '@/data/translations';
import LanguageFlag from '@/components/LanguageFlag';
import { CONCIERGE_CAPTURE_MESSAGE, outreachWhatsAppUrl } from '@/data/contact';

const WhatsAppIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

/**
 * Outreach landing page — linked from messages to business owners.
 * Bold, mobile-first explainer: benefits, WhatsApp contact, direct payment, grassroots mission.
 */
const ForBusinessLanding: React.FC = () => {
  const navigate = useNavigate();
  const { user, setShowAuth, setAuthMode, dbBusinesses, language, setLanguage } = useAppContext();

  const liveDeals = useMemo(() => touristFacingOfferings(dbBusinesses).length, [dbBusinesses]);

  const langOptions = [
    { code: 'en' as const, label: 'English' },
    { code: 'fr' as const, label: 'Français' },
    { code: 'bi' as const, label: 'Bislama' },
  ];

  const onJoin = () => {
    if (!user) {
      setAuthMode('signup-business');
      setShowAuth(true);
      return;
    }
    if (user.type === 'business' || user.type === 'admin') {
      navigate('/business/new');
      return;
    }
    setAuthMode('signup-business');
    setShowAuth(true);
  };

  const ctaLabel =
    user?.type === 'business' || user?.type === 'admin' ? 'Add my deal now' : 'Set up online yourself';

  const conciergeWaUrl = outreachWhatsAppUrl(CONCIERGE_CAPTURE_MESSAGE);

  const benefits = [
    { Icon: Gift, title: 'No listing fee', body: 'Join at zero cost — no advertising invoice, no contract.' },
    { Icon: Store, title: 'You set the deal', body: 'Your discount, your prices, your photos — change anytime.' },
    { Icon: BarChart3, title: 'Track redemptions', body: 'See every scan in your dashboard with real numbers.' },
    {
      Icon: MessageCircle,
      title: 'WhatsApp enquiries',
      body: 'Pass holders tap WhatsApp on your listing and message you directly.',
    },
    {
      Icon: Banknote,
      title: 'They pay you directly',
      body: 'Tourists pay you in vatu at your door — StikmNek never takes a cut.',
    },
    {
      Icon: Globe,
      title: 'Three languages',
      body: 'List in English, French, and Bislama — the app works in all three.',
    },
    { Icon: BadgeCheck, title: 'Verified passes', body: 'Scan QR codes in the app — no fake paper vouchers.' },
    {
      Icon: Heart,
      title: 'Built for grassroots',
      body: 'For family-run tours, cafes, and operators — not just big resorts.',
    },
  ];

  return (
    <>
      <Helmet prioritizeSeoTags>
        <title>Join StikmNek | Vanuatu Business Deals</title>
        <meta
          name="description"
          content="Join StikmNek at zero cost. Direct WhatsApp contact from tourists, they pay you in vatu, you control your deal. English, French & Bislama. Built for grassroots Vanuatu businesses."
        />
        <link rel="canonical" href="https://www.stikmnek.com/for-business" />
      </Helmet>

      <div className="min-h-screen bg-gradient-to-b from-teal-950 via-teal-900 to-emerald-950 text-white">
        {/* Hero */}
        <section className="relative px-4 pt-24 pb-10 sm:px-6 sm:pt-28 sm:pb-14 overflow-hidden">
          <div
            className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_20%_0%,rgba(52,211,153,0.35),transparent_45%),radial-gradient(circle_at_90%_20%,rgba(251,191,36,0.2),transparent_40%)]"
            aria-hidden
          />
          <div className="relative max-w-lg mx-auto text-center">
            <img
              src={APP_ICON}
              alt=""
              className="w-16 h-16 mx-auto rounded-2xl shadow-xl shadow-black/30 mb-6"
            />
            <p className="text-teal-200/90 text-xs font-bold uppercase tracking-[0.2em] mb-3">
              For Vanuatu businesses
            </p>
            <h1 className="text-3xl sm:text-4xl font-black leading-[1.08] tracking-tight mb-4">
              Your deal. Your discount.
              <span className="block text-emerald-300 mt-1">You&apos;re in complete control.</span>
            </h1>
            <p className="text-teal-100/85 text-base sm:text-lg leading-relaxed mb-8">
              StikmNek is Vanuatu&apos;s tourist deals app — and it costs you nothing to join. You choose your
              offer, set your discount, and decide when it&apos;s live. Each tourist buys one pass for their trip
              — that lets them use deals at every business on StikmNek, including yours. Your discount only
              applies when they visit you and you scan their pass — and you can track every one in your dashboard.
            </p>

            <div className="flex flex-wrap justify-center gap-2 mb-8">
              {[
                { Icon: Gift, t: 'No listing fee' },
                { Icon: Store, t: 'You set the deal' },
                { Icon: BarChart3, t: 'Track redemptions' },
              ].map(({ Icon, t: label }) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/95"
                >
                  <Icon className="w-3.5 h-3.5 text-emerald-300" aria-hidden />
                  {label}
                </span>
              ))}
            </div>

            <button
              type="button"
              onClick={onJoin}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl bg-white/10 border border-white/25 text-white font-bold text-base hover:bg-white/15 active:scale-[0.98] transition-all"
            >
              {ctaLabel}
              <ArrowRight className="w-5 h-5" aria-hidden />
            </button>
            {!user && (
              <button
                type="button"
                onClick={() => {
                  setAuthMode('signin');
                  setShowAuth(true);
                }}
                className="mt-4 block w-full text-sm font-semibold text-teal-200/90 hover:text-white underline-offset-2 hover:underline"
              >
                Already have an account? Sign in
              </button>
            )}
          </div>
        </section>

        {/* Two ways to join */}
        <section className="px-4 pb-10 sm:px-6">
          <div className="max-w-lg mx-auto space-y-4">
            <h2 className="text-center text-lg font-black">Two ways to join</h2>

            <div className="rounded-2xl border-2 border-green-400/40 bg-gradient-to-br from-green-950/50 to-emerald-950/40 p-5 sm:p-6 ring-1 ring-green-400/20">
              <div className="flex items-center gap-2 mb-3">
                <span className="rounded-full bg-green-500 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
                  Easiest
                </span>
                <p className="text-sm font-bold text-green-100">We set it up for you</p>
              </div>
              <p className="text-sm text-green-50/90 leading-relaxed mb-4">
                No signup. No password. No long form. Just send <strong className="text-white">5 things on WhatsApp</strong>{' '}
                and we create your listing. If you&apos;re not sure what deal to offer, simple examples are
                <strong className="text-white"> 10% off</strong>, <strong className="text-white">20% off</strong>,
                <strong className="text-white"> free drink with a meal</strong>, or <strong className="text-white">kids free</strong>.
              </p>
              <ol className="space-y-2 text-sm text-green-50/95 mb-5">
                {[
                  'Business name',
                  'Your deal for tourists (example: 20% off food)',
                  'Your location',
                  'Your phone or WhatsApp number',
                  '3 photos',
                ].map((item, i) => (
                  <li key={item} className="flex gap-2.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-500/30 text-xs font-black text-green-100">
                      {i + 1}
                    </span>
                    {item}
                  </li>
                ))}
              </ol>
              {conciergeWaUrl ? (
                <a
                  href={conciergeWaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full inline-flex items-center justify-center gap-2 px-6 py-4 rounded-xl bg-green-500 text-white font-black text-base shadow-lg shadow-green-900/30 hover:bg-green-400 transition-colors"
                >
                  <WhatsAppIcon className="w-5 h-5" />
                  Message us on WhatsApp
                </a>
              ) : (
                <p className="text-sm text-green-100/80 text-center">
                  Reply on WhatsApp to whoever sent you this link — send the 5 things above and they&apos;ll set you up.
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-white/15 bg-white/5 p-5 sm:p-6">
              <p className="text-sm font-bold text-white mb-2">Set up yourself online</p>
              <p className="text-sm text-teal-100/75 leading-relaxed mb-4">
                If you&apos;re comfortable on your phone and have data, you can create your listing directly — takes about
                5 minutes.
              </p>
              <button
                type="button"
                onClick={onJoin}
                className="w-full inline-flex items-center justify-center gap-2 px-6 py-4 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold text-base shadow-lg shadow-orange-900/30"
              >
                {ctaLabel}
                <ArrowRight className="w-5 h-5" aria-hidden />
              </button>
            </div>
          </div>
        </section>

        {/* Advertising has moved on */}
        <section className="px-4 pb-10 sm:px-6">
          <div className="max-w-lg mx-auto">
            <h2 className="text-center text-lg font-black mb-2 text-white/95">Advertising has moved on</h2>
            <p className="text-center text-sm text-teal-200/75 mb-5 leading-relaxed px-2">
              The old ways of reaching tourists — print maps, paid directory listings, paper vouchers — are
              fading. Visitors now search and redeem from their phones.
            </p>
            <div className="grid gap-3">
              <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-teal-200/80 mb-2">
                  What&apos;s changing
                </p>
                <ul className="space-y-2.5 text-sm text-teal-50/75">
                  <li className="flex gap-2.5">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-teal-300/60" aria-hidden />
                    Upfront fees for print maps and magazine listings
                  </li>
                  <li className="flex gap-2.5">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-teal-300/60" aria-hidden />
                    Hard to tell if anyone ever used your voucher
                  </li>
                  <li className="flex gap-2.5">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-teal-300/60" aria-hidden />
                    Paper gets left behind — tourists are looking at their phones
                  </li>
                </ul>
              </div>
              <div className="rounded-2xl border border-emerald-400/35 bg-emerald-950/50 p-4 ring-1 ring-emerald-400/20">
                <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-300 mb-2">StikmNek</p>
                <ul className="space-y-2 text-sm text-emerald-50/95">
                  <li className="flex gap-2">
                    <Check className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" aria-hidden />
                    <strong className="text-white">Zero cost</strong> to join — you control your deal & discount
                  </li>
                  <li className="flex gap-2">
                    <Check className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" aria-hidden />
                    Discount only when a tourist <strong className="text-white">redeems at your door</strong>
                  </li>
                  <li className="flex gap-2">
                    <Check className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" aria-hidden />
                    See every redemption in your dashboard — real numbers
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* WhatsApp direct contact */}
        <section className="px-4 pb-10 sm:px-6">
          <div className="max-w-lg mx-auto rounded-2xl border border-green-400/30 bg-gradient-to-br from-green-950/60 to-emerald-950/40 p-5 sm:p-6">
            <div className="flex items-start gap-3 mb-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-green-500 text-white shadow-lg shadow-green-900/30">
                <WhatsAppIcon className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-black text-white">Direct WhatsApp from the app</h2>
                <p className="text-sm text-green-100/80 mt-1 leading-relaxed">
                  Add your WhatsApp number when you list. Tourists with a StikmNek pass tap{' '}
                  <strong className="text-white">Chat on WhatsApp</strong> on your page — it opens a message
                  straight to you. Book a tour, answer a question, confirm a visit. Real enquiries, not a
                  middleman inbox.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Tourists pay you directly */}
        <section className="px-4 pb-10 sm:px-6">
          <div className="max-w-lg mx-auto rounded-2xl border border-white/15 bg-white/5 p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-lg">
                <Banknote className="w-6 h-6" aria-hidden />
              </div>
              <div>
                <h2 className="text-lg font-black text-white">Tourists pay you — not us</h2>
                <p className="text-sm text-teal-100/80 mt-1 leading-relaxed">
                  When someone redeems, you scan their pass and the app shows the{' '}
                  <strong className="text-white">StikmNek price in vatu</strong>. They pay you directly — cash,
                  card, EFTPOS, however you already take payment. StikmNek does not take a cut of what they pay
                  at your door. The tourist bought their pass separately to unlock deals across Vanuatu, including
                  yours and everyone else&apos;s on the app.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Full benefits grid */}
        <section className="px-4 pb-10 sm:px-6">
          <div className="max-w-lg mx-auto">
            <h2 className="text-center text-lg font-black mb-2">Everything you get</h2>
            <p className="text-center text-sm text-teal-200/75 mb-5">
              Built for grassroots operators — family tours, local cafes, island experiences.
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              {benefits.map(({ Icon, title, body }) => (
                <div
                  key={title}
                  className="rounded-xl border border-white/10 bg-white/5 p-4 text-left"
                >
                  <Icon className="w-5 h-5 text-emerald-300 mb-2" aria-hidden />
                  <p className="text-sm font-bold text-white">{title}</p>
                  <p className="text-xs text-teal-100/70 mt-1 leading-relaxed">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Why we built + name meaning */}
        <section className="px-4 pb-10 sm:px-6">
          <div className="max-w-lg mx-auto space-y-4">
            <div className="rounded-2xl border border-white/15 bg-white/5 p-5 sm:p-6">
              <p className="text-[11px] font-bold uppercase tracking-wider text-teal-200/80 mb-2">
                {t('footer.whyBuiltTitle', language)}
              </p>
              <p className="text-sm text-teal-50/90 leading-relaxed">{t('footer.whyBuiltBody', language)}</p>
              <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-emerald-500/15 border border-emerald-400/25 px-3 py-1.5 text-xs font-semibold text-emerald-200">
                <Heart className="w-3.5 h-3.5" aria-hidden />
                {t('footer.local_badge', language)}
              </p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/5 p-5 sm:p-6">
              <p className="text-[11px] font-bold uppercase tracking-wider text-teal-200/80 mb-2">
                {t('footer.nameMeaningTitle', language)}
              </p>
              <p className="text-sm text-teal-50/90 leading-relaxed">{t('footer.nameMeaningBody', language)}</p>
            </div>
          </div>
        </section>

        {/* Language options */}
        <section className="px-4 pb-10 sm:px-6">
          <div className="max-w-lg mx-auto rounded-2xl border border-white/15 bg-white/5 p-5 sm:p-6 text-center">
            <Globe className="w-6 h-6 mx-auto text-emerald-300 mb-3" aria-hidden />
            <h2 className="text-lg font-black mb-2">English · Français · Bislama</h2>
            <p className="text-sm text-teal-100/75 mb-4 leading-relaxed">
              StikmNek works in three languages. Switch anytime — your listing can include descriptions in
              English, French, and Bislama so every tourist understands your offer.
            </p>
            <div
              className="inline-flex flex-wrap justify-center gap-2"
              role="group"
              aria-label="Choose language"
            >
              {langOptions.map((opt) => (
                <button
                  key={opt.code}
                  type="button"
                  onClick={() => setLanguage(opt.code)}
                  aria-pressed={language === opt.code}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition-all ${
                    language === opt.code
                      ? 'bg-white text-teal-800 shadow-md'
                      : 'bg-white/10 text-white/90 border border-white/15 hover:bg-white/15'
                  }`}
                >
                  <LanguageFlag code={opt.code} />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* 3 steps */}
        <section className="px-4 pb-10 sm:px-6">
          <div className="max-w-lg mx-auto rounded-3xl bg-white text-gray-900 p-6 sm:p-8 shadow-2xl">
            <div className="flex items-center gap-2 mb-5">
              <Store className="w-5 h-5 text-teal-600" aria-hidden />
              <h2 className="text-xl font-black">Live in about 5 minutes</h2>
            </div>
            <ol className="space-y-4">
              {[
                {
                  n: '1',
                  title: 'Create your business account',
                  body: 'Sign up on your phone — no payment, no contract, no catch.',
                },
                {
                  n: '2',
                  title: 'Add photos, your deal, discount & WhatsApp',
                  body: 'You choose the offer — change it anytime from your dashboard.',
                },
                {
                  n: '3',
                  title: 'Go live — scan passes when they visit',
                  body: 'Charge the StikmNek price in vatu. Track results instantly.',
                },
              ].map((step) => (
                <li key={step.n} className="flex gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-600 to-emerald-600 text-white text-sm font-black">
                    {step.n}
                  </span>
                  <div>
                    <p className="font-bold text-gray-900">{step.title}</p>
                    <p className="text-sm text-gray-600 mt-0.5">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <button
              type="button"
              onClick={onJoin}
              className="mt-8 w-full inline-flex items-center justify-center gap-2 px-6 py-4 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-bold text-base shadow-lg shadow-teal-600/30"
            >
              {ctaLabel}
              <ArrowRight className="w-5 h-5" aria-hidden />
            </button>
          </div>
        </section>

        {/* Social proof */}
        <section className="px-4 pb-12 sm:px-6">
          <div className="max-w-lg mx-auto text-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/15 px-4 py-2 text-sm font-semibold mb-4">
              <Sparkles className="w-4 h-4 text-amber-300" aria-hidden />
              {liveDeals > 0 ? `${liveDeals}+ deals live across Vanuatu` : 'Growing across Vanuatu'}
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                {
                  Icon: Ticket,
                  label: 'One pass per tourist',
                  sub: 'Unlocks every deal on StikmNek',
                },
                { Icon: BadgeCheck, label: 'Verified passes', sub: 'No fake vouchers' },
                { Icon: BarChart3, label: 'Real data', sub: 'Every redemption' },
              ].map(({ Icon, label, sub }) => (
                <div key={label} className="rounded-xl bg-white/5 border border-white/10 p-3">
                  <Icon className="w-5 h-5 mx-auto text-emerald-300 mb-2" aria-hidden />
                  <p className="text-xs font-bold text-white">{label}</p>
                  <p className="text-[10px] text-teal-200/70 mt-0.5">{sub}</p>
                </div>
              ))}
            </div>
            <p className="mt-8 text-sm text-teal-200/70">
              Questions? Get in touch with whoever shared this link — they can walk you through setup.
            </p>
          </div>
        </section>
      </div>
    </>
  );
};

export default ForBusinessLanding;
