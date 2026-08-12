import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft } from 'lucide-react';
import { APP_ICON } from '@/lib/brand';
import { useAppContext } from '@/contexts/AppContext';
import AuthModal from '@/components/AuthModal';
import { toast } from 'sonner';

type PageLang = 'en' | 'fr' | 'bi';

/** English prefill — number stays 6787766107; display text is team brand, not a person. */
const WHATSAPP_URL =
  'https://wa.me/6787766107?text=' +
  encodeURIComponent(
    'Hi StikmNek team - I want to list my business on StikmNek for free. Business: \nLocation: \nDiscount for Pass holders: \n',
  );

const LANG_OPTIONS: { code: PageLang; label: string; flag: string }[] = [
  { code: 'en', label: 'EN', flag: '🇦🇺' },
  { code: 'fr', label: 'FR', flag: '🇫🇷' },
  { code: 'bi', label: 'BI', flag: '🇻🇺' },
];

const COPY: Record<
  PageLang,
  { title: string; bullets: string[]; needLabel: string; needBody: string; waCta: string }
> = {
  en: {
    title: 'For Ni-Vanuatu & local businesses',
    bullets: [
      'We list you free — tourists find you on the StikmNek trip planner',
      'You pick a discount for Pass holders (e.g. 15% off, 2-for-1 kava, free pickup)',
      'We take photos & add you — 5 minutes',
      'You get paid as normal. Tourist pays you direct, minus your discount',
    ],
    needLabel: 'What we need from you',
    needBody: 'Business name, location pin, 3 photos, discount, WhatsApp',
    waCta: 'Message us on WhatsApp',
  },
  fr: {
    title: 'Pour les entreprises locales',
    bullets: [
      'Nous vous listons gratuitement — les touristes vous trouvent sur le planificateur StikmNek',
      'Vous choisissez une réduction pour les détenteurs de Pass (ex. −15 %, 2 kava pour 1, transfert gratuit)',
      'Nous prenons les photos et vous ajoutons — 5 minutes',
      'Vous êtes payé normalement. Le touriste vous paie directement, moins votre réduction.',
    ],
    needLabel: 'Ce dont nous avons besoin',
    needBody: "Nom de l'entreprise, localisation, 3 photos, réduction, WhatsApp",
    waCta: 'Contactez notre équipe',
  },
  bi: {
    title: 'Blong ol lokol bisnes',
    bullets: [
      'Mifala i putum yu fri nomo — ol turis i faenem yu long StikmNek',
      'Yu jusum wan diskount blong ol man we i gat Pass (olsem 15% of, 2-fo-1 kava, fri pickup)',
      'Mifala i tekem foto mo putum yu — 5 minit',
      'Turis i pem yu direct nomo. Hemi soem Pass blong kasem discount we yu jusum.',
    ],
    needLabel: 'Mifala i nid long yu',
    needBody: 'Nem blong bisnis, ples long map, 3 foto, diskount, WhatsApp',
    waCta: 'Sendem mesej long mifala',
  },
};

const WhatsAppIcon: React.FC<{ className?: string }> = ({ className = 'w-6 h-6' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

/**
 * Public info page — list your business free. No login required.
 * Page language is local state only (does not change the app language).
 */
const ListBusiness: React.FC = () => {
  const navigate = useNavigate();
  const {
    user,
    userProfile,
    setShowAuth,
    setAuthMode,
    showAuth,
    signOut,
    authLoading,
  } = useAppContext();
  const [selectedLang, setSelectedLang] = useState<PageLang>('en');
  /** After Staff/Business login CTA — send owners to /hub once session is ready. */
  const [pendingHubAfterLogin, setPendingHubAfterLogin] = useState(false);
  const copy = COPY[selectedLang];

  useEffect(() => {
    if (!pendingHubAfterLogin || authLoading || !user) return;
    const role = userProfile?.role || user.type;
    if (role === 'business' || role === 'admin') {
      setPendingHubAfterLogin(false);
      navigate('/hub', { replace: true });
      return;
    }
    if (role === 'staff') {
      setPendingHubAfterLogin(false);
      navigate('/admin', { replace: true });
      return;
    }
    // Signed in but not a business account — stay and explain
    setPendingHubAfterLogin(false);
    toast.message(
      selectedLang === 'fr'
        ? 'Connectez-vous avec un compte entreprise / staff.'
        : selectedLang === 'bi'
          ? 'Yu mas saen in wetem bisnis o staff akaon.'
          : 'Sign in with a Staff or Business account to open the hub.',
    );
  }, [pendingHubAfterLogin, authLoading, user, userProfile, navigate, selectedLang]);

  // User closed the auth sheet without signing in
  useEffect(() => {
    if (pendingHubAfterLogin && !showAuth && !user && !authLoading) {
      setPendingHubAfterLogin(false);
    }
  }, [pendingHubAfterLogin, showAuth, user, authLoading]);

  const openStaffBusinessLogin = async () => {
    const role = userProfile?.role || user?.type;
    if (user && (role === 'business' || role === 'admin')) {
      navigate('/hub');
      return;
    }
    if (user && role === 'staff') {
      navigate('/admin');
      return;
    }
    // Tourist (or other) session blocks a fresh business login — clear it first
    if (user) {
      try {
        await signOut();
      } catch {
        /* still open auth */
      }
    }
    setPendingHubAfterLogin(true);
    setAuthMode('signin');
    setShowAuth(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-teal-50 via-white to-emerald-50/40 flex flex-col">
      <AuthModal />
      <Helmet>
        <title>List your business — Free forever | StikmNek</title>
        <meta
          name="description"
          content="List your Vanuatu business on StikmNek free forever. No fees. No commission. We add you."
        />
        <link rel="canonical" href="https://www.stikmnek.com/list-your-business" />
      </Helmet>

      <header className="sticky top-0 z-40 border-b border-teal-100/80 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-3">
          <Link
            to="/"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-teal-700 hover:bg-teal-50 transition-colors"
            aria-label="Back to home"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <Link to="/" className="flex items-center gap-2 min-w-0">
            <img src={APP_ICON} alt="" className="h-8 w-8 rounded-lg object-cover shadow-sm" />
            <span className="text-lg font-bold bg-gradient-to-r from-teal-700 to-emerald-600 bg-clip-text text-transparent truncate">
              StikmNek
            </span>
          </Link>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-lg px-4 pt-8 pb-36">
        <h1 className="text-3xl sm:text-4xl font-black text-gray-900 leading-tight tracking-tight">
          List your business — Free forever
        </h1>
        <p className="mt-3 text-base sm:text-lg text-gray-600 leading-relaxed">
          No fees. No commission. We add you.
        </p>

        <div
          className="mt-8 flex items-stretch gap-2"
          role="group"
          aria-label="Choose language"
        >
          {LANG_OPTIONS.map((opt) => {
            const active = selectedLang === opt.code;
            return (
              <button
                key={opt.code}
                type="button"
                onClick={() => setSelectedLang(opt.code)}
                aria-pressed={active}
                className={`flex min-h-[3.5rem] flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl text-sm font-bold transition-all active:scale-[0.98] ${
                  active
                    ? 'bg-teal-600 text-white shadow-lg shadow-teal-200 ring-2 ring-teal-500'
                    : 'bg-white text-gray-700 ring-1 ring-gray-200 hover:ring-teal-200 hover:bg-teal-50/50'
                }`}
              >
                <span className="text-2xl leading-none" aria-hidden>
                  {opt.flag}
                </span>
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>

        <article className="mt-8 rounded-3xl border border-teal-100 bg-white p-6 sm:p-7 shadow-sm">
          <h2 className="text-xl sm:text-2xl font-extrabold text-teal-900 leading-snug">
            {copy.title}
          </h2>
          <ul className="mt-5 space-y-3.5">
            {copy.bullets.map((line) => (
              <li key={line} className="flex gap-2.5 text-[15px] leading-relaxed text-gray-700">
                <span className="mt-0.5 shrink-0 font-bold text-teal-600" aria-hidden>
                  •
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6 rounded-2xl bg-teal-50/90 border border-teal-100 px-4 py-3.5">
            <p className="text-xs font-bold uppercase tracking-wide text-teal-800">
              {copy.needLabel}
            </p>
            <p className="mt-1.5 text-sm font-medium text-teal-950 leading-snug">{copy.needBody}</p>
          </div>
        </article>
      </main>

      <div
        className="fixed bottom-0 inset-x-0 z-50 border-t border-teal-100 bg-white/95 backdrop-blur-md"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="mx-auto max-w-lg px-4 py-3">
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full min-h-[3.5rem] items-center justify-center gap-2.5 rounded-2xl bg-[#0FB5B5] px-5 text-base font-bold text-white shadow-xl shadow-teal-300/40 hover:bg-[#0da3a3] active:scale-[0.99] transition-all"
          >
            <WhatsAppIcon className="h-6 w-6 shrink-0" />
            {copy.waCta}
          </a>
          <div className="mt-2.5 text-center space-y-1.5">
            <Link to="/business/new" className="block text-sm underline opacity-70 text-gray-700 hover:opacity-100">
              Tech-savvy? List it yourself →
            </Link>
            <button
              type="button"
              onClick={() => void openStaffBusinessLogin()}
              className="block w-full text-sm text-gray-600 hover:text-teal-700 hover:underline"
            >
              Already have an account? Staff / Business login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ListBusiness;
