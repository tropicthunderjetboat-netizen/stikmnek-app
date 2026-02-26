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

  const selectedPass = cart ? PASSES[cart.passType as keyof typeof PASSES] : null;

  const endDate = useMemo(() => {
    if (!selectedPass || !startDate) return '';
    const start = new Date(startDate + 'T00:00:00');
    start.setDate(start.getDate() + selectedPass.days);
    return start.toISOString().split('T')[0];
  }, [startDate, selectedPass]);

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

      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) throw new Error('User not found');

      // ═══ SAVE TO SUPABASE ═══
      const { error } = await supabase
        .from('user_passes')
        .insert([
          {
            user_id: currentUser.id,
            pass_type: cart.passType,
            valid_from: startDate,
            valid_until: endDate,
            is_active: true
          }
        ]);

      if (error) throw error;

      const mockResult = {
        success: true,
        receiptNumber: 'SN-' + Math.random().toString(36).substring(2, 9).toUpperCase(),
        cardLast4: cardNumber.slice(-4),
      };

      setPaymentResult(mockResult);
      toast.success('Pass activated!');
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
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Start Date</label>
                    <input
                      type="date"
                      value={startDate}
                      min={todayStr}
                      max={maxStartDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full px-4 py-3.5 rounded-xl border-2 border-gray-200 focus:ring-2 focus:ring-teal-500 outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">End Date</label>
                    <div className="relative">
                      <input
                        type="date"
                        value={endDate}
                        readOnly
                        className="w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-600 cursor-not-allowed"
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <Lock className="w-4 h-4 text-gray-300" />
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
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-teal-600" />
                  Enter Card Details
                </h3>

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
