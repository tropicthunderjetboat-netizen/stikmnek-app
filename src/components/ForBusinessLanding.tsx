import React, { useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Gift,
  Sparkles,
  Store,
  Ticket,
  X,
  Check,
} from 'lucide-react';
import { useAppContext } from '@/contexts/AppContext';
import { APP_ICON } from '@/lib/brand';
import { touristFacingOfferings } from '@/data/businesses';

/**
 * Outreach landing page — linked from WhatsApp messages to business owners.
 * Bold, mobile-first explainer: free listing, redemption-only discounts, tracked results.
 */
const ForBusinessLanding: React.FC = () => {
  const navigate = useNavigate();
  const { user, setShowAuth, setAuthMode, dbBusinesses } = useAppContext();

  const liveDeals = useMemo(() => touristFacingOfferings(dbBusinesses).length, [dbBusinesses]);

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
    user?.type === 'business' || user?.type === 'admin' ? 'Add my deal now' : 'List my business';

  return (
    <>
      <Helmet prioritizeSeoTags>
        <title>Join StikmNek | Vanuatu Business Deals</title>
        <meta
          name="description"
          content="Join StikmNek at zero cost. You control your deal and discount. Tourists buy one pass for access to deals across Vanuatu — you only honour a discount when they redeem at your door."
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
              <span className="block text-emerald-300 mt-1">You're in complete control.</span>
            </h1>
            <p className="text-teal-100/85 text-base sm:text-lg leading-relaxed mb-8">
              StikmNek is Vanuatu&apos;s tourist deals app — and it costs you nothing to join. You choose your
              offer, set your discount, and decide when it&apos;s live. Tourists buy one pass to unlock deals
              across the island, including yours. You only honour a discount when they arrive and redeem — and
              you can track every one in your dashboard.
            </p>

            <div className="flex flex-wrap justify-center gap-2 mb-8">
              {[
                { Icon: Gift, t: 'No listing fee' },
                { Icon: Store, t: 'You set the deal' },
                { Icon: BarChart3, t: 'Track redemptions' },
              ].map(({ Icon, t }) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/95"
                >
                  <Icon className="w-3.5 h-3.5 text-emerald-300" aria-hidden />
                  {t}
                </span>
              ))}
            </div>

            <button
              type="button"
              onClick={onJoin}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-black text-lg shadow-xl shadow-orange-900/40 hover:brightness-105 active:scale-[0.98] transition-all"
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

        {/* Old way vs StikmNek */}
        <section className="px-4 pb-10 sm:px-6">
          <div className="max-w-lg mx-auto">
            <h2 className="text-center text-lg font-black mb-4 text-white/95">Why businesses are switching</h2>
            <div className="grid gap-3">
              <div className="rounded-2xl border border-red-400/25 bg-red-950/40 p-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-red-300/90 mb-2">The old way</p>
                <ul className="space-y-2 text-sm text-red-50/80">
                  <li className="flex gap-2">
                    <X className="w-4 h-4 shrink-0 text-red-400 mt-0.5" aria-hidden />
                    Pay hundreds of thousands of vatu upfront for map ads
                  </li>
                  <li className="flex gap-2">
                    <X className="w-4 h-4 shrink-0 text-red-400 mt-0.5" aria-hidden />
                    No idea if anyone actually redeemed your voucher
                  </li>
                  <li className="flex gap-2">
                    <X className="w-4 h-4 shrink-0 text-red-400 mt-0.5" aria-hidden />
                    Maps end up in the rubbish — tourists never see you
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
                  title: 'Add photos, your deal & discount',
                  body: 'You choose the offer — change it anytime from your dashboard.',
                },
                {
                  n: '3',
                  title: 'Go live — scan passes when they visit',
                  body: 'Use your phone to verify & redeem. Track results instantly.',
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

        {/* Proof / excitement */}
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
