import React, { useEffect, useRef, useState } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Loader2, Shield, CheckCircle, XCircle } from 'lucide-react';

const debugLog = (runId: string, hypothesisId: string, location: string, message: string, data: Record<string, unknown>) => {
  // #region agent log
  fetch('http://127.0.0.1:7527/ingest/1d246a66-fce1-41c9-9015-ebb5a8c5e87f', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'ba3431' },
    body: JSON.stringify({ sessionId: 'ba3431', runId, hypothesisId, location, message, data, timestamp: Date.now() }),
  }).catch(() => {});
  // #endregion
};

/**
 * Ensures the Supabase SDK has a valid, fresh session token.
 * We do NOT pass this token as a custom Authorization header.
 * The SDK's functions.invoke() automatically uses its internal session token.
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


const PayPalReturnHandler: React.FC = () => {
  const { user, setCurrentView, setCart, refreshUserPass } = useAppContext();
  const [status, setStatus] = useState<'idle' | 'capturing' | 'success' | 'error' | 'cancelled'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const processedRef = useRef(false);

  useEffect(() => {
    if (processedRef.current) return;

    const urlParams = new URLSearchParams(window.location.search);
    const isPayPalReturn = urlParams.get('paypal_return') === 'true';
    const isPayPalCancel = urlParams.get('paypal_cancel') === 'true';
    const paypalToken = urlParams.get('token'); // PayPal adds this as the order ID

    // Clean URL params immediately
    if (isPayPalReturn || isPayPalCancel) {
      const cleanUrl = window.location.origin + window.location.pathname;
      window.history.replaceState({}, '', cleanUrl);
    }

    if (isPayPalCancel) {
      processedRef.current = true;
      setStatus('cancelled');
      toast.error('Payment was cancelled');
      // Clean up stored data
      localStorage.removeItem('paypalPending');
      localStorage.removeItem('pendingPayment');
      // Show cancelled briefly then go back to passes
      setTimeout(() => {
        setStatus('idle');
        setCart(null);
        setCurrentView('passes');
      }, 2000);
      return;
    }

    if (isPayPalReturn && paypalToken) {
      processedRef.current = true;
      capturePayment(paypalToken);
    }
  }, [user]);

  const capturePayment = async (paypalOrderId: string) => {
    setStatus('capturing');

    // Get stored pending payment info
    const pendingStr = localStorage.getItem('paypalPending');
    let pendingInfo: any = null;
    try {
      if (pendingStr) pendingInfo = JSON.parse(pendingStr);
    } catch {}

    // Wait for user to be authenticated (they were redirected back from PayPal)
    let attempts = 0;
    const maxAttempts = 30; // 15 seconds max wait
    
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
      console.log('[PayPalReturn] Capturing PayPal order:', paypalOrderId, 'Token length:', accessToken.length);

      // FIXED: No custom Authorization header — let the SDK handle it automatically
      const { data, error } = await supabase.functions.invoke('paypal-capture', {
        body: {
          paypalOrderId,
          receiptNumber: pendingInfo?.receiptNumber,
          passType: pendingInfo?.passType,
          startDate: pendingInfo?.startDate,
        },
        // NO custom headers — SDK sends its own Authorization automatically
      });


      if (error) throw error;

      if (data?.success) {
        debugLog('pre-fix', 'H2', 'PayPalReturnHandler.tsx:146', 'paypal-capture returned success payload', {
          passType: data.passType ?? null,
          days: data.days ?? null,
          validFrom: data.validFrom ?? null,
          validUntil: data.validUntil ?? null,
          shareBonusApplied: data.shareBonusApplied ?? null,
          receiptEmail: data.receiptEmail ?? null,
        });
        setStatus('success');
        if (typeof refreshUserPass === 'function') {
          refreshUserPass().catch(() => {});
        }

        // Store payment result for confirmation page
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

        // Clean up
        localStorage.removeItem('paypalPending');
        localStorage.removeItem('pendingPayment');
        setCart(null);

        toast.success('Payment successful! Your pass is now active.');

        // Navigate to confirmation after brief success animation
        setTimeout(() => {
          setCurrentView('payment-confirmation' as any);
          setStatus('idle');
        }, 1500);
      } else {
        throw new Error(data?.error || 'Payment capture failed');
      }
    } catch (err: any) {
      console.error('PayPal capture error:', err);
      setStatus('error');
      setErrorMessage(err.message || 'Failed to complete payment. Please contact support.');
      toast.error(err.message || 'Payment failed. Please try again.');
      localStorage.removeItem('paypalPending');
      localStorage.removeItem('pendingPayment');
    }
  };

  if (status === 'idle') return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center">
        {/* Capturing */}
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
              Please don't close this window
            </p>
            <div className="mt-6 flex items-center justify-center gap-2 text-xs text-gray-400">
              <Shield className="w-3.5 h-3.5" />
              <span>Secured by PayPal</span>
            </div>
          </>
        )}

        {/* Success */}
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

        {/* Error */}
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
                onClick={() => {
                  setStatus('idle');
                  setCurrentView('passes');
                }}
                className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 font-semibold hover:bg-gray-200 transition-colors"
              >
                Back to Passes
              </button>
              <button
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
              If you were charged, please contact <a href="mailto:support@stikm.nek" className="text-teal-600 hover:underline">support@stikm.nek</a>
            </p>
          </>
        )}

        {/* Cancelled */}
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
