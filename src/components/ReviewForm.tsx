import React, { useState, useRef } from 'react';
import { Star, Send, AlertCircle, CheckCircle2, Sparkles, DollarSign, Info, X, Loader2, CreditCard, Lock, Shield } from 'lucide-react';
import { useAppContext } from '@/contexts/AppContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { t } from '@/data/translations';

interface ReviewFormProps {
  businessId: string;
  businessName?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
  compact?: boolean;
}

async function getValidAccessToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    const expiresAt = session.expires_at;
    const now = Math.floor(Date.now() / 1000);
    if (expiresAt && (expiresAt - now) > 60) return session.access_token;
  }
  const { data: { session: refreshedSession }, error } = await supabase.auth.refreshSession();
  if (error) return null;
  return refreshedSession?.access_token || null;
}

// Card formatting helpers
function formatCardNumber(value: string): string {
  const digits = value.replace(/\D/g, '').substring(0, 16);
  const groups = digits.match(/.{1,4}/g);
  return groups ? groups.join(' ') : digits;
}

function formatExpiry(value: string): string {
  const digits = value.replace(/\D/g, '').substring(0, 4);
  if (digits.length >= 3) return digits.substring(0, 2) + '/' + digits.substring(2);
  return digits;
}

const ReviewForm: React.FC<ReviewFormProps> = ({
  businessId,
  businessName,
  onSuccess,
  onCancel,
  compact = false,
}) => {
  const { user, setShowAuth, setAuthMode, language, submitReview } = useAppContext();
  const [rating, setRating] = useState<number>(0);
  const [hoveredRating, setHoveredRating] = useState<number>(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ rating?: string; comment?: string }>({});
  const [submitted, setSubmitted] = useState(false);

  // Super Star state
  const [wantsSuperStar, setWantsSuperStar] = useState(false);
  const [showSuperStarModal, setShowSuperStarModal] = useState(false);
  const [superStarProcessing, setSuperStarProcessing] = useState(false);
  const [superStarPurchased, setSuperStarPurchased] = useState(false);
  const [showSuperStarInfo, setShowSuperStarInfo] = useState(false);

  // Card state for Super Star
  const [ssCardNumber, setSsCardNumber] = useState('');
  const [ssCardExpiry, setSsCardExpiry] = useState('');
  const [ssCardCvv, setSsCardCvv] = useState('');
  const [ssCardName, setSsCardName] = useState('');
  const [ssCardErrors, setSsCardErrors] = useState<Record<string, string>>({});
  const [ssPaymentError, setSsPaymentError] = useState<string | null>(null);
  const [ssPaymentStep, setSsPaymentStep] = useState<'form' | 'processing' | 'success'>('form');

  const ssExpiryRef = useRef<HTMLInputElement>(null);
  const ssCvvRef = useRef<HTMLInputElement>(null);

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
      newErrors.rating = language === 'en' ? 'Please select a star rating' : language === 'fr' ? 'Veuillez sélectionner une note' : 'Plis jusum wan sta reting';
    }
    if (!comment.trim()) {
      newErrors.comment = language === 'en' ? 'Please write a comment about your experience' : language === 'fr' ? 'Veuillez écrire un commentaire sur votre expérience' : 'Plis raetem wan komen abaotem eksperiens blong yu';
    } else if (comment.trim().length < 10) {
      newErrors.comment = language === 'en' ? 'Comment must be at least 10 characters' : language === 'fr' ? 'Le commentaire doit contenir au moins 10 caractères' : 'Komen i mas gat 10 karakter o moa';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSuperStarClick = () => {
    if (!user) { setShowAuth(true); setAuthMode('signin'); return; }
    if (superStarPurchased) { setWantsSuperStar(false); setSuperStarPurchased(false); return; }
    setShowSuperStarModal(true);
    setSsPaymentStep('form');
    setSsPaymentError(null);
    setSsCardErrors({});
  };

  const validateSuperStarCard = (): boolean => {
    const errs: Record<string, string> = {};
    const cleanNum = ssCardNumber.replace(/\D/g, '');
    if (!cleanNum || cleanNum.length < 13) errs.cardNumber = 'Enter a valid card number';
    if (!ssCardExpiry || ssCardExpiry.length < 5) errs.cardExpiry = 'Enter expiry';
    else {
      const [mm, yy] = ssCardExpiry.split('/');
      const month = parseInt(mm, 10);
      const year = parseInt('20' + yy, 10);
      const now = new Date();
      if (month < 1 || month > 12) errs.cardExpiry = 'Invalid month';
      else if (year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1)) errs.cardExpiry = 'Card expired';
    }
    if (!ssCardCvv || ssCardCvv.length < 3) errs.cardCvv = 'Enter CVV';
    if (!ssCardName.trim() || ssCardName.trim().length < 2) errs.cardName = 'Enter name';
    setSsCardErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handlePurchaseSuperStar = async () => {
    if (!user) return;
    if (!validateSuperStarCard()) return;

    setSuperStarProcessing(true);
    setSsPaymentStep('processing');
    setSsPaymentError(null);

    try {
      const accessToken = await getValidAccessToken();
      if (!accessToken) {
        toast.error('Session expired. Please sign in again.');
        setSuperStarProcessing(false);
        setSsPaymentStep('form');
        return;
      }

      const { data, error } = await supabase.functions.invoke('process-card-payment', {
        body: {
          action: 'purchase_superstar',
          businessId,
          businessName: businessName || 'business',
          userName: user.name,
          cardNumber: ssCardNumber.replace(/\s/g, ''),
          cardExpiry: ssCardExpiry,
          cardCvv: ssCardCvv,
          cardName: ssCardName.trim(),
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (error) throw error;

      if (data?.success) {
        setSsPaymentStep('success');
        setSuperStarPurchased(true);
        setWantsSuperStar(true);
        setRating(6);
        toast.success('Super Star purchased!');

        setTimeout(() => {
          setShowSuperStarModal(false);
          setSsPaymentStep('form');
          // Reset card fields
          setSsCardNumber('');
          setSsCardExpiry('');
          setSsCardCvv('');
          setSsCardName('');
        }, 2000);
      } else {
        throw new Error(data?.error || 'Payment failed');
      }
    } catch (err: any) {
      console.error('Super Star payment error:', err);
      const msg = err.message || 'Failed to process payment';
      setSsPaymentError(msg);
      toast.error(msg);
      setSsPaymentStep('form');
    } finally {
      setSuperStarProcessing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) { setShowAuth(true); setAuthMode('signin'); return; }
    if (!validate()) return;
    setSubmitting(true);
    setErrors({});
    try {
      const effectiveRating = Math.min(rating, 5);
      await submitReview(businessId, effectiveRating, comment.trim());
      setSubmitted(true);
      setRating(0);
      setComment('');
      setTimeout(() => { setSubmitted(false); onSuccess?.(); }, 2000);
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
          {language === 'en' ? 'Thank You!' : language === 'fr' ? 'Merci !' : 'Tangkiu tumas!'}
        </h4>
        <p className="text-sm text-emerald-600">
          {superStarPurchased
            ? (language === 'en' ? 'Your Super Star review has been submitted!' : language === 'fr' ? 'Votre avis Super Étoile a été soumis !' : 'Supa Sta riviu blong yu i go finis!')
            : (language === 'en' ? 'Your review has been submitted successfully.' : language === 'fr' ? 'Votre avis a été soumis avec succès.' : 'Riviu blong yu i go finis.')}
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
          {language === 'en' ? 'Sign in to share your experience' : language === 'fr' ? 'Connectez-vous pour partager votre expérience' : 'Saen in blong searem eksperiens blong yu'}
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
            {language === 'en' ? 'Your Rating' : language === 'fr' ? 'Votre note' : 'Reting blong yu'}
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
                  wantsSuperStar || superStarPurchased
                    ? 'text-purple-500 fill-purple-500 drop-shadow-lg'
                    : hoveredRating === 6
                    ? 'text-purple-400 fill-purple-200 drop-shadow-md'
                    : 'text-purple-200 hover:text-purple-300'
                }`} />
                <Sparkles className={`absolute -top-1 -right-1 w-4 h-4 transition-all duration-300 ${
                  wantsSuperStar || superStarPurchased
                    ? 'text-yellow-400 animate-pulse'
                    : hoveredRating === 6
                    ? 'text-yellow-300 opacity-80'
                    : 'text-gray-300 opacity-40'
                }`} />
                {!superStarPurchased && (
                  <span className={`absolute -bottom-1 -right-1 px-1 py-0.5 rounded-full text-[8px] font-bold transition-all ${
                    hoveredRating === 6 ? 'bg-purple-600 text-white scale-110' : 'bg-purple-100 text-purple-600'
                  }`}>$5</span>
                )}
                {superStarPurchased && (
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
                {wantsSuperStar || superStarPurchased
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
                    {language === 'en' ? 'What is a Super Star?' : language === 'fr' ? "Qu'est-ce qu'une Super Étoile ?" : 'Wanem i Super Star?'}
                  </p>
                  <p className="text-purple-700 text-xs leading-relaxed">
                    {language === 'en'
                      ? "The Super Star is a premium 6th star that costs $5. It's a special way to show exceptional appreciation for a business. Super Stars are displayed prominently on business profiles and help them stand out."
                      : language === 'fr'
                      ? "La Super Étoile est une 6ème étoile premium qui coûte 5$. C'est une façon spéciale de montrer une appréciation exceptionnelle."
                      :'Super Star hem i wan spesel namba 6 sta we i kostem 500 Vatu ($5 AUD). Hem i wan gudfala wei blong leftemap nem blong wan bisnis mo soem se sevis blong olgeta i nambawan tumas.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {superStarPurchased && (
            <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-50 border border-purple-200">
              <Sparkles className="w-4 h-4 text-purple-500" />
              <span className="text-sm font-semibold text-purple-700">
                {language === 'en' ? 'Super Star added to your review!' : language === 'fr' ? 'Super Étoile ajoutée !' : 'Supa Sta i joen long riviu blong yu!'}
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
            {language === 'en' ? 'Your Review' : language === 'fr' ? 'Votre avis' : 'Riviu blong yu'}
            <span className="text-red-500 ml-0.5">*</span>
          </label>
          <textarea
            value={comment}
            onChange={(e) => { setComment(e.target.value); setErrors((prev) => ({ ...prev, comment: undefined })); }}
            placeholder={language === 'en' ? 'Share details about your experience...' : language === 'fr' ? 'Partagez les détails de votre expérience...' : 'Searem ditel abaotem eksperiens blong yu...'}
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
                {language === 'en' ? 'Minimum 10 characters' : language === 'fr' ? 'Minimum 10 caractères' : 'Minimum 10 karakter'}
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
                {language === 'en' ? 'Submitting...' : language === 'fr' ? 'Envoi...' : 'Sendim...'}
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
                  <h3 className="text-xl font-bold">{language === 'en' ? 'Super Star' : language === 'fr' ? 'Super Étoile' : 'Supa Sta'}</h3>
                  <p className="text-sm text-white/80">{language === 'en' ? 'Premium 6th Star Review' : language === 'fr' ? 'Avis Premium 6ème Étoile' : 'Premium 6th Sta Riviu'}</p>
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
                  {ssPaymentError && (
                    <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 mb-4">
                      <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-red-600">{ssPaymentError}</p>
                    </div>
                  )}

                  {/* Card Form */}
                  <div className="space-y-3 mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <CreditCard className="w-4 h-4 text-gray-600" />
                      <span className="text-sm font-semibold text-gray-700">Card Details</span>
                      <span className="text-[10px] text-gray-400 ml-auto">Secured by PayPal</span>
                    </div>

                    {/* Cardholder Name */}
                    <div>
                      <input
                        type="text"
                        value={ssCardName}
                        onChange={(e) => { setSsCardName(e.target.value); setSsCardErrors(p => ({ ...p, cardName: '' })); }}
                        placeholder="Name on card"
                        autoComplete="cc-name"
                        className={`w-full px-3.5 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 ${
                          ssCardErrors.cardName ? 'border-red-300' : 'border-gray-200'
                        }`}
                      />
                      {ssCardErrors.cardName && <p className="text-[11px] text-red-500 mt-0.5">{ssCardErrors.cardName}</p>}
                    </div>

                    {/* Card Number */}
                    <div>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={ssCardNumber}
                        onChange={(e) => {
                          const f = formatCardNumber(e.target.value);
                          setSsCardNumber(f);
                          setSsCardErrors(p => ({ ...p, cardNumber: '' }));
                          if (f.replace(/\s/g, '').length === 16) ssExpiryRef.current?.focus();
                        }}
                        placeholder="1234 5678 9012 3456"
                        autoComplete="cc-number"
                        maxLength={19}
                        className={`w-full px-3.5 py-2.5 rounded-lg border text-sm font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 ${
                          ssCardErrors.cardNumber ? 'border-red-300' : 'border-gray-200'
                        }`}
                      />
                      {ssCardErrors.cardNumber && <p className="text-[11px] text-red-500 mt-0.5">{ssCardErrors.cardNumber}</p>}
                    </div>

                    {/* Expiry + CVV */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <input
                          ref={ssExpiryRef}
                          type="text"
                          inputMode="numeric"
                          value={ssCardExpiry}
                          onChange={(e) => {
                            const f = formatExpiry(e.target.value);
                            setSsCardExpiry(f);
                            setSsCardErrors(p => ({ ...p, cardExpiry: '' }));
                            if (f.length === 5) ssCvvRef.current?.focus();
                          }}
                          placeholder="MM/YY"
                          autoComplete="cc-exp"
                          maxLength={5}
                          className={`w-full px-3.5 py-2.5 rounded-lg border text-sm font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 ${
                            ssCardErrors.cardExpiry ? 'border-red-300' : 'border-gray-200'
                          }`}
                        />
                        {ssCardErrors.cardExpiry && <p className="text-[11px] text-red-500 mt-0.5">{ssCardErrors.cardExpiry}</p>}
                      </div>
                      <div>
                        <input
                          ref={ssCvvRef}
                          type="text"
                          inputMode="numeric"
                          value={ssCardCvv}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '').substring(0, 4);
                            setSsCardCvv(val);
                            setSsCardErrors(p => ({ ...p, cardCvv: '' }));
                          }}
                          placeholder="CVV"
                          autoComplete="cc-csc"
                          maxLength={4}
                          className={`w-full px-3.5 py-2.5 rounded-lg border text-sm font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 ${
                            ssCardErrors.cardCvv ? 'border-red-300' : 'border-gray-200'
                          }`}
                        />
                        {ssCardErrors.cardCvv && <p className="text-[11px] text-red-500 mt-0.5">{ssCardErrors.cardCvv}</p>}
                      </div>
                    </div>
                  </div>

                  {/* Security */}
                  <div className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-50 mb-4">
                    <Shield className="w-3.5 h-3.5 text-green-500" />
                    <span className="text-[11px] text-gray-500">256-bit SSL encrypted</span>
                    <Lock className="w-3.5 h-3.5 text-green-500 ml-auto" />
                  </div>

                  {/* Pay Button */}
                  <button
                    onClick={handlePurchaseSuperStar}
                    disabled={superStarProcessing}
                    className="w-full py-3.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold text-base transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                  >
                    <Lock className="w-4 h-4" />
                    {language === 'en' ? 'Pay $5.00 Securely' : language === 'fr' ? 'Payer 5,00$ en toute sécurité' : 'Peim $5.00 sef'}
                  </button>

                  <p className="text-[11px] text-center text-gray-400 mt-2">
                    {language === 'en' ? 'Secure payment via PayPal gateway. Non-refundable.' : 'Paiement sécurisé via PayPal. Non remboursable.'}
                  </p>

                  <button
                    onClick={() => setShowSuperStarModal(false)}
                    disabled={superStarProcessing}
                    className="w-full mt-3 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    {language === 'en' ? 'Maybe later' : language === 'fr' ? 'Peut-être plus tard' : 'Maet leit'}
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
                  <p className="text-sm text-gray-500">Securely processing your card...</p>
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
