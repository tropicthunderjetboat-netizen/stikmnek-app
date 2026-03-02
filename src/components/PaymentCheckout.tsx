import React, { useState, useMemo, useRef } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import {
  ArrowLeft, Shield, Lock, Check, Loader2,
  Zap, Star, Crown, ChevronRight, Calendar, CalendarRange, Info,
  Users, CreditCard, AlertCircle, CheckCircle
} from 'lucide-react';

const PASSES = {
  daily: { price: 15, days: 1, label: 'Family Explorer Pass', icon: Zap, color: 'from-sky-500 to-blue-600', shadow: 'shadow-sky-200', group: '4 people' },
  weekly: { price: 45, days: 6, label: 'Extended Group Adventure Pass', icon: Star, color: 'from-teal-500 to-emerald-600', shadow: 'shadow-teal-200', group: '4 people' },
  monthly: { price: 99, days: 6, label: 'Ultimate Crew Experience Pass', icon: Crown, color: 'from-orange-500 to-amber-600', shadow: 'shadow-orange-200', group: '7 people' },
};

/**
 * Ensures the Supabase SDK has a valid, fresh access token.
 * 
 * This does TWO things:
 * 1. Refreshes the session if it's close to expiry (< 120s)
 * 2. Returns the token so we can verify it exists
 * 
 * IMPORTANT: We do NOT pass this token as a custom Authorization header.
 * The SDK's functions.invoke() automatically uses its internal session token.
 * We only call this to FORCE a refresh before the invoke.
 */
async function ensureFreshSession(): Promise<string | null> {
  console.log('[PaymentCheckout] ensureFreshSession: checking current session...');
  
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    console.error('[PaymentCheckout] ensureFreshSession: NO session found');
    return null;
  }

  const expiresAt = session.expires_at;
  const now = Math.floor(Date.now() / 1000);
  const secondsLeft = expiresAt ? expiresAt - now : 0;
  console.log('[PaymentCheckout] ensureFreshSession: token expires in', secondsLeft, 'seconds');

  // If token expires in less than 120 seconds, refresh it
  if (secondsLeft < 120) {
    console.log('[PaymentCheckout] ensureFreshSession: refreshing session (< 120s left)...');
    const { data: { session: refreshed }, error } = await supabase.auth.refreshSession();
    if (error) {
      console.error('[PaymentCheckout] ensureFreshSession: refresh FAILED:', error.message);
      return null;
    }
    if (!refreshed?.access_token) {
      console.error('[PaymentCheckout] ensureFreshSession: refresh returned no token');
      return null;
    }
    const newExpiry = refreshed.expires_at ? refreshed.expires_at - Math.floor(Date.now() / 1000) : 0;
    console.log('[PaymentCheckout] ensureFreshSession: refreshed OK, new token expires in', newExpiry, 's');
    return refreshed.access_token;
  }

  console.log('[PaymentCheckout] ensureFreshSession: current token is fresh enough');
  return session.access_token;
}


// ═══ CARD FORMATTING HELPERS ═══
function formatCardNumber(value: string): string {
  const digits = value.replace(/\D/g, '').substring(0, 16);
  const groups = digits.match(/.{1,4}/g);
  return groups ? groups.join(' ') : digits;
}

function formatExpiry(value: string): string {
  const digits = value.replace(/\D/g, '').substring(0, 4);
  if (digits.length >= 3) {
    return digits.substring(0, 2) + '/' + digits.substring(2);
  }
  return digits;
}

function detectCardType(number: string): string {
  const clean = number.replace(/\D/g, '');
  if (/^4/.test(clean)) return 'visa';
  if (/^5[1-5]/.test(clean) || /^2[2-7]/.test(clean)) return 'mastercard';
  if (/^3[47]/.test(clean)) return 'amex';
  if (/^6(?:011|5)/.test(clean)) return 'discover';
  return 'unknown';
}

function luhnCheck(num: string): boolean {
  const digits = num.replace(/\D/g, '');
  if (digits.length < 13) return false;
  let sum = 0;
  let isEven = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits[i], 10);
    if (isEven) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    isEven = !isEven;
  }
  return sum % 10 === 0;
}

// ═══ CARD BRAND ICONS ═══
const CardBrandIcon: React.FC<{ brand: string; className?: string }> = ({ brand, className = 'w-8 h-5' }) => {
  if (brand === 'visa') {
    return (
      <svg className={className} viewBox="0 0 48 32" fill="none">
        <rect width="48" height="32" rx="4" fill="#1A1F71" />
        <path d="M19.5 21H17L18.7 11H21.2L19.5 21ZM15.3 11L12.9 18L12.6 16.5L11.7 12C11.7 12 11.6 11 10.3 11H6.1L6 11.2C6 11.2 7.5 11.5 9.2 12.5L11.4 21H14L18 11H15.3ZM35.2 21H37.5L35.5 11H33.5C32.4 11 32.1 11.8 32.1 11.8L28.3 21H30.9L31.4 19.5H34.6L34.9 21H35.2ZM32.1 17.5L33.5 13.5L34.3 17.5H32.1ZM28.5 13.3L28.9 11.2C28.9 11.2 27.6 10.8 26.2 10.8C24.7 10.8 21.3 11.5 21.3 14.3C21.3 16.9 24.9 16.9 24.9 18.3C24.9 19.6 21.7 19.3 20.5 18.4L20.1 20.6C20.1 20.6 21.4 21.2 23.3 21.2C25.2 21.2 28.5 20.1 28.5 17.5C28.5 14.8 24.8 14.6 24.8 13.4C24.8 12.2 27.2 12.4 28.5 13.3Z" fill="white" />
      </svg>
    );
  }
  if (brand === 'mastercard') {
    return (
      <svg className={className} viewBox="0 0 48 32" fill="none">
        <rect width="48" height="32" rx="4" fill="#252525" />
        <circle cx="19" cy="16" r="8" fill="#EB001B" />
        <circle cx="29" cy="16" r="8" fill="#F79E1B" />
        <path d="M24 10.3C25.8 11.7 27 13.7 27 16C27 18.3 25.8 20.3 24 21.7C22.2 20.3 21 18.3 21 16C21 13.7 22.2 11.7 24 10.3Z" fill="#FF5F00" />
      </svg>
    );
  }
  if (brand === 'amex') {
    return (
      <svg className={className} viewBox="0 0 48 32" fill="none">
        <rect width="48" height="32" rx="4" fill="#2E77BC" />
        <text x="24" y="19" textAnchor="middle" fill="white" fontSize="9" fontWeight="bold" fontFamily="Arial">AMEX</text>
      </svg>
    );
  }
  return (
    <div className={`${className} rounded bg-gray-200 flex items-center justify-center`}>
      <CreditCard className="w-4 h-3 text-gray-400" />
    </div>
  );
};

const PaymentCheckout: React.FC = () => {
  const { user, setCurrentView, cart, setCart, setShowAuth, setAuthMode, refreshUserPass } = useAppContext();
  const [processing, setProcessing] = useState(false);
  const [step, setStep] = useState<'dates' | 'payment' | 'processing' | 'success'>('dates');
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Date state
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const [startDate, setStartDate] = useState(todayStr);

  // Card state
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCvv] = useState('');
  const [cardName, setCardName] = useState('');
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});

  // Success state
  const [paymentResult, setPaymentResult] = useState<any>(null);

  const cardNumberRef = useRef<HTMLInputElement>(null);
  const expiryRef = useRef<HTMLInputElement>(null);
  const cvvRef = useRef<HTMLInputElement>(null);

  const selectedPass = cart ? PASSES[cart.passType] : null;

  const endDate = useMemo(() => {
    if (!selectedPass || !startDate) return '';
    const start = new Date(startDate);
    start.setDate(start.getDate() + selectedPass.days);
    return start.toISOString().split('T')[0];
  }, [startDate, selectedPass]);

  const daysCount = selectedPass?.days || 0;
  const cardType = detectCardType(cardNumber);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' });
  };

  const maxStartDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 90);
    return d.toISOString().split('T')[0];
  }, []);

  if (!user) return null;

  if (!cart || !selectedPass) {
    return (
      <div className="min-h-screen bg-gray-50 pt-20 pb-16">
        <div className="max-w-lg mx-auto px-4 text-center pt-20">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gray-100 flex items-center justify-center">
            <CreditCard className="w-10 h-10 text-gray-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-3">No Pass Selected</h2>
          <p className="text-gray-500 mb-6">Please select a pass to purchase first.</p>
          <button
            onClick={() => setCurrentView('passes')}
            className="px-6 py-3 rounded-xl bg-teal-600 text-white font-semibold hover:bg-teal-700 transition-colors"
          >
            View Passes
          </button>
        </div>
      </div>
    );
  }

  // ═══ CARD VALIDATION ═══
  const validateCard = (): boolean => {
    const errors: Record<string, string> = {};
    const cleanNum = cardNumber.replace(/\D/g, '');

    if (!cleanNum || cleanNum.length < 13) {
      errors.cardNumber = 'Please enter a valid card number';
    } else if (!luhnCheck(cleanNum)) {
      errors.cardNumber = 'Invalid card number';
    }

    if (!cardExpiry || cardExpiry.length < 5) {
      errors.cardExpiry = 'Enter expiry (MM/YY)';
    } else {
      const [mm, yy] = cardExpiry.split('/');
      const month = parseInt(mm, 10);
      const year = parseInt('20' + yy, 10);
      const now = new Date();
      if (month < 1 || month > 12) {
        errors.cardExpiry = 'Invalid month';
      } else if (year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1)) {
        errors.cardExpiry = 'Card has expired';
      }
    }

    if (!cardCvv || cardCvv.length < 3) {
      errors.cardCvv = 'Enter CVV';
    }

    if (!cardName.trim() || cardName.trim().length < 2) {
      errors.cardName = 'Enter cardholder name';
    }

    setCardErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // ═══ PROCESS CARD PAYMENT ═══
  //
  // KEY FIX (2026-02-28): 
  // 1. We call ensureFreshSession() to guarantee the SDK has a valid JWT
  // 2. We do NOT pass a custom Authorization header — the SDK handles it
  // 3. We extract error details from both `data` and `error` objects
  //
  // The old code passed `headers: { Authorization: ... }` which could
  // conflict with the SDK's internal auth header management and cause
  // the Supabase relay to reject the request with 401.
  // ═══════════════════════════════════════════════════════════════
  const handlePayWithCard = async () => {
    if (!validateCard()) return;

    setProcessing(true);
    setStep('processing');
    setPaymentError(null);

    try {
      // Step 1: Ensure the SDK has a fresh, valid session token
      console.log('[PaymentCheckout] Step 1: Ensuring fresh session...');
      const token = await ensureFreshSession();
      if (!token) {
        console.error('[PaymentCheckout] No valid session — prompting sign in');
        toast.error('Your session has expired. Please sign in again.');
        setStep('payment');
        setProcessing(false);
        setShowAuth(true);
        setAuthMode('signin');
        return;
      }
      console.log('[PaymentCheckout] Session OK — token length:', token.length);

      // Step 2: Get stored referral code if any
      let referralCode: string | null = null;
      try {
        referralCode = localStorage.getItem('stikmnek-referral-code');
      } catch {}

      // Step 3: Invoke the edge function
      // IMPORTANT: Do NOT pass custom Authorization header.
      // The Supabase SDK automatically includes the session JWT.
      // Passing a custom header can cause conflicts with the relay's JWT validation.
      console.log('[PaymentCheckout] Step 3: Invoking process-card-payment...');
      console.log('[PaymentCheckout] passType:', cart.passType, 'startDate:', startDate);

      const { data, error } = await supabase.functions.invoke('process-card-payment', {
        body: {
          action: 'purchase_pass',
          passType: cart.passType,
          startDate,
          cardNumber: cardNumber.replace(/\s/g, ''),
          cardExpiry,
          cardCvv,
          cardName: cardName.trim(),
          referralCode,
        },
        // NO custom headers — let the SDK handle Authorization automatically
      });

      console.log('[PaymentCheckout] invoke returned — data:', JSON.stringify(data)?.substring(0, 200), 'error:', error?.message);

      // Step 4: Handle the response
      // The SDK returns { data, error }. When the function returns non-2xx:
      // - error: FunctionsHttpError with generic message
      // - data: may contain the actual error response body from our function
      
      if (error) {
        console.error('[PaymentCheckout] Edge function error object:', error);
        
        // Try to extract the actual error message from the data object
        // (the SDK sometimes puts the response body in data even on error)
        const serverError = data?.error || data?.message;
        const serverHint = data?.hint || data?.step;
        
        if (serverError) {
          console.error('[PaymentCheckout] Server error:', serverError, 'hint:', serverHint);
          throw new Error(serverError);
        }
        
        // If no server error in data, use the SDK error message
        // but make it more user-friendly
        const errMsg = error.message || 'Payment processing failed';
        if (errMsg.includes('non-2xx')) {
          throw new Error('Unable to reach payment server. Please check your connection and try again.');
        }
        throw new Error(errMsg);
      }

      if (!data) {
        throw new Error('No response from payment server');
      }

      if (data.success) {
        // Payment successful!
        console.log('[PaymentCheckout] Payment SUCCESS — receipt:', data.receiptNumber);
        setPaymentResult(data);
        setStep('success');

        const paymentResultData = {
          receiptNumber: data.receiptNumber,
          passType: data.passType,
          passLabel: data.passLabel || selectedPass.label,
          amount: data.amount,
          currency: data.currency || 'AUD',
          paymentMethod: data.paymentMethod || 'card',
          expiresAt: data.expiresAt,
          validFrom: data.validFrom,
          validUntil: data.validUntil,
          days: data.days,
          group: data.group || selectedPass.group,
          sessionId: data.sessionId,
          completedAt: new Date().toISOString(),
          cardLast4: data.cardLast4,
          paypalOrderId: data.paypalOrderId,
        };
        localStorage.setItem('lastPayment', JSON.stringify(paymentResultData));


        // Clear referral code after successful purchase
        try { localStorage.removeItem('stikmnek-referral-code'); } catch {}
        // Clear pending payment data
        localStorage.removeItem('paypalPending');
        localStorage.removeItem('pendingPayment');

        toast.success('Payment successful! Your pass is now active.');

        // Refresh user pass data
        setTimeout(() => {
          refreshUserPass();
        }, 1000);

        // Navigate to confirmation after brief delay
        setTimeout(() => {
          setCart(null);
          setCurrentView('payment-confirmation' as any);
        }, 2500);
      } else if (data.requires3DS) {
        setPaymentError('Your bank requires additional verification. Please try a different card or contact your bank.');
        setStep('payment');
        setProcessing(false);
      } else {
        // Function returned a non-success response
        throw new Error(data.error || 'Payment processing failed');
      }
    } catch (err: any) {
      console.error('[PaymentCheckout] CATCH:', err.message);
      const errorMsg = err.message || 'Failed to process payment. Please try again.';
      setPaymentError(errorMsg);
      toast.error(errorMsg);
      setStep('payment');
      setProcessing(false);
    }
  };


  const Icon = selectedPass.icon;
  const currentStepIndex = step === 'dates' ? 0 : step === 'payment' ? 1 : step === 'success' ? 2 : 2;

  return (
    <div className="min-h-screen bg-gray-50 pt-20 pb-16">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Back Button */}
        <button
          onClick={() => setCurrentView('passes')}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm font-medium">Back to Passes</span>
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Payment Form - Left */}
          <div className="lg:col-span-3 space-y-6">
            <div>
              <h1 className="text-2xl font-extrabold text-gray-900">Checkout</h1>
              <p className="text-gray-500 text-sm mt-1">Complete your purchase securely with your credit or debit card</p>
            </div>

            {/* Step Indicator */}
            <div className="flex items-center gap-2 sm:gap-3">
              {['Choose Dates', 'Card Details', 'Complete'].map((label, i) => (
                <div key={label} className="flex items-center gap-1.5 sm:gap-2">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                    i <= currentStepIndex
                      ? 'bg-teal-600 text-white'
                      : 'bg-gray-200 text-gray-500'
                  }`}>
                    {i < currentStepIndex ? (
                      <Check className="w-3.5 h-3.5" strokeWidth={3} />
                    ) : (
                      i + 1
                    )}
                  </div>
                  <span className={`text-xs font-medium hidden sm:inline ${
                    i <= currentStepIndex ? 'text-teal-700' : 'text-gray-400'
                  }`}>{label}</span>
                  {i < 2 && <ChevronRight className="w-3.5 h-3.5 text-gray-300" />}
                </div>
              ))}
            </div>

            {/* ═══ STEP 1: DATE SELECTION ═══ */}
            {step === 'dates' && (
              <div className="space-y-5">
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <CalendarRange className="w-5 h-5 text-teal-600" />
                  When do you want your discounts to start?
                </h3>

                <div className="bg-white rounded-xl p-6 border border-gray-200 space-y-5">
                  {/* Info Banner */}
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-teal-50 border border-teal-100">
                    <Info className="w-5 h-5 text-teal-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-teal-800">
                      <p className="font-semibold mb-1">How it works</p>
                      <p className="text-teal-700">
                        Choose your start date and your <strong>{selectedPass.label}</strong> will be valid for <strong>{selectedPass.days} day{selectedPass.days > 1 ? 's' : ''}</strong> for <strong>{selectedPass.group}</strong>. 
                        The end date is automatically calculated. Share the app to unlock bonus features!
                      </p>
                    </div>
                  </div>

                  {/* Group Info */}
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-blue-50 border border-blue-100">
                    <Users className="w-5 h-5 text-blue-600 flex-shrink-0" />
                    <div className="text-sm text-blue-800">
                      <span className="font-semibold">Group Size:</span> {selectedPass.group}
                    </div>
                  </div>

                  {/* Start Date Picker */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-teal-600" />
                      Discounts Valid From (Start Date)
                    </label>
                    <input
                      type="date"
                      value={startDate}
                      min={todayStr}
                      max={maxStartDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full px-4 py-3.5 rounded-xl border-2 border-gray-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all cursor-pointer hover:border-teal-300"
                    />
                    <p className="text-xs text-gray-400 mt-1.5">
                      You can start your pass up to 90 days from today
                    </p>
                  </div>

                  {/* End Date (Auto-calculated) */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-orange-500" />
                      Discounts Valid Until (End Date)
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium ml-1">Auto-calculated</span>
                    </label>
                    <div className="relative">
                      <input
                        type="date"
                        value={endDate}
                        readOnly
                        className="w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-sm font-medium text-gray-600 cursor-not-allowed"
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <Lock className="w-4 h-4 text-gray-300" />
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 mt-1.5">
                      Automatically set to {daysCount} day{daysCount > 1 ? 's' : ''} after your start date
                    </p>
                  </div>

                  {/* Date Range Preview */}
                  <div className="mt-2 p-4 rounded-xl bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-100">
                    <p className="text-xs font-semibold text-teal-600 uppercase tracking-wider mb-3">Your Discount Period</p>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 bg-white rounded-lg p-3 border border-teal-200 shadow-sm">
                        <p className="text-[10px] text-gray-400 font-medium uppercase">Start</p>
                        <p className="text-sm font-bold text-gray-900 mt-0.5">{formatDate(startDate)}</p>
                      </div>
                      <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
                        <div className="px-3 py-1 rounded-full bg-teal-600 text-white text-[10px] font-bold shadow-sm">
                          {daysCount} day{daysCount > 1 ? 's' : ''}
                        </div>
                        <div className="w-8 h-0.5 bg-teal-300 rounded-full" />
                      </div>
                      <div className="flex-1 bg-white rounded-lg p-3 border border-orange-200 shadow-sm">
                        <p className="text-[10px] text-gray-400 font-medium uppercase">End</p>
                        <p className="text-sm font-bold text-gray-900 mt-0.5">{formatDate(endDate)}</p>
                      </div>
                    </div>

                    {startDate === todayStr && (
                      <p className="text-xs text-teal-600 mt-3 flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5" />
                        Starting today! Your discounts will be active immediately after purchase.
                      </p>
                    )}
                    {startDate > todayStr && (
                      <p className="text-xs text-teal-600 mt-3 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        Your discounts will activate on {formatDate(startDate)}.
                      </p>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => setStep('payment')}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-bold hover:from-teal-700 hover:to-emerald-700 transition-all shadow-lg shadow-teal-200 flex items-center justify-center gap-2"
                >
                  Continue to Payment
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* ═══ STEP 2: CARD DETAILS & PAY ═══ */}
            {step === 'payment' && (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-teal-600" />
                    Enter Card Details
                  </h3>
                  <button
                    onClick={() => setStep('dates')}
                    className="text-sm text-teal-600 hover:text-teal-700 font-medium"
                  >
                    Change dates
                  </button>
                </div>

                {/* Date summary bar */}
                <div className="flex items-center gap-3 p-3 rounded-xl bg-teal-50 border border-teal-100 text-sm">
                  <CalendarRange className="w-4 h-4 text-teal-600 flex-shrink-0" />
                  <span className="text-teal-800">
                    <strong>{formatDate(startDate)}</strong>
                    <span className="mx-2 text-teal-400">to</span>
                    <strong>{formatDate(endDate)}</strong>
                    <span className="text-teal-500 ml-2">({daysCount} day{daysCount > 1 ? 's' : ''})</span>
                  </span>
                </div>

                {/* Payment Error */}
                {paymentError && (
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200">
                    <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-red-800">Payment Failed</p>
                      <p className="text-sm text-red-600 mt-0.5">{paymentError}</p>
                    </div>
                  </div>
                )}

                {/* Card Form */}
                <div className="bg-white rounded-xl p-6 border border-gray-200 space-y-5">
                  {/* Card Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
                        <CreditCard className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="font-bold text-gray-900 text-sm">Credit or Debit Card</p>
                        <p className="text-xs text-gray-500">Processed securely via PayPal</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CardBrandIcon brand="visa" className="w-8 h-5" />
                      <CardBrandIcon brand="mastercard" className="w-8 h-5" />
                      <CardBrandIcon brand="amex" className="w-8 h-5" />
                    </div>
                  </div>

                  <div className="border-t border-gray-100 pt-5 space-y-4">
                    {/* Cardholder Name */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                        Cardholder Name
                      </label>
                      <input
                        type="text"
                        value={cardName}
                        onChange={(e) => { setCardName(e.target.value); setCardErrors(prev => ({ ...prev, cardName: '' })); }}
                        placeholder="Name on card"
                        autoComplete="cc-name"
                        className={`w-full px-4 py-3 rounded-xl border-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all ${
                          cardErrors.cardName ? 'border-red-300 bg-red-50/50' : 'border-gray-200 hover:border-gray-300'
                        }`}
                      />
                      {cardErrors.cardName && (
                        <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          {cardErrors.cardName}
                        </p>
                      )}
                    </div>

                    {/* Card Number */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                        Card Number
                      </label>
                      <div className="relative">
                        <input
                          ref={cardNumberRef}
                          type="text"
                          inputMode="numeric"
                          value={cardNumber}
                          onChange={(e) => {
                            const formatted = formatCardNumber(e.target.value);
                            setCardNumber(formatted);
                            setCardErrors(prev => ({ ...prev, cardNumber: '' }));
                            // Auto-advance to expiry when card number is complete
                            if (formatted.replace(/\s/g, '').length === 16) {
                              expiryRef.current?.focus();
                            }
                          }}
                          placeholder="1234 5678 9012 3456"
                          autoComplete="cc-number"
                          maxLength={19}
                          className={`w-full px-4 py-3 pr-14 rounded-xl border-2 text-sm font-mono font-medium tracking-wider focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all ${
                            cardErrors.cardNumber ? 'border-red-300 bg-red-50/50' : 'border-gray-200 hover:border-gray-300'
                          }`}
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <CardBrandIcon brand={cardType} className="w-8 h-5" />
                        </div>
                      </div>
                      {cardErrors.cardNumber && (
                        <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          {cardErrors.cardNumber}
                        </p>
                      )}
                    </div>

                    {/* Expiry + CVV Row */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                          Expiry Date
                        </label>
                        <input
                          ref={expiryRef}
                          type="text"
                          inputMode="numeric"
                          value={cardExpiry}
                          onChange={(e) => {
                            const formatted = formatExpiry(e.target.value);
                            setCardExpiry(formatted);
                            setCardErrors(prev => ({ ...prev, cardExpiry: '' }));
                            if (formatted.length === 5) {
                              cvvRef.current?.focus();
                            }
                          }}
                          placeholder="MM/YY"
                          autoComplete="cc-exp"
                          maxLength={5}
                          className={`w-full px-4 py-3 rounded-xl border-2 text-sm font-mono font-medium tracking-wider focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all ${
                            cardErrors.cardExpiry ? 'border-red-300 bg-red-50/50' : 'border-gray-200 hover:border-gray-300'
                          }`}
                        />
                        {cardErrors.cardExpiry && (
                          <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            {cardErrors.cardExpiry}
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                          CVV
                        </label>
                        <div className="relative">
                          <input
                            ref={cvvRef}
                            type="text"
                            inputMode="numeric"
                            value={cardCvv}
                            onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, '').substring(0, 4);
                              setCvv(val);
                              setCardErrors(prev => ({ ...prev, cardCvv: '' }));
                            }}
                            placeholder="123"
                            autoComplete="cc-csc"
                            maxLength={4}
                            className={`w-full px-4 py-3 rounded-xl border-2 text-sm font-mono font-medium tracking-wider focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all ${
                              cardErrors.cardCvv ? 'border-red-300 bg-red-50/50' : 'border-gray-200 hover:border-gray-300'
                            }`}
                          />
                          <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            <Lock className="w-4 h-4 text-gray-300" />
                          </div>
                        </div>
                        {cardErrors.cardCvv && (
                          <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            {cardErrors.cardCvv}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Security badges */}
                  <div className="flex items-center gap-4 p-3 rounded-lg bg-gray-50 border border-gray-100">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <Shield className="w-4 h-4 text-green-500" />
                      <span>256-bit SSL</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <Lock className="w-4 h-4 text-green-500" />
                      <span>Encrypted</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <Check className="w-4 h-4 text-green-500" />
                      <span>Instant Activation</span>
                    </div>
                  </div>
                </div>

                {/* Pay Button */}
                <button
                  onClick={handlePayWithCard}
                  disabled={processing}
                  className="w-full py-4 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-bold text-lg transition-all shadow-lg shadow-teal-200 hover:shadow-xl hover:-translate-y-0.5 flex items-center justify-center gap-3 disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                >
                  {processing ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Processing payment...
                    </>
                  ) : (
                    <>
                      <Lock className="w-5 h-5" />
                      Pay A${selectedPass.price}.00 Securely
                    </>
                  )}
                </button>

                <p className="text-xs text-center text-gray-400">
                  Your card will be charged A${selectedPass.price}.00 AUD. Payment processed securely by PayPal.
                </p>
              </div>
            )}

            {/* ═══ PROCESSING STATE ═══ */}
            {step === 'processing' && (
              <div className="bg-white rounded-xl p-12 border border-gray-200 text-center">
                <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-teal-50 flex items-center justify-center">
                  <Loader2 className="w-10 h-10 text-teal-600 animate-spin" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Processing Your Payment</h3>
                <p className="text-gray-500 mb-4">
                  Securely processing your card payment...
                </p>
                <p className="text-sm text-gray-400">
                  Please don't close this page. This usually takes just a few seconds.
                </p>
                <div className="mt-6 flex items-center justify-center gap-2 text-xs text-gray-400">
                  <Shield className="w-3.5 h-3.5" />
                  <span>256-bit SSL encrypted</span>
                </div>
              </div>
            )}

            {/* ═══ SUCCESS STATE ═══ */}
            {step === 'success' && paymentResult && (
              <div className="bg-white rounded-xl p-8 border border-green-200 text-center">
                <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-100 flex items-center justify-center animate-in zoom-in duration-300">
                  <CheckCircle className="w-12 h-12 text-green-600" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">Payment Successful!</h3>
                <p className="text-gray-500 mb-6">
                  Your {selectedPass.label} is now active. Redirecting to your receipt...
                </p>
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-50 border border-green-200 text-sm text-green-700 font-medium">
                  <CreditCard className="w-4 h-4" />
                  Card ending in {paymentResult.cardLast4}
                </div>
                <div className="mt-6 w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-green-500 h-full rounded-full animate-pulse" style={{ width: '100%' }} />
                </div>
              </div>
            )}

            {/* Security Badges */}
            <div className="flex items-center justify-center gap-6 py-4">
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <Shield className="w-4 h-4" />
                <span>SSL Secured</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <Lock className="w-4 h-4" />
                <span>Card Data Encrypted</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <Check className="w-4 h-4" />
                <span>Money-back Guarantee</span>
              </div>
            </div>
          </div>

          {/* Order Summary - Right */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden sticky top-24">
              <div className="p-5 border-b border-gray-100">
                <h3 className="font-bold text-gray-900">Order Summary</h3>
              </div>

              <div className="p-5">
                {/* Pass Card */}
                <div className={`relative bg-gradient-to-br ${selectedPass.color} rounded-xl p-5 text-white mb-5 overflow-hidden`}>
                  <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-6 translate-x-6" />
                  <div className="relative">
                    <div className="flex items-center gap-2 mb-3">
                      <Icon className="w-5 h-5" />
                      <span className="text-sm font-medium text-white/80">StikmNek</span>
                    </div>
                    <h4 className="text-lg font-bold">{selectedPass.label}</h4>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/20 text-white text-xs font-semibold">
                        <Users className="w-3 h-3" />
                        {selectedPass.group}
                      </span>
                    </div>
                    <p className="text-sm text-white/70 mt-2">
                      {selectedPass.days} day{selectedPass.days > 1 ? 's' : ''} of unlimited deals
                    </p>
                  </div>
                </div>

                {/* Date Range in Summary */}
                <div className="mb-5 p-3.5 rounded-xl bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-100">
                  <p className="text-[10px] font-semibold text-teal-600 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <CalendarRange className="w-3 h-3" />
                    Discount Validity
                  </p>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">Valid From</span>
                      <span className="font-bold text-gray-900">
                        {new Date(startDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">Valid Until</span>
                      <span className="font-bold text-gray-900">
                        {endDate && new Date(endDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs pt-1 border-t border-teal-100">
                      <span className="text-gray-500">Duration</span>
                      <span className="font-bold text-teal-700">{daysCount} day{daysCount > 1 ? 's' : ''}</span>
                    </div>
                  </div>
                </div>

                {/* Price Breakdown */}
                <div className="space-y-3 mb-5">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">{selectedPass.label}</span>
                    <span className="font-medium text-gray-900">A${selectedPass.price}.00</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Processing fee</span>
                    <span className="font-medium text-gray-900">A$0.00</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Tax</span>
                    <span className="font-medium text-gray-900">A$0.00</span>
                  </div>
                  <div className="border-t border-gray-100 pt-3 flex justify-between">
                    <span className="font-bold text-gray-900">Total</span>
                    <span className="text-xl font-extrabold text-gray-900">A${selectedPass.price}.00 <span className="text-sm font-semibold text-gray-500">AUD</span></span>
                  </div>
                </div>

                {/* Payment Method Indicator */}
                <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100 mb-4">
                  <CreditCard className="w-5 h-5 text-gray-600" />
                  <div className="flex-1">
                    <span className="text-sm font-semibold text-gray-700">Credit / Debit Card</span>
                    <p className="text-[10px] text-gray-400">Powered by PayPal Gateway</p>
                  </div>
                  <Shield className="w-4 h-4 text-green-500" />
                </div>

                {/* Features */}
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  <p className="text-xs font-semibold text-gray-700 mb-2">Includes:</p>
                  {['Unlimited deal redemptions', 'QR code access', 'Real-time savings tracker', 'Map navigation'].map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-gray-600">
                      <Check className="w-3.5 h-3.5 text-teal-600" strokeWidth={3} />
                      {f}
                    </div>
                  ))}
                </div>
              </div>

              {/* Billing Email */}
              <div className="px-5 pb-5">
                <p className="text-xs text-gray-400">
                  Receipt will be sent to <strong className="text-gray-600">{user.email}</strong>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentCheckout;
