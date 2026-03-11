import React, { useState, useMemo, useRef } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import {
  ArrowLeft, Shield, Lock, Check, Loader2,
  Zap, Star, Crown, ChevronRight, Calendar, CalendarRange,
  Users, CreditCard, CheckCircle
} from 'lucide-react';

interface PaymentResult {
  receiptNumber: string;
  passType: string;
  amount: number;
  paymentMethod: string;
  expiresAt: string;
  sessionId: string;
  completedAt: string;
}

const PASSES = {
  daily: { price: 15, days: 1, label: 'Family Explorer Pass', icon: Zap, color: 'from-sky-500 to-blue-600', group: '4 people' },
  weekly: { price: 45, days: 6, label: 'Extended Group Adventure Pass', icon: Star, color: 'from-teal-500 to-emerald-600', group: '4 people' },
  monthly: { price: 99, days: 6, label: 'Ultimate Crew Experience Pass', icon: Crown, color: 'from-orange-500 to-amber-600', group: '7 people' },
};

// ═══ FORMATTING HELPERS ═══
const formatCardNumber = (v: string) => v.replace(/\D/g, '').substring(0, 16).match(/.{1,4}/g)?.join(' ') || v;
const formatExpiry = (v: string) => {
  const d = v.replace(/\D/g, '').substring(0, 4);
  return d.length >= 3 ? d.substring(0, 2) + '/' + d.substring(2) : d;
};

const PaymentCheckout: React.FC = () => {
  const { user, setCurrentView, cart, refreshUserPass, vanuatuBonus } = useAppContext();
  
  // UI States
  const [processing, setProcessing] = useState(false);
  const [step, setStep] = useState<'dates' | 'payment' | 'success'>('dates');
  const [paymentError, setPaymentError] = useState<string | null>(null);
  
  // Form States
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCvv] = useState('');
  const [cardName, setCardName] = useState('');
  const [paymentResult, setPaymentResult] = useState<PaymentResult | null>(null);

  // Apply Vanuatu Bonus logic to the selected pass data
  const selectedPass = useMemo(() => {
    if (!cart) return null;
    const base = PASSES[cart.passType as keyof typeof PASSES];
    if (!base) return null;
    
    let updated = { ...base };
    // If the special bonus is active, extend the weekly pass
    if (vanuatuBonus && cart.passType === 'weekly') {
      updated.days = 7;
      updated.group = '6 people';
      updated.label = 'Extended Group Adventure Pass (Bonus)';
    }
    return updated;
  }, [cart, vanuatuBonus]);

  const handlePayWithCard = async () => {
    if (!user || !selectedPass) return;
    
    setProcessing(true);
    setPaymentError(null);
    
    try {
      // 1. Call the Edge Function
      // Note: We send 'days' and 'group_size' explicitly to ensure the bonus is recorded
      const { data: result, error: invokeError } = await supabase.functions.invoke('process-card-payment', {
        body: {
          user_id: user.id,
          passType: cart?.passType,
          amount: selectedPass.price,
          startDate: startDate,
          days: selectedPass.days,
          group_size: selectedPass.group
        },
        headers: {
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
        }
      });

      if (invokeError) throw invokeError;
      if (result?.error) throw new Error(result.error);

      // 2. Map response to success state
      const successData: PaymentResult = {
        receiptNumber: result.receiptNumber || `REC-${Math.random().toString(36).toUpperCase().slice(2, 9)}`,
        passType: cart?.passType || 'weekly',
        amount: selectedPass.price,
        paymentMethod: 'Card',
        expiresAt: new Date(new Date(startDate).getTime() + (selectedPass.days * 86400000)).toISOString(),
        sessionId: result.id || `sess_${Math.random().toString(36).slice(2)}`,
        completedAt: new Date().toISOString()
      };

      setPaymentResult(successData);
      setStep('success');
      toast.success('Payment successful!');
      
      // Update global context so the user can see their new pass immediately
      if (refreshUserPass) await refreshUserPass();
      
    } catch (err: any) {
      console.error('Payment failure:', err);
      setPaymentError(err.message || 'Payment failed. Please check your card details.');
    } finally {
      setProcessing(false);
    }
  };

  if (!user || !cart || !selectedPass) return null;
  const PassIcon = selectedPass.icon;

  return (
    <div className="min-h-screen bg-gray-50 pt-20 pb-16 px-4">
      <div className="max-w-4xl mx-auto">
        <button 
          onClick={() => setCurrentView('passes')} 
          className="flex items-center gap-2 text-gray-500 mb-6 hover:text-teal-600 transition-colors font-medium"
        >
          <ArrowLeft className="w-4 h-4" /> <span>Back to Passes</span>
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Main Checkout Area */}
          <div className="lg:col-span-3 space-y-6">
            {step !== 'success' && (
              <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
                <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-gray-800">
                  {step === 'dates' ? <Calendar className="text-teal-600" /> : <CreditCard className="text-teal-600" />}
                  {step === 'dates' ? 'When will you start?' : 'Payment Details'}
                </h2>

                {step === 'dates' ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Start Date</label>
                      <input 
                        type="date" 
                        value={startDate} 
                        min={new Date().toISOString().split('T')[0]}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full p-4 border-2 rounded-xl focus:border-teal-500 focus:ring-4 focus:ring-teal-50 outline-none transition-all"
                      />
                    </div>
                    <div className="bg-teal-50 border border-teal-100 p-4 rounded-xl">
                      <p className="text-sm text-teal-800 font-medium">
                        Valid until: {new Date(new Date(startDate).getTime() + (selectedPass.days * 86400000)).toLocaleDateString()}
                      </p>
                    </div>
                    <button 
                      onClick={() => setStep('payment')}
                      className="w-full bg-teal-600 text-white font-bold py-4 rounded-xl hover:bg-teal-700 shadow-lg shadow-teal-100 transition-all flex items-center justify-center gap-2"
                    >
                      Continue to Payment <ChevronRight size={18} />
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-4">
                      <input type="text" placeholder="Cardholder Name" value={cardName} onChange={(e) => setCardName(e.target.value)} className="w-full p-4 border rounded-xl bg-gray-50" />
                      <input type="text" placeholder="Card Number" value={cardNumber} onChange={(e) => setCardNumber(formatCardNumber(e.target.value))} className="w-full p-4 border rounded-xl bg-gray-50 font-mono" maxLength={19} />
                      <div className="grid grid-cols-2 gap-4">
                        <input type="text" placeholder="MM/YY" value={cardExpiry} onChange={(e) => setCardExpiry(formatExpiry(e.target.value))} className="w-full p-4 border rounded-xl bg-gray-50" maxLength={5} />
                        <input type="text" placeholder="CVV" value={cardCvv} onChange={(e) => setCvv(e.target.value.replace(/\D/g, ''))} className="w-full p-4 border rounded-xl bg-gray-50" maxLength={4} />
                      </div>
                    </div>

                    {paymentError && (
                      <div className="p-3 bg-red-50 border border-red-100 rounded-lg flex items-start gap-2 text-red-600 text-sm">
                        <span>{paymentError}</span>
                      </div>
                    )}

                    <button 
                      onClick={handlePayWithCard}
                      disabled={processing}
                      className="w-full bg-teal-600 text-white font-bold py-4 rounded-xl hover:bg-teal-700 disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-teal-100 transition-all"
                    >
                      {processing ? <Loader2 className="animate-spin" /> : <Lock size={18} />}
                      Pay A${selectedPass.price}.00 Securely
                    </button>
                    <p className="text-[10px] text-center text-gray-400 flex items-center justify-center gap-1">
                      <Shield size={10} /> Encrypted SSL Secure Payment
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Success View */}
            {step === 'success' && paymentResult && (
              <div className="bg-white rounded-2xl p-10 border-2 border-green-100 text-center shadow-xl animate-in fade-in zoom-in duration-500">
                <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <CheckCircle className="text-green-600 w-12 h-12" />
                </div>
                <h2 className="text-3xl font-extrabold text-gray-900">Payment Successful!</h2>
                <p className="text-gray-500 mt-2">Your pass is now ready to use.</p>
                
                <div className="mt-8 p-6 bg-gray-50 rounded-2xl text-left border border-gray-100 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Transaction Receipt</span>
                    <span className="font-mono font-bold text-gray-800">{paymentResult.receiptNumber}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Active Until</span>
                    <span className="font-bold text-teal-600">{new Date(paymentResult.expiresAt).toLocaleDateString()}</span>
                  </div>
                </div>

                <button 
                  onClick={() => setCurrentView('dashboard')} 
                  className="mt-10 w-full py-4 bg-gray-900 text-white font-bold rounded-xl hover:bg-black transition-all shadow-lg"
                >
                  View My Pass
                </button>
              </div>
            )}
          </div>

          {/* Sidebar: Order Summary */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden sticky top-24 shadow-sm">
              <div className="p-4 bg-gray-50 border-b border-gray-100 font-bold text-gray-700 text-sm uppercase tracking-widest">Order Summary</div>
              <div className="p-6">
                <div className={`bg-gradient-to-br ${selectedPass.color} rounded-2xl p-5 text-white mb-6 shadow-lg`}>
                  <div className="flex items-center gap-2 mb-2 opacity-90">
                    <PassIcon size={18} />
                    <span className="text-xs font-bold uppercase tracking-widest">StikmNek Pass</span>
                  </div>
                  <h3 className="font-extrabold text-xl leading-tight">{selectedPass.label}</h3>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold">
                    <span className="bg-white/20 px-3 py-1.5 rounded-lg flex items-center gap-1.5 backdrop-blur-sm">
                      <Users size={14}/> {selectedPass.group}
                    </span>
                    <span className="bg-white/20 px-3 py-1.5 rounded-lg flex items-center gap-1.5 backdrop-blur-sm">
                      <Calendar size={14}/> {selectedPass.days} Days
                    </span>
                  </div>
                </div>

                <div className="space-y-3 mb-6">
                   <div className="flex justify-between text-sm text-gray-500 italic">
                    <span>{selectedPass.label}</span>
                    <span>A${selectedPass.price}.00</span>
                  </div>
                  <div className="flex justify-between text-sm text-gray-500 italic">
                    <span>Tax (GST)</span>
                    <span>Included</span>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-4 border-t-2 border-dashed border-gray-100">
                  <span className="font-bold text-gray-900 text-lg">Total Amount</span>
                  <span className="font-black text-2xl text-teal-600">A${selectedPass.price}.00</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentCheckout;