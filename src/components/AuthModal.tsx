import React, { useState } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { t } from '@/data/translations';
import { SITE_URL, supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { X, Mail, Lock, User, Briefcase, Plane, Loader2, Shield, ArrowLeft, Store, MapPin, Globe } from 'lucide-react';

const AuthModal: React.FC = () => {
  const {
    language, showAuth, setShowAuth, authMode, setAuthMode,
    signIn, signUpTourist, signUpBusiness, authLoading,
  } = useAppContext();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [forgotPasswordMode, setForgotPasswordMode] = useState(false);
  const [forgotPasswordSent, setForgotPasswordSent] = useState(false);

  if (!showAuth) return null;

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!email || !email.includes('@')) errs.email = 'Valid email required';
    if (!forgotPasswordMode) {
      if (!password || password.length < 6) errs.password = 'Min 6 characters';
      if ((authMode === 'signup' || authMode === 'signup-tourist' || authMode === 'signup-business') && !name) errs.name = 'Name required';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      setErrors({ email: 'Valid email required' });
      return;
    }
    setSubmitting(true);
    setErrors({});
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${SITE_URL}/reset-password`,
      });
      if (error) throw error;
      setForgotPasswordSent(true);
      toast.success(
        language === 'en'
          ? 'Check your email for a password reset link.'
          : language === 'fr'
          ? 'Consultez votre email pour le lien de réinitialisation.'
          : 'Lukim email blong yu blong reset link.'
      );
    } catch (err: any) {
      console.error('[AuthModal] Forgot password error:', err);
      toast.error(err?.message || 'Failed to send reset link');
      setErrors({ email: err?.message || 'Failed to send' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (forgotPasswordMode) {
      await handleForgotPassword(e);
      return;
    }
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      if (authMode === 'signin') {
        await signIn(email, password);
      } else if (authMode === 'signup-business') {
        await signUpBusiness(name, email, password);
      } else {
        // signup or signup-tourist
        await signUpTourist(name, email, password);
      }
      // Only clear form on success
      setEmail('');
      setPassword('');
      setName('');
    } catch (err: any) {
      // Error already shown as toast by signIn/signUp
      // Keep form data so user can retry
      console.log('[AuthModal] Auth error caught:', err?.message);
    } finally {
      setSubmitting(false);
    }
  };


  const resetForm = () => {
    setEmail('');
    setPassword('');
    setName('');
    setErrors({});
    setForgotPasswordMode(false);
    setForgotPasswordSent(false);
  };

  const isSignup = authMode === 'signup' || authMode === 'signup-tourist' || authMode === 'signup-business';
  const isChooseType = authMode === 'signup';

  // ─── ROLE SELECTION SCREEN ───
  if (isChooseType) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowAuth(false)} />
        <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-h-[95vh] overflow-y-auto">
          {/* Header */}
          <div className="relative bg-gradient-to-r from-teal-600 to-emerald-600 px-6 py-7 text-white">
            <button
              onClick={() => setShowAuth(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center mb-3">
              <User className="w-6 h-6" />
            </div>
            <h2 className="text-2xl font-bold">
              {language === 'en' ? 'Join StikmNek' : language === 'fr' ? 'Rejoindre StikmNek' : 'Joinim StikmNek'}
            </h2>
            <p className="text-white/70 text-sm mt-1">
              {language === 'en' ? 'Choose how you want to use StikmNek' : language === 'fr' ? 'Choisissez comment utiliser StikmNek' : 'Jusim olsem wanem yu wantem yusim StikmNek'}
            </p>
          </div>

          <div className="px-6 py-6 space-y-4">
            {/* Tourist Option */}
            <button
              onClick={() => { setAuthMode('signup-tourist'); resetForm(); }}
              className="w-full p-5 rounded-2xl border-2 border-gray-200 hover:border-teal-400 hover:bg-teal-50/50 transition-all text-left group"
            >
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-sky-200/50 flex-shrink-0 group-hover:scale-105 transition-transform">
                  <Globe className="w-7 h-7" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900 mb-1">
                    {language === 'en' ? "I'm a Tourist" : language === 'fr' ? "Je suis Touriste" : "Mi wan Turis"}
                  </h3>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    {language === 'en'
                      ? 'Discover deals, buy discount passes, and save money while exploring Vanuatu.'
                      : language === 'fr'
                      ? 'Découvrez des offres, achetez des pass et économisez en explorant le Vanuatu.'
                      : 'Faenem dils, baem diskount pas, mo sevem mani taem yu eksploarem Vanuatu.'}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <span className="px-2.5 py-1 rounded-lg bg-sky-50 text-sky-700 text-[11px] font-semibold">Discount Passes</span>
                    <span className="px-2.5 py-1 rounded-lg bg-sky-50 text-sky-700 text-[11px] font-semibold">QR Redemptions</span>
                    <span className="px-2.5 py-1 rounded-lg bg-sky-50 text-sky-700 text-[11px] font-semibold">Savings Tracker</span>
                  </div>
                </div>
              </div>
            </button>

            {/* Business Option */}
            <button
              onClick={() => { setAuthMode('signup-business'); resetForm(); }}
              className="w-full p-5 rounded-2xl border-2 border-gray-200 hover:border-emerald-400 hover:bg-emerald-50/50 transition-all text-left group"
            >
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-white shadow-lg shadow-emerald-200/50 flex-shrink-0 group-hover:scale-105 transition-transform">
                  <Store className="w-7 h-7" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900 mb-1">
                    {language === 'en' ? "I'm a Business" : language === 'fr' ? "Je suis une Entreprise" : "Mi wan Bisnis"}
                  </h3>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    {language === 'en'
                      ? 'List your business, create offers for tourists, and grow your customer base.'
                      : language === 'fr'
                      ? 'Inscrivez votre entreprise, créez des offres et développez votre clientèle.'
                      : 'Listem bisnis blong yu, mekem ofa blong turis, mo groem kastoma beis.'}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-semibold">Business Dashboard</span>
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-semibold">QR Scanner</span>
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-semibold">Analytics</span>
                  </div>
                </div>
              </div>
            </button>

            <div className="pt-2">
              <p className="text-center text-sm text-gray-500">
                {language === 'en' ? 'Already have an account? ' : language === 'fr' ? 'Déjà un compte? ' : 'Gat akaont finis? '}
                <button type="button" onClick={() => { setAuthMode('signin'); resetForm(); }} className="text-teal-600 font-semibold hover:underline">
                  {t('auth.signin', language)}
                </button>
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── SIGN IN / SIGN UP FORM ───
  const isBizSignup = authMode === 'signup-business';
  const headerGradient = isBizSignup
    ? 'from-emerald-600 to-teal-700'
    : authMode === 'signup-tourist'
    ? 'from-sky-500 to-blue-600'
    : 'from-teal-600 to-emerald-600';
  const headerIcon = isBizSignup
    ? <Store className="w-6 h-6" />
    : authMode === 'signup-tourist'
    ? <Globe className="w-6 h-6" />
    : <User className="w-6 h-6" />;
  const headerTitle = authMode === 'signin'
    ? t('auth.signin', language)
    : isBizSignup
    ? (language === 'en' ? 'Business Sign Up' : language === 'fr' ? 'Inscription Entreprise' : 'Bisnis Saen Ap')
    : (language === 'en' ? 'Tourist Sign Up' : language === 'fr' ? 'Inscription Touriste' : 'Turis Saen Ap');
  const headerSubtitle = forgotPasswordMode
    ? (language === 'en' ? 'We\'ll send you a reset link' : language === 'fr' ? 'Nous vous enverrons un lien' : 'Bae mifala sendem link long yu')
    : authMode === 'signin'
    ? (language === 'en' ? 'Welcome back to StikmNek' : language === 'fr' ? 'Bienvenue sur StikmNek' : 'Welkam bak long StikmNek')
    : isBizSignup
    ? (language === 'en' ? 'Create your business account to start listing' : language === 'fr' ? 'Créez votre compte entreprise' : 'Mekem bisnis akaont blong yu')
    : (language === 'en' ? 'Create your account to start saving' : language === 'fr' ? 'Créez votre compte pour économiser' : 'Mekem akaont blong yu blong sevem');

  // ─── FORGOT PASSWORD SCREEN ───
  if (authMode === 'signin' && (forgotPasswordMode || forgotPasswordSent)) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowAuth(false)} />
        <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-h-[95vh] overflow-y-auto">
          <div className="relative bg-gradient-to-r from-teal-600 to-emerald-600 px-6 py-7 text-white">
            <button
              onClick={() => { setForgotPasswordMode(false); setForgotPasswordSent(false); setErrors({}); }}
              className="absolute top-4 left-4 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <button onClick={() => setShowAuth(false)} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors">
              <X className="w-4 h-4" />
            </button>
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center mb-3">
              <Lock className="w-6 h-6" />
            </div>
            <h2 className="text-2xl font-bold">
              {forgotPasswordSent
                ? (language === 'en' ? 'Check Your Email' : language === 'fr' ? 'Vérifiez votre email' : 'Lukim Email Blong Yu')
                : (language === 'en' ? 'Forgot Password?' : language === 'fr' ? 'Mot de passe oublié ?' : 'Fogetem Paswod?')}
            </h2>
            <p className="text-white/70 text-sm mt-1">
              {forgotPasswordSent
                ? (language === 'en' ? 'We sent a reset link to your email' : language === 'fr' ? 'Un lien a été envoyé à votre email' : 'Mifala i sendem link long email blong yu')
                : (language === 'en' ? 'Enter your email to receive a reset link' : language === 'fr' ? 'Entrez votre email pour recevoir un lien' : 'Putum email blong yu blong karem reset link')}
            </p>
          </div>
          <div className="px-6 py-6">
            {forgotPasswordSent ? (
              <div className="space-y-4">
                <p className="text-sm text-gray-600">
                  {language === 'en'
                    ? 'If an account exists for that email, you will receive a password reset link. Check your spam folder if you don\'t see it.'
                    : language === 'fr'
                    ? 'Si un compte existe pour cet email, vous recevrez un lien. Vérifiez vos spams si vous ne le voyez pas.'
                    : 'Sapos gat akaont long email ia, bae yu karem link. Lukim spam folder.'}
                </p>
                <button
                  onClick={() => { setForgotPasswordMode(false); setForgotPasswordSent(false); }}
                  className="w-full py-3 rounded-xl bg-teal-600 text-white font-bold text-sm hover:bg-teal-700 transition-colors"
                >
                  {language === 'en' ? 'Back to Sign In' : language === 'fr' ? 'Retour à la connexion' : 'Go Bak long Saen In'}
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('auth.email', language)}</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setErrors((p) => ({ ...p, email: '' })); }}
                      className={`w-full pl-10 pr-4 py-2.5 rounded-xl border ${errors.email ? 'border-red-300 bg-red-50' : 'border-gray-200'} text-sm focus:outline-none focus:ring-2 focus:ring-teal-500`}
                      placeholder="you@example.com"
                    />
                  </div>
                  {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-bold text-sm hover:opacity-90 transition-all shadow-lg disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {language === 'en' ? 'Send Reset Link' : language === 'fr' ? 'Envoyer le lien' : 'Sendem Reset Link'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowAuth(false)} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-h-[95vh] overflow-y-auto">
        {/* Header */}
        <div className={`relative bg-gradient-to-r ${headerGradient} px-6 py-7 text-white`}>
          <button
            onClick={() => setShowAuth(false)}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
          {/* Back button for signup flows */}
          {isSignup && (
            <button
              onClick={() => { setAuthMode('signup'); resetForm(); }}
              className="absolute top-4 left-4 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center mb-3">
            {headerIcon}
          </div>
          <h2 className="text-2xl font-bold">{headerTitle}</h2>
          <p className="text-white/70 text-sm mt-1">{headerSubtitle}</p>
          {isBizSignup && (
            <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 border border-white/20">
              <Briefcase className="w-4 h-4 text-white/80" />
              <span className="text-xs text-white/80">
                {language === 'en'
                  ? 'After signup, you\'ll be directed to set up your business profile'
                  : language === 'fr'
                  ? 'Après inscription, vous configurerez votre profil entreprise'
                  : 'Afta saen ap, bae yu go setupem bisnis profael blong yu'}
              </span>
            </div>
          )}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-6 space-y-3.5">
          {isSignup && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {isBizSignup
                  ? (language === 'en' ? 'Your Name (Contact Person)' : language === 'fr' ? 'Votre Nom (Personne de contact)' : 'Nem blong yu (Kontak)')
                  : t('auth.name', language)}
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={`w-full pl-10 pr-4 py-2.5 rounded-xl border ${errors.name ? 'border-red-300 bg-red-50' : 'border-gray-200'} text-sm focus:outline-none focus:ring-2 focus:ring-teal-500`}
                  placeholder={isBizSignup ? 'John Smith (Business Owner)' : 'John Smith'}
                />
              </div>
              {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('auth.email', language)}</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`w-full pl-10 pr-4 py-2.5 rounded-xl border ${errors.email ? 'border-red-300 bg-red-50' : 'border-gray-200'} text-sm focus:outline-none focus:ring-2 focus:ring-teal-500`}
                placeholder={isBizSignup ? 'business@example.com' : 'you@example.com'}
              />
            </div>
            {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
          </div>

          {!forgotPasswordMode && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('auth.password', language)}</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`w-full pl-10 pr-4 py-2.5 rounded-xl border ${errors.password ? 'border-red-300 bg-red-50' : 'border-gray-200'} text-sm focus:outline-none focus:ring-2 focus:ring-teal-500`}
                  placeholder="Min 6 characters"
                />
              </div>
              {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password}</p>}
              {authMode === 'signin' && (
                <button
                  type="button"
                  onClick={() => setForgotPasswordMode(true)}
                  className="mt-1.5 text-xs text-teal-600 hover:text-teal-700 font-medium"
                >
                  {language === 'en' ? 'Forgot Password?' : language === 'fr' ? 'Mot de passe oublié ?' : 'Fogetem Paswod?'}
                </button>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className={`w-full py-3 rounded-xl bg-gradient-to-r ${
              isBizSignup ? 'from-emerald-600 to-teal-700' : authMode === 'signup-tourist' ? 'from-sky-500 to-blue-600' : 'from-teal-600 to-emerald-600'
            } text-white font-bold text-sm hover:opacity-90 transition-all shadow-lg ${
              isBizSignup ? 'shadow-emerald-200' : authMode === 'signup-tourist' ? 'shadow-sky-200' : 'shadow-teal-200'
            } disabled:opacity-60 flex items-center justify-center gap-2`}
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {isBizSignup ? <Store className="w-4 h-4" /> : authMode === 'signup-tourist' ? <Globe className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
            {authMode === 'signin'
              ? (language === 'en' ? 'Sign In' : language === 'fr' ? 'Se connecter' : 'Saen In')
              : isBizSignup
              ? (language === 'en' ? 'Create Business Account' : language === 'fr' ? 'Créer un compte entreprise' : 'Mekem Bisnis Akaont')
              : (language === 'en' ? 'Create Tourist Account' : language === 'fr' ? 'Créer un compte touriste' : 'Mekem Turis Akaont')}
          </button>

          <p className="text-center text-sm text-gray-500">
            {authMode === 'signin' ? (
              <>
                {language === 'en' ? "Don't have an account? " : language === 'fr' ? "Pas de compte? " : "No gat akaont? "}
                <button type="button" onClick={() => { setAuthMode('signup'); resetForm(); }} className="text-teal-600 font-semibold hover:underline">
                  {t('auth.signup', language)}
                </button>
              </>
            ) : (
              <>
                {language === 'en' ? 'Already have an account? ' : language === 'fr' ? 'Déjà un compte? ' : 'Gat akaont finis? '}
                <button type="button" onClick={() => { setAuthMode('signin'); resetForm(); }} className="text-teal-600 font-semibold hover:underline">
                  {t('auth.signin', language)}
                </button>
              </>
            )}
          </p>
        </form>

        {/* Security Footer */}
        <div className="px-6 pb-5">
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-gray-50 border border-gray-100">
            <Shield className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
            <p className="text-[10px] text-gray-400 leading-relaxed">
              {language === 'en'
                ? 'By continuing, you agree to our Terms of Service and Privacy Policy. Your data is protected under GDPR compliance.'
                : language === 'fr'
                ? 'En continuant, vous acceptez nos Conditions d\'utilisation et notre Politique de confidentialité.'
                : 'Taem yu kontiniu, yu agri long Tems blong Sevis mo Praevesi Polisi blong mifala.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthModal;
