import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Loader2, Shield, CheckCircle, XCircle } from 'lucide-react';

/** Stored by PaymentCheckout before redirecting to PayPal approval URL. */
export interface PayPalPendingPayload {
  orderId: string;
  passType: string;
  startDate: string;
  amount?: number;
  currency?: string;
  createdAt: string;
}

/**
 * Ensures the Supabase SDK has a valid, fresh session token.
 * The SDK's functions.invoke() uses the session JWT automatically.
 */
async function ensureFreshSession(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  const expiresAt = session.expires_at;
  const now = Math.floor(Date.now() / 1000);
  const secondsLeft = expiresAt ? expiresAt - now : 0;
  if (secondsLeft < 120) {
    console.log('[PayPalReturn] Session expires in', secondsLeft, 's — refreshing...');
    const { data: { session: refreshed }, error } = await supabase.auth.refreshSession();
    if (error || !refreshed?.access_token) {
      console.error('[PayPalReturn] Session refresh failed:', error?.message);
      return null;
    }
    return refreshed.access_token;
  }
  return session.access_token;
}

function parsePending(raw: string | null): PayPalPendingPayload | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as PayPalPendingPayload;
    if (o && typeof o.orderId === 'string' && typeof o.passType === 'string' && typeof o.startDate === 'string') {
      return o;
    }
  } catch {
    /* ignore */
  }
  return null;
}

const PayPalReturnHandler: React.FC = () => {
  const { setCurrentView, setCart, refreshUserPass } = useAppContext();
  const [status, setStatus] = useState<'idle' | 'capturing' | 'success' | 'error' | 'cancelled'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const processedRef = useRef(false);

  const capturePayment = useCallback(async (paypalOrderId: string) => {
    setStatus('capturing');

    const pendingStr = localStorage.getItem('paypalPending');
    const pendingInfo = parsePending(pendingStr);

    if (pendingInfo?.orderId && pendingInfo.orderId !== paypalOrderId) {
      console.warn(
        '[PayPalReturn] URL token does not match stored orderId — using URL token (PayPal source of truth).',
        { stored: pendingInfo.orderId, url: paypalOrderId },
      );
    }

    let attempts = 0;
    const maxAttempts = 30;

    const waitForAuth = (): Promise<string | null> => {
      return new Promise((resolve) => {
        const check = async () => {
          const token = await ensureFreshSession();
          if (token) {
            resolve(token);
            return;
          }
          attempts++;
          if (attempts >= maxAttempts) {
            resolve(null);
            return;
          }
          setTimeout(check, 500);
        };
        check();
      });
    };

    const accessToken = await waitForAuth();
    if (!accessToken) {
      setStatus('error');
      setErrorMessage('Session expired. Please sign in and try again.');
      toast.error('Session expired. Please sign in again.');
      localStorage.removeItem('paypalPending');
      localStorage.removeItem('pendingPayment');
      return;
    }

    try {
      console.log('[PayPalReturn] Capturing PayPal order:', paypalOrderId);

      const { data, error } = await supabase.functions.invoke('paypal-capture', {
        body: {
          paypalOrderId,
          passType: pendingInfo?.passType,
          startDate: pendingInfo?.startDate,
        },
      });

      if (error) throw error;

      if (data?.success) {
        setStatus('success');
        if (typeof refreshUserPass === 'function') {
          refreshUserPass().catch(() => {});
        }

        const paymentResult = {
          receiptNumber: data.receiptNumber,
          passType: data.passType,
          amount: data.amount,
          paymentMethod: 'paypal',
          expiresAt: data.expiresAt,
          validFrom: data.validFrom,
          validUntil: data.validUntil,
          days: data.days,
          shareBonusApplied: Boolean(data.shareBonusApplied),
          sessionId: data.sessionId,
          completedAt: new Date().toISOString(),
        };
        localStorage.setItem('lastPayment', JSON.stringify(paymentResult));

        localStorage.removeItem('paypalPending');
        localStorage.removeItem('pendingPayment');
        setCart(null);

        toast.success('Payment successful! Your pass is now active.');

        setTimeout(() => {
          setCurrentView('payment-confirmation');
          setStatus('idle');
        }, 1500);
      } else {
        throw new Error(data?.error || 'Payment capture failed');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to complete payment.';
      console.error('PayPal capture error:', err);
      setStatus('error');
      setErrorMessage(message);
      toast.error(message);
      localStorage.removeItem('paypalPending');
      localStorage.removeItem('pendingPayment');
    }
  }, [refreshUserPass, setCart, setCurrentView]);

  useEffect(() => {
    if (processedRef.current) return;

    const urlParams = new URLSearchParams(window.location.search);
    const isPayPalReturn = urlParams.get('paypal_return') === 'true';
    const isPayPalCancel = urlParams.get('paypal_cancel') === 'true';
    const paypalToken = urlParams.get('token');

    if (isPayPalReturn || isPayPalCancel) {
      const cleanUrl = window.location.origin + window.location.pathname;
      window.history.replaceState({}, '', cleanUrl);
    }

    if (isPayPalCancel) {
      processedRef.current = true;
      setStatus('cancelled');
      toast.error('Payment was cancelled');
      localStorage.removeItem('paypalPending');
      localStorage.removeItem('pendingPayment');
      setTimeout(() => {
        setStatus('idle');
        setCart(null);
        setCurrentView('passes');
      }, 2000);
      return;
    }

    if (isPayPalReturn && paypalToken) {
      processedRef.current = true;
      void capturePayment(paypalToken);
    }
  }, [capturePayment, setCart, setCurrentView]);

  if (status === 'idle') return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center">
        {status === 'capturing' && (
          <>
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-[#003087]/10 flex items-center justify-center">
              <Loader2 className="w-10 h-10 text-[#003087] animate-spin" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Completing Your Payment</h2>
            <p className="text-gray-500 mb-4">
              Securely processing your PayPal payment...
            </p>
            <p className="text-sm text-gray-400">
              Please don&apos;t close this window
            </p>
            <div className="mt-6 flex items-center justify-center gap-2 text-xs text-gray-400">
              <Shield className="w-3.5 h-3.5" />
              <span>Secured by PayPal</span>
            </div>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="w-10 h-10 text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Payment Successful!</h2>
            <p className="text-gray-500 mb-4">
              Your pass has been activated. Redirecting to your receipt...
            </p>
            <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
              <div className="bg-green-500 h-full rounded-full animate-pulse" style={{ width: '100%' }} />
            </div>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-red-100 flex items-center justify-center">
              <XCircle className="w-10 h-10 text-red-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Payment Issue</h2>
            <p className="text-gray-500 mb-6">
              {errorMessage || 'There was a problem completing your payment.'}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setStatus('idle');
                  setCurrentView('passes');
                }}
                className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 font-semibold hover:bg-gray-200 transition-colors"
              >
                Back to Passes
              </button>
              <button
                type="button"
                onClick={() => {
                  setStatus('idle');
                  setCurrentView('home');
                }}
                className="flex-1 py-3 rounded-xl bg-teal-600 text-white font-semibold hover:bg-teal-700 transition-colors"
              >
                Go Home
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-4">
              If you were charged, please contact{' '}
              <a href="mailto:stikmnek@gmail.com" className="text-teal-600 hover:underline">stikmnek@gmail.com</a>
            </p>
          </>
        )}

        {status === 'cancelled' && (
          <>
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-orange-100 flex items-center justify-center">
              <XCircle className="w-10 h-10 text-orange-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Payment Cancelled</h2>
            <p className="text-gray-500">
              Your PayPal payment was cancelled. Returning to passes...
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default PayPalReturnHandler;
