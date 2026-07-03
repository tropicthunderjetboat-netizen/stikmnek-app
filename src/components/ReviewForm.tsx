import React, { useState, useRef, useEffect } from 'react';
import { Star, Send, AlertCircle, CheckCircle2, Sparkles, DollarSign, Info, X, Loader2, Shield } from 'lucide-react';
import { useAppContext } from '@/contexts/AppContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { t } from '@/data/translations';
import { getPayPalClientId, loadPayPalButtonsSdk, type PayPalButtonsInstance } from '@/lib/paypalSdk';

interface ReviewFormProps {
  businessId: string;
  offeringId?: string | null;
  businessName?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
  compact?: boolean;
}

/**
 * Refreshes session when near expiry; `functions.invoke` uses the SDK session token
 * (do not set Authorization manually — avoids Kong JWT mismatches).
 */
async function ensureFreshSession(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  const expiresAt = session.expires_at;
  const now = Math.floor(Date.now() / 1000);
  const secondsLeft = expiresAt ? expiresAt - now : 0;
  if (secondsLeft < 120) {
    const { data: { session: refreshed }, error } = await supabase.auth.refreshSession();
    if (error || !refreshed?.access_token) return null;
    return refreshed.access_token;
  }
  return session.access_token;
}


const ReviewForm: React.FC<ReviewFormProps> = ({
  businessId,
  offeringId = null,
  businessName,
  onSuccess,
  onCancel,
  compact = false,
}) => {
  const { user, setShowAuth, setAuthMode, language, submitReview, refreshUserProfile, validateSuperStarPaymentPrerequisites } = useAppContext();
  const [rating, setRating] = useState<number>(0);
  const [hoveredRating, setHoveredRating] = useState<number>(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ rating?: string; comment?: string }>({});
  const [submitted, setSubmitted] = useState(false);
  const [lastSubmittedSuperStar, setLastSubmittedSuperStar] = useState(false);

  // Super Star state
  const [wantsSuperStar, setWantsSuperStar] = useState(false);
  const [showSuperStarModal, setShowSuperStarModal] = useState(false);
  const [superStarProcessing, setSuperStarProcessing] = useState(false);
  const [superStarPurchased, setSuperStarPurchased] = useState(false);
  const [showSuperStarInfo, setShowSuperStarInfo] = useState(false);

  // Card state for Super Star
  const [ssPaymentError, setSsPaymentError] = useState<string | null>(null);
  const [ssPaymentStep, setSsPaymentStep] = useState<'form' | 'processing' | 'success'>('form');
  const [paypalButtonsReady, setPaypalButtonsReady] = useState(false);
  const [paypalSdkError, setPaypalSdkError] = useState<string | null>(null);

  const paypalContainerRef = useRef<HTMLDivElement>(null);
  const paypalClientId = getPayPalClientId();
  const paypalEnabled = paypalClientId.length > 0;

  const ratingLabels: Record<number, Record<string, string>> = {
    1: { en: 'Poor', fr: 'Mauvais', bi: 'Nogud' },
    2: { en: 'Fair', fr: 'Passable', bi: 'Oraet smol' },
    3: { en: 'Good', fr: 'Bien', bi: 'Gud' },
    4: { en: 'Very Good', fr: 'Très bien', bi: 'Gud tumas' },
    5: { en: 'Excellent', fr: 'Excellent', bi: 'Nambawan' },
    6: { en: 'Super Star!', fr: 'Super Étoile!', bi: 'Supa Sta!' },
  };

  const validate = (): boolean => {
    const newErrors: { rating?: string; comment?: string } = {};
    if (rating === 0) {
      newErrors.rating = language === 'en' ? 'Please select a star rating' : language === 'fr' ? 'Veuillez sélectionner une note' : 'Komen i mas gat 10 karakta o moa';
    }
    if (!comment.trim()) {
      newErrors.comment = language === 'en' ? 'Please write a comment about your experience' : language === 'fr' ? 'Veuillez écrire un commentaire sur votre expérience' : 'Tangkiu tumas!';
    } else if (comment.trim().length < 10) {
      newErrors.comment = language === 'en' ? 'Comment must be at least 10 characters' : language === 'fr' ? 'Le commentaire doit contenir au moins 10 caractères' : 'Supa Sta riviu blong yu i go finis!';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const superstarCredits = user?.superstarCredits ?? 0;
  const hasSuperStarCredit = superstarCredits > 0 || superStarPurchased;

  const handleSuperStarClick = async () => {
    if (!user) { setShowAuth(true); setAuthMode('signin'); return; }
    // If already selected, deselect
    if (wantsSuperStar || superStarPurchased || rating === 6) {
      setWantsSuperStar(false);
      setSuperStarPurchased(false);
      setRating(0);
      return;
    }
    // Has credits: allow 6-star without purchase (redemption still enforced at submitReview)
    if (superstarCredits > 0) {
      setWantsSuperStar(true);
      setRating(6);
      return;
    }
    // No credits: require redemption before any payment UI / card charge
    try {
      await validateSuperStarPaymentPrerequisites(businessId);
    } catch {
      return;
    }
    setShowSuperStarModal(true);
    setSsPaymentStep('form');
    setSsPaymentError(null);
    setPaypalSdkError(null);
  };

  useEffect(() => {
    if (!showSuperStarModal || ssPaymentStep !== 'form' || !paypalEnabled || !user?.id) {
      if (paypalContainerRef.current) paypalContainerRef.current.innerHTML = '';
      setPaypalButtonsReady(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        await loadPayPalButtonsSdk(paypalClientId);
        if (cancelled) return;

        const paypalNs = window as unknown as {
          paypal?: { Buttons: (cfg: Record<string, unknown>) => PayPalButtonsInstance };
        };
        const paypal = paypalNs.paypal;
        if (!paypal?.Buttons) {
          throw new Error('PayPal Buttons not available');
        }

        const token = await ensureFreshSession();
        if (!token) {
          throw new Error('Session expired. Please sign in again.');
        }

        const buttons = paypal.Buttons({
          style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'pay' },
          createOrder: async () => {
            const freshToken = await ensureFreshSession();
            if (!freshToken) throw new Error('Session expired. Please sign in again.');

            const { data, error } = await supabase.functions.invoke('create-checkout', {
              body: {
                productType: 'superstar',
                businessId,
                businessName: businessName || 'business',
              },
            });

            if (error) {
              const msg = (error as Error)?.message || 'Could not start PayPal checkout';
              throw new Error(msg);
            }
            if (!data?.success || !data?.orderId) {
              throw new Error(typeof data?.error === 'string' ? data.error : 'Could not create PayPal order');
            }
            return data.orderId as string;
          },
          onApprove: async (data: { orderID?: string }) => {
            const orderId = data.orderID;
            if (!orderId) throw new Error('Missing PayPal order ID');

            setSuperStarProcessing(true);
            setSsPaymentStep('processing');
            setSsPaymentError(null);

            try {
              const { data: capData, error: capErr } = await supabase.functions.invoke('paypal-capture', {
                body: { paypalOrderId: orderId },
              });

              if (capErr) throw capErr;
              if (!capData?.success) {
                throw new Error(typeof capData?.error === 'string' ? capData.error : 'Payment capture failed');
              }

              setSsPaymentStep('success');
              setSuperStarPurchased(true);
              setWantsSuperStar(true);
              setRating(6);
              toast.success('Super Star purchased!');
              void refreshUserProfile?.();

              setTimeout(() => {
                setShowSuperStarModal(false);
                setSsPaymentStep('form');
              }, 2000);
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Payment failed';
              setSsPaymentError(msg);
              toast.error(msg);
              setSsPaymentStep('form');
              throw err;
            } finally {
              setSuperStarProcessing(false);
            }
          },
          onError: (err: unknown) => {
            const msg = err instanceof Error ? err.message : 'PayPal error';
            setSsPaymentError(msg);
            toast.error(msg);
          },
          onCancel: () => {
            toast.info('Payment cancelled');
          },
        });

        const el = paypalContainerRef.current;
        if (!el || cancelled) return;
        el.innerHTML = '';
        await buttons.render(el);
        if (!cancelled) setPaypalButtonsReady(true);
      } catch (err: unknown) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'PayPal failed to load';
        setPaypalSdkError(msg);
        setPaypalButtonsReady(false);
      }
    })();

    return () => {
      cancelled = true;
      if (paypalContainerRef.current) paypalContainerRef.current.innerHTML = '';
      setPaypalButtonsReady(false);
    };
  }, [showSuperStarModal, ssPaymentStep, paypalEnabled, paypalClientId, user?.id, businessId, businessName, refreshUserProfile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) { setShowAuth(true); setAuthMode('signin'); return; }
    if (!validate()) return;
    setSubmitting(true);
    setErrors({});
    try {
      // Standard 1-5: rating is 1-5. Superstar: rating is 6 (after purchase). Pass as-is.
      const wasSuperStar = rating === 6;
      await submitReview(businessId, rating, comment.trim(), wasSuperStar, offeringId);
      setSubmitted(true);
      setLastSubmittedSuperStar(wasSuperStar);
      setRating(0);
      setComment('');
      setWantsSuperStar(false);
      setSuperStarPurchased(false);
      setTimeout(() => { setSubmitted(false); setLastSubmittedSuperStar(false); onSuccess?.(); }, 2000);
    } catch (err) {
      // Error toast handled in submitReview
    } finally {
      setSubmitting(false);
    }
  };

  // Success state
  if (submitted) {
    return (
      <div className={`${compact ? 'p-4' : 'p-6'} bg-emerald-50 rounded-xl border border-emerald-200 text-center`}>
        <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
        <h4 className="text-lg font-bold text-emerald-800 mb-1">
          {language === 'en' ? 'Thank You!' : language === 'fr' ? 'Merci !' : 'Riviu blong yu i go finis.'}
        </h4>
        <p className="text-sm text-emerald-600">
          {lastSubmittedSuperStar
            ? (language === 'en' ? 'Your Super Star review has been submitted!' : language === 'fr' ? 'Votre avis Super Étoile a été soumis !' : 'Saen in blong serem eksperiens blong yu')
            : (language === 'en' ? 'Your review has been submitted successfully.' : language === 'fr' ? 'Votre avis a été soumis avec succès.' : 'Reting blong yu')}
        </p>
      </div>
    );
  }

  // Not logged in
  if (!user) {
    return (
      <div className={`${compact ? 'p-4' : 'p-6'} bg-gray-50 rounded-xl border border-gray-200 text-center`}>
        <Star className="w-8 h-8 text-amber-400 mx-auto mb-3" />
        <p className="text-sm text-gray-600 mb-3">
          {language === 'en' ? 'Sign in to share your experience' : language === 'fr' ? 'Connectez-vous pour partager votre expérience' : 'Wanem i Super Star?'}
        </p>
        <button
          onClick={() => { setShowAuth(true); setAuthMode('signin'); }}
          className="px-5 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 transition-colors"
        >
          {t('nav.signin', language)}
        </button>
      </div>
    );
  }

  const activeRating = hoveredRating || rating;

  return (
    <>
      <form onSubmit={handleSubmit} className={`${compact ? 'p-4' : 'p-6'} bg-gradient-to-br from-gray-50 to-teal-50/30 rounded-xl border border-gray-200`}>
        {businessName && !compact && (
          <h4 className="text-base font-bold text-gray-900 mb-4">
            {language === 'en' ? `Review ${businessName}` : language === 'fr' ? `Évaluer ${businessName}` : `Riviu ${businessName}`}
          </h4>
        )}

        {/* Star Rating Selector */}
        <div className="mb-4">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            {language === 'en' ? 'Your Rating' : language === 'fr' ? 'Votre note' : 'Super Star hem i wan premium 6th sta we i kostem $5. Hem i wan spesel wei blong soem se bisnis i nambawan tumas.'}
            <span className="text-red-500 ml-0.5">*</span>
          </label>
          <div className="flex items-center gap-1 flex-wrap">
            {[1, 2, 3, 4, 5].map((starValue) => (
              <button
                key={starValue}
                type="button"
                onClick={() => { setRating(starValue); setWantsSuperStar(false); setErrors((prev) => ({ ...prev, rating: undefined })); }}
                onMouseEnter={() => setHoveredRating(starValue)}
                onMouseLeave={() => setHoveredRating(0)}
                className="group relative p-0.5 transition-transform hover:scale-125 focus:outline-none focus:scale-125"
                aria-label={`${starValue} star${starValue > 1 ? 's' : ''}`}
              >
                <Star className={`w-8 h-8 transition-colors duration-150 ${
                  starValue <= (wantsSuperStar ? 5 : activeRating)
                    ? 'text-amber-400 fill-amber-400 drop-shadow-sm'
                    : 'text-gray-300 hover:text-amber-200'
                }`} />
              </button>
            ))}

            <div className="w-px h-8 bg-gray-200 mx-1" />

            {/* 6th Super Star */}
            <button
              type="button"
              onClick={handleSuperStarClick}
              onMouseEnter={() => setHoveredRating(6)}
              onMouseLeave={() => setHoveredRating(0)}
              className="group relative p-0.5 transition-all hover:scale-130 focus:outline-none focus:scale-130"
              aria-label="Super Star - $5 bonus star"
            >
              <div className="relative">
                <Star className={`w-10 h-10 transition-all duration-300 ${
                  wantsSuperStar || superStarPurchased || rating === 6
                    ? 'text-amber-500 fill-amber-500 drop-shadow-lg'
                    : hoveredRating === 6
                    ? 'text-amber-400 fill-amber-200 drop-shadow-md'
                    : 'text-purple-200 hover:text-purple-300'
                }`} />
                <Sparkles className={`absolute -top-1 -right-1 w-4 h-4 transition-all duration-300 ${
                  wantsSuperStar || superStarPurchased || rating === 6
                    ? 'text-yellow-400 animate-pulse'
                    : hoveredRating === 6
                    ? 'text-yellow-300 opacity-80'
                    : 'text-gray-300 opacity-40'
                }`} />
                {!hasSuperStarCredit && (
                  <span className={`absolute -bottom-1 -right-1 px-1 py-0.5 rounded-full text-[8px] font-bold transition-all ${
                    hoveredRating === 6 ? 'bg-purple-600 text-white scale-110' : 'bg-purple-100 text-purple-600'
                  }`}>$5</span>
                )}
                {hasSuperStarCredit && (
                  <CheckCircle2 className="absolute -bottom-1 -right-1 w-4 h-4 text-green-500 bg-white rounded-full" />
                )}
              </div>
            </button>

            <button type="button" onClick={() => setShowSuperStarInfo(!showSuperStarInfo)} className="p-1 text-gray-400 hover:text-purple-500 transition-colors ml-1" aria-label="Learn about Super Star">
              <Info className="w-4 h-4" />
            </button>

            {activeRating > 0 && (
              <span className={`ml-2 text-sm font-medium animate-in fade-in ${
                activeRating === 6 || wantsSuperStar ? 'text-purple-600' : 'text-gray-600'
              }`}>
                {wantsSuperStar || superStarPurchased || rating === 6
                  ? (ratingLabels[6]?.[language] || ratingLabels[6]?.en)
                  : (ratingLabels[activeRating]?.[language] || ratingLabels[activeRating]?.en)}
              </span>
            )}
          </div>

          {showSuperStarInfo && (
            <div className="mt-3 p-3 rounded-xl bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-100 text-sm">
              <div className="flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-purple-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-purple-800 mb-1">
                    {language === 'en' ? 'What is a Super Star?' : language === 'fr' ? "Qu'est-ce qu'une Super Étoile ?" : 'Supa Sta i joen long riviu blong yu!'}
                  </p>
                  <p className="text-purple-700 text-xs leading-relaxed">
                    {language === 'en'
                      ? "The Super Star is a premium 6th star that costs $5. It's a special way to show exceptional appreciation for a business. Super Stars are displayed prominently on business profiles and help them stand out."
                      : language === 'fr'
                      ? "La Super Étoile est une 6ème étoile premium qui coûte 5$. C'est une façon spéciale de montrer une appréciation exceptionnelle."
                      : 'Riviu blong yu'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {hasSuperStarCredit && (
            <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-50 border border-purple-200">
              <Sparkles className="w-4 h-4 text-purple-500" />
              <span className="text-sm font-semibold text-purple-700">
                {language === 'en' ? 'Super Star added to your review!' : language === 'fr' ? 'Super Étoile ajoutée !' : 'Searem ditel abaotem eksperiens blong yu...'}
              </span>
            </div>
          )}

          {errors.rating && (
            <div className="flex items-center gap-1.5 mt-1.5 text-red-500">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span className="text-xs">{errors.rating}</span>
            </div>
          )}
        </div>

        {/* Comment Field */}
        <div className="mb-4">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            {language === 'en' ? 'Your Review' : language === 'fr' ? 'Votre avis' : 'Minimum 10 karakta'}
            <span className="text-red-500 ml-0.5">*</span>
          </label>
          <textarea
            value={comment}
            onChange={(e) => { setComment(e.target.value); setErrors((prev) => ({ ...prev, comment: undefined })); }}
            placeholder={language === 'en' ? 'Share details about your experience...' : language === 'fr' ? 'Partagez les détails de votre expérience...' : 'Sendem...'}
            className={`w-full p-3 rounded-xl border text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-none transition-colors ${
              errors.comment ? 'border-red-300 bg-red-50/50' : 'border-gray-200 bg-white'
            }`}
            rows={compact ? 3 : 4}
            maxLength={1000}
          />
          <div className="flex items-center justify-between mt-1.5">
            {errors.comment ? (
              <div className="flex items-center gap-1.5 text-red-500">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span className="text-xs">{errors.comment}</span>
              </div>
            ) : (
              <span className="text-xs text-gray-400">
                {language === 'en' ? 'Minimum 10 characters' : language === 'fr' ? 'Minimum 10 caractères' : 'Supa Sta'}
              </span>
            )}
            <span className={`text-xs ${comment.length > 900 ? 'text-amber-500' : 'text-gray-400'}`}>
              {comment.length}/1000
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white text-sm font-bold hover:from-teal-700 hover:to-emerald-700 transition-all shadow-md shadow-teal-200/50 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {language === 'en' ? 'Submitting...' : language === 'fr' ? 'Envoi...' : 'Premium 6th Sta Riviu'}
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                {t('review.submit', language)}
              </>
            )}
          </button>
          {onCancel && (
            <button type="button" onClick={onCancel} className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50 transition-colors">
              {t('general.cancel', language)}
            </button>
          )}
        </div>
      </form>

      {/* ═══ Super Star Purchase Modal — Inline Card Payment ═══ */}
      {showSuperStarModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !superStarProcessing && setShowSuperStarModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 px-6 py-5 text-white relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-12 translate-x-12" />
              <div className="relative flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                  <div className="relative">
                    <Star className="w-8 h-8 text-yellow-300 fill-yellow-300" />
                    <Sparkles className="absolute -top-1 -right-1 w-4 h-4 text-yellow-200 animate-pulse" />
                  </div>
                </div>
                <div>
                  <h3 className="text-xl font-bold">{language === 'en' ? 'Super Star' : language === 'fr' ? 'Super Étoile' : 'Pem $5.00 sef'}</h3>
                  <p className="text-sm text-white/80">{language === 'en' ? 'Premium 6th Star Review' : language === 'fr' ? 'Avis Premium 6ème Étoile' : 'Maet leit'}</p>
                </div>
              </div>
              <button onClick={() => setShowSuperStarModal(false)} disabled={superStarProcessing} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors">
                <X className="w-4 h-4 text-white" />
              </button>
            </div>

            <div className="p-6">
              {/* ═══ CARD FORM STEP ═══ */}
              {ssPaymentStep === 'form' && (
                <>
                  {businessName && (
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-purple-50 border border-purple-100 mb-4">
                      <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                        <Star className="w-5 h-5 text-purple-500 fill-purple-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">{businessName}</p>
                        <p className="text-xs text-purple-600">{language === 'en' ? 'Will receive your Super Star' : 'Recevra votre Super Étoile'}</p>
                      </div>
                    </div>
                  )}

                  {/* Price */}
                  <div className="text-center mb-4">
                    <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200">
                      <DollarSign className="w-5 h-5 text-purple-600" />
                      <span className="text-2xl font-extrabold text-purple-700">5.00</span>
                      <span className="text-sm text-purple-500 font-medium">AUD</span>
                    </div>
                  </div>

                  {/* Payment Error */}
                  {(ssPaymentError || paypalSdkError) && (
                    <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 mb-4">
                      <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-red-600">{ssPaymentError || paypalSdkError}</p>
                    </div>
                  )}

                  {!paypalEnabled ? (
                    <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-900 mb-4">
                      PayPal is not configured for this app. Super Star purchases require PayPal — contact support.
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-50 mb-4">
                        <Shield className="w-3.5 h-3.5 text-green-500" />
                        <span className="text-[11px] text-gray-500">Secure payment via PayPal · A$5.00 AUD</span>
                      </div>
                      <div ref={paypalContainerRef} className="min-h-[120px]" />
                      {!paypalButtonsReady && !paypalSdkError && (
                        <div className="flex items-center justify-center gap-2 py-4 text-sm text-gray-500">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Loading PayPal…
                        </div>
                      )}
                    </>
                  )}

                  <p className="text-[11px] text-center text-gray-400 mt-3">
                    {language === 'en' ? 'Secure payment via PayPal. Non-refundable.' : 'Paiement sécurisé via PayPal. Non remboursable.'}
                  </p>

                  <button
                    onClick={() => setShowSuperStarModal(false)}
                    disabled={superStarProcessing}
                    className="w-full mt-3 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    {language === 'en' ? 'Maybe later' : language === 'fr' ? 'Peut-être plus tard' : 'Serem eksperiens blong yu wetem narafala turis'}
                  </button>
                </>
              )}

              {/* ═══ PROCESSING STEP ═══ */}
              {ssPaymentStep === 'processing' && (
                <div className="text-center py-8">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-purple-50 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
                  </div>
                  <h4 className="text-lg font-bold text-gray-900 mb-1">Processing Payment</h4>
                  <p className="text-sm text-gray-500">Securely processing your PayPal payment…</p>
                  <div className="mt-4 flex items-center justify-center gap-2 text-xs text-gray-400">
                    <Shield className="w-3 h-3" />
                    <span>Encrypted by PayPal</span>
                  </div>
                </div>
              )}

              {/* ═══ SUCCESS STEP ═══ */}
              {ssPaymentStep === 'success' && (
                <div className="text-center py-8">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center animate-in zoom-in duration-300">
                    <CheckCircle2 className="w-10 h-10 text-green-600" />
                  </div>
                  <h4 className="text-lg font-bold text-gray-900 mb-1">Super Star Purchased!</h4>
                  <p className="text-sm text-gray-500">Your premium review badge has been added.</p>
                  <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-50 border border-purple-200">
                    <Star className="w-4 h-4 text-purple-500 fill-purple-500" />
                    <Sparkles className="w-3 h-3 text-yellow-500" />
                    <span className="text-sm font-semibold text-purple-700">Super Star Active</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ReviewForm;
