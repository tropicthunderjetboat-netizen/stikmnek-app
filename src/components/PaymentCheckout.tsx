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
  daily: { price: 15, days: 1, label: 'Family Explorer Pass', icon: Zap, color: 'from-sky-500 to-blue-600', shadow: 'shadow-sky-200', group: 'people' },
  weekly: { price: 45, days: 6, label: 'Extended Group Adventure Pass', icon: Star, color: 'from-teal-500 to-emerald-600', shadow: 'shadow-teal-200', group: '4 people' },
  monthly: { price: 99, days: 6, label: 'Ultimate Crew Experience Pass', icon: Crown, color: 'from-orange-500 to-amber-600', shadow: 'shadow-orange-200', group: '7 people' },
};

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

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const [startDate, setStartDate] = useState(todayStr);

  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCvv] = useState('');
  const [cardName, setCardName] = useState('');
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});
  const [paymentResult, setPaymentResult] = useState<any>(null);

  const cardNumberRef = useRef<HTMLInputElement>(null);
  const expiryRef = useRef<HTMLInputElement>(null);
  const cvvRef = useRef<HTMLInputElement>(null);

  const selectedPass = cart ? PASSES[cart.passType as keyof typeof PASSES] : null;

  const endDate = useMemo(() => {
    if (!selectedPass || !startDate) return '';
    const start = new Date(startDate + 'T00:00:00');
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
          <button onClick={() => setCurrentView('passes')} className="px-6 py-3 rounded-xl bg-teal-600 text-white font-semibold hover:bg-teal-700 transition-colors">
            View Passes
          </button>
        </div>
      </div>
    );
  }

  const validateCard = (): boolean => {
    const errors: Record<string, string> = {};
    const cleanNum = cardNumber.replace(/\D/g, '');
    if (!cleanNum || cleanNum.length < 13) errors.cardNumber = 'Please enter a valid card number';
    else if (!luhnCheck(cleanNum)) errors.cardNumber = 'Invalid card number';

    if (!cardExpiry || cardExpiry.length < 5) {
      errors.cardExpiry = 'Enter expiry (MM/YY)';
    } else {
      const [mm, yy] = cardExpiry.split('/');
      const month = parseInt(mm, 10);
      const year = parseInt('20' + yy, 10);
      const now = new Date();
      if (month < 1 || month > 12) errors.cardExpiry = 'Invalid month';
      else if (year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1)) errors.cardExpiry = 'Card has expired';
    }

    if (!cardCvv || cardCvv.length < 3) errors.cardCvv = 'Enter CVV';
    if (!cardName.trim() || cardName.trim().length < 2) errors.cardName = 'Enter cardholder name';

    setCardErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handlePayWithCard = async () => {
    if (!validateCard()) return;
    setProcessing(true);
    setStep('processing');
    setPaymentError(null);

    try {
      const accessToken = await getValidAccessToken();
      if (!accessToken) {
        setShowAuth(true);
        setAuthMode('signin');
        throw new Error('Session expired');
      }

      // ═══ PLACEHOLDER LOGIC FOR DEMO ═══
      // In production, this would call your payment gateway
      const mockResult = {
        success: true,
        receiptNumber: 'SN-' + Math.random().toString(36).substring(2, 9).toUpperCase(),
        passType: cart.passType,
        amount: selectedPass.price,
        cardLast4: cardNumber.slice(-4),
        validFrom: startDate,
        validUntil: endDate
      };

      setPaymentResult(mockResult);
      localStorage.setItem('lastPayment', JSON.stringify(mockResult));
      toast.success('Payment successful!');
      setStep('success');

      setTimeout(() => {
        refreshUserPass();
        setCart(null);
        setCurrentView('payment-confirmation' as any);
      }, 2000);

    } catch (err: any) {
      setPaymentError(err.message || 'Payment failed');
      setStep('payment');
      setProcessing(false);
    }
  };

  const Icon = selectedPass.icon;
  const currentStepIndex = step === 'dates' ? 0 : step === 'payment' ? 1 : 2;

  return (
    <div className="min-h-screen bg-gray-50 pt-20 pb-16">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <button onClick={() => setCurrentView('passes')} className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm font-medium">Back to Passes</span>
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          <div className="lg:col-span-3 space-y-6">
            <div>
              <h1 className="text-2xl font-extrabold text-gray-900">Checkout</h1>
              <p className="text-gray-500 text-sm mt-1">Complete your purchase securely</p>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              {['Choose Dates', 'Card Details', 'Complete'].map((label, i) => (
                <div key={label} className="flex items-center gap-1.5 sm:gap-2">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${i <= currentStepIndex ? 'bg-teal-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                    {i < currentStepIndex ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : i + 1}
                  </div>
                  <span className={`text-xs font-medium hidden sm:inline ${i <= currentStepIndex ? 'text-teal-700' : 'text-gray-400'}`}>{label}</span>
                  {i < 2 && <ChevronRight className="w-3.5 h-3.5 text-gray-300" />}
                </div>
              ))}
            </div>

            {step === 'dates' && (
              <div className="space-y-5">
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <CalendarRange className="w-5 h-5 text-teal-600" />
                  When do you want your discounts to start?
                </h3>
                <div className="bg-white rounded-xl p-6 border border-gray-200 space-y-5">
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-teal-50 border border-teal-100">
                    <Info className="w-5 h-5 text-teal-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-teal-800">
                      <p className="font-semibold mb-1">How it works</p>
                      <p className="text-teal-700">Choose your start date and your <strong>{selectedPass.label}</strong> will be valid for <strong>{selectedPass.days} days</strong>.</p>
                    </div>
                  </div>
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
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-orange-500" />
                      Discounts Valid Until (End Date)
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
                  </div>

                  <div className="mt-2 p-4 rounded-xl bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-100">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 bg-white rounded-lg p-3 border border-teal-200">
                        <p className="text-[10px] text-gray-400 font-medium uppercase">Start</p>
                        <p className="text-sm font-bold text-gray-900">{formatDate(startDate)}</p>
                      </div>
                      <div className="flex-1 bg-white rounded-lg p-3 border border-orange-200">
                        <p className="text-[10px] text-gray-400 font-medium uppercase">End</p>
                        <p className="text-sm font-bold text-gray-900">{formatDate(endDate)}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setStep('payment')}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-bold hover:opacity-90 transition-all flex items-center justify-center gap-2"
                >
                  Continue to Payment
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {step === 'payment' && (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-teal-600" />
                    Enter Card Details
                  </h3>
                </div>

                {paymentError && (
                  <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-center gap-3 text-red-800 text-sm font-medium">
                    <AlertCircle className="w-5 h-5" />
                    {paymentError}
                  </div>
                )}

                <div className="bg-white rounded-xl p-6 border border-gray-200 space-y-4">
                  <input
                    type="text"
                    placeholder="Cardholder Name"
                    value={cardName}
                    onChange={(e) => setCardName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                  />
                  <input
                    ref={cardNumberRef}
                    type="text"
                    placeholder="Card Number"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 text-sm font-mono focus:ring-2 focus:ring-teal-500 outline-none"
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <input
                      type="text"
                      placeholder="MM/YY"
                      value={cardExpiry}
                      onChange={(e) => setCardExpiry(formatExpiry(e.target.value))}
                      className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 text-sm font-mono focus:ring-2 focus:ring-teal-500 outline-none"
                    />
                    <input
                      type="text"
                      placeholder="CVV"
                      value={cardCvv}
                      onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').substring(0, 4))}
                      className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 text-sm font-mono focus:ring-2 focus:ring-teal-500 outline-none"
                    />
                  </div>
                </div>

                <button
                  onClick={handlePayWithCard}
                  disabled={processing}
                  className="w-full py-4 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-bold text-lg disabled:opacity-50"
                >
                  {processing ? <Loader2 className="animate-spin mx-auto" /> : `Pay A$${selectedPass.price}.00 Securely`}
                </button>
              </div>
            )}

            {step === 'processing' && (
              <div className="bg-white rounded-xl p-12 text-center border">
                <Loader2 className="w-12 h-12 text-teal-600 animate-spin mx-auto mb-4" />
                <h3 className="text-xl font-bold">Processing...</h3>
              </div>
            )}

            {step === 'success' && (
              <div className="bg-white rounded-xl p-12 text-center border border-green-200">
                <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-4" />
                <h3 className="text-xl font-bold">Payment Successful!</h3>
              </div>
            )}
          </div>

          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl border border-gray-200 p-5 sticky top-24">
              <h3 className="font-bold mb-4">Order Summary</h3>
              <div className={`bg-gradient-to-br ${selectedPass.color} rounded-xl p-5 text-white mb-4`}>
                <h4 className="font-bold">{selectedPass.label}</h4>
                <p className="text-sm opacity-90">{selectedPass.days} days • {selectedPass.group}</p>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span>Total</span><span className="font-bold">A${selectedPass.price}.00</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentCheckout;
