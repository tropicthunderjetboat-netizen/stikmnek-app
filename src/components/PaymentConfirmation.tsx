import React, { useState, useEffect, useRef } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { supabase } from '@/lib/supabase';
import {
  CheckCircle, Download, Printer, ArrowRight, Receipt,
  Calendar, CreditCard, Hash, Clock, Shield, Zap, Star, Crown, Copy, Check, Mail, Loader2,
  CalendarRange, Users, Share2, Gift, Baby, Sparkles, PartyPopper
} from 'lucide-react';
import { toast } from 'sonner';
import { getPassDisplayName } from '@/hooks/usePassConfig';

interface PaymentResult {
  receiptNumber: string;
  passType: string;
  passLabel?: string; // Add this
  group?: string;     // Add this
  amount: number;
  currency?: string;  // Add this
  paymentMethod: string;
  expiresAt: string;
  validFrom?: string;
  validUntil?: string;
  days?: number;
  sessionId: string;
  completedAt: string;
  cardLast4?: string;
}
const PASS_LABELS: Record<string, string> = {
  daily: 'Family Explorer Pass',
  weekly: 'Extended Group Adventure Pass',
  monthly: 'Ultimate Crew Experience Pass',
};
const PASS_GROUPS: Record<string, string> = {
  daily: '4 people',
  weekly: '4 people',
  monthly: '7 people',
};
const SHARE_BONUSES = {
  daily: { extraDays: 0, extraPeople: 2, description: 'Share to add 2 extra people for free!' },
  weekly: { extraDays: 1, extraPeople: 2, description: 'Share to add 2 extra people + 1 extra day for free!' },
  monthly: { extraDays: 1, extraPeople: 1, description: 'Share to add 1 extra person + 1 extra day for free!' },
};
// ─── Ensure fresh session helper (replaces getValidAccessToken) ───
async function ensureFreshSession(): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return null;
    const expiresAt = session.expires_at;
    const now = Math.floor(Date.now() / 1000);
    const secondsLeft = expiresAt ? expiresAt - now : 0;
    if (secondsLeft < 120) {
      console.log('[PaymentConfirmation] Session expires in', secondsLeft, 's — refreshing...');
      const { data: { session: refreshed }, error } = await supabase.auth.refreshSession();
      if (error || !refreshed?.access_token) {
        console.warn('[PaymentConfirmation] Session refresh failed:', error?.message);
        return null;
      }
      return refreshed.access_token;
    }
    return session.access_token;
  } catch (err) {
    console.error('[PaymentConfirmation] ensureFreshSession threw:', err);
    return null;
  }
}


// ─── Helper: Extract HTTP status code from FunctionsHttpError ───
function extractStatusCode(error: any): number | null {
  try {
    if (error?.context && typeof error.context.status === 'number') {
      return error.context.status;
    }
    if (typeof error?.status === 'number') {
      return error.status;
    }
  } catch {}
  return null;
}

// ─── Helper: Extract error body from edge function error ───
// Tries multiple approaches since the Response body may already be consumed.
async function extractErrorBody(error: any): Promise<any> {
  try {
    // Approach 1: FunctionsHttpError.context is the Response — try .json()
    if (error?.context && typeof error.context.json === 'function') {
      try {
        return await error.context.json();
      } catch {
        // Body may already be consumed
      }
    }

    // Approach 2: Try .text() and then JSON.parse
    if (error?.context && typeof error.context.text === 'function') {
      try {
        const text = await error.context.text();
        if (text) return JSON.parse(text);
      } catch {
        // Not JSON text
      }
    }

    // Approach 3: Some Supabase versions put the body in error.message
    if (error?.message) {
      try {
        return JSON.parse(error.message);
      } catch {
        // error.message is not JSON
      }
    }

    // Approach 4: Check if error itself has structured data properties
    if (error?.already_claimed !== undefined || error?.error !== undefined) {
      return error;
    }
  } catch {}
  return null;
}

// ─── Helper: Invoke extend-pass with retry logic ───
async function invokeExtendPassWithRetry(
  userId: string,
  shareProof: string,
  platform: string,
  accessToken: string,
  maxRetries = 1
): Promise<{ data: any; error: any; errorBody: any; statusCode: number | null }> {
  let lastError: any = null;
  let lastErrorBody: any = null;
  let lastStatusCode: number | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 4000);
      console.log(`[ShareCTA] Retry ${attempt}/${maxRetries} for extend-pass (waiting ${delay}ms)...`);
      await new Promise(r => setTimeout(r, delay));
    }

    try {
      // FIXED: No custom Authorization header — let the SDK handle it automatically
      const { data, error } = await supabase.functions.invoke('extend-pass', {
        body: {
          user_id: userId,
          share_proof: shareProof,
          platform: platform,
        },
        // NO custom headers — SDK sends its own Authorization automatically
      });


      if (!error) {
        return { data, error: null, errorBody: null, statusCode: 200 };
      }

      const httpStatus = extractStatusCode(error);
      const errorBody = await extractErrorBody(error);
      lastError = error;
      lastErrorBody = errorBody;
      lastStatusCode = httpStatus;

      console.warn(`[ShareCTA] extend-pass attempt ${attempt} failed:`, {
        httpStatus,
        errorName: error.name,
        errorMessage: error.message,
        errorBody,
      });

      // Client errors (4xx) should NOT be retried
      const isClientError = (httpStatus !== null && httpStatus >= 400 && httpStatus < 500) ||
                            errorBody?.already_claimed;

      if (isClientError) {
        return { data: null, error, errorBody, statusCode: httpStatus || (errorBody?.already_claimed ? 409 : 400) };
      }

      // Network errors — retry
      const isNetworkError = error.name === 'FunctionsFetchError' || 
                             error.message?.includes('Failed to send') ||
                             error.message?.includes('NetworkError');

      if ((isNetworkError || (httpStatus !== null && httpStatus >= 500)) && attempt < maxRetries) {
        continue;
      }

      if (attempt >= maxRetries) {
        return { data: null, error, errorBody, statusCode: httpStatus || 500 };
      }
    } catch (thrown: any) {
      lastError = thrown;
      console.warn(`[ShareCTA] extend-pass attempt ${attempt} threw:`, thrown.message);
      if (attempt >= maxRetries) {
        return { data: null, error: thrown, errorBody: null, statusCode: null };
      }
    }
  }

  return { data: null, error: lastError, errorBody: lastErrorBody, statusCode: lastStatusCode };
}

// ─── Share CTA Component ───
const ShareCTA: React.FC<{ passType: string; userId: string }> = ({ passType, userId }) => {
  const [shareState, setShareState] = useState<'idle' | 'sharing' | 'success' | 'already-claimed' | 'error'>(() => {
    try {
      const stored = localStorage.getItem('stikmnek-shared-passes');
      if (stored) {
        const shared = new Set(JSON.parse(stored));
        if (shared.has(`pass-${passType}`)) return 'success';
      }
    } catch {}
    return 'idle';
  });
  const [retrying, setRetrying] = useState(false);

  const bonus = SHARE_BONUSES[passType];
  if (!bonus) return null;

  const hasBonus = bonus.extraDays > 0 || bonus.extraPeople > 0 || bonus.extraKids > 0;
  if (!hasBonus) return null;

  const markSharedLocally = () => {
    try {
      const stored = localStorage.getItem('stikmnek-shared-passes');
      const shared = stored ? new Set(JSON.parse(stored)) : new Set();
      shared.add(`pass-${passType}`);
      localStorage.setItem('stikmnek-shared-passes', JSON.stringify([...shared]));
    } catch {}
  };

  const formatBonusParts = (bd: number, bp: number, bk: number): string => {
    const parts: string[] = [];
    if (bd > 0) parts.push(`+${bd} day${bd > 1 ? 's' : ''}`);
    if (bp > 0) parts.push(`+${bp} people`);
    if (bk > 0) parts.push(`+${bk} kid${bk > 1 ? 's' : ''}`);
    return parts.join(', ');
  };

  const handleExtendPassResult = (
    data: any,
    error: any,
    errorBody: any,
    statusCode: number | null
  ) => {
    if (!error && data?.success) {
      // ═══ SUCCESS ═══
      const bd = data.bonus?.days ?? bonus.extraDays;
      const bp = data.bonus?.people ?? bonus.extraPeople;
      const bk = data.bonus?.kids ?? bonus.extraKids;
      toast.success(`Bonus unlocked: ${formatBonusParts(bd, bp, bk)}! Your pass has been extended.`, { duration: 6000 });
      markSharedLocally();
      setShareState('success');
      return;
    }

    // Check for already-claimed
    if (errorBody?.already_claimed || data?.already_claimed) {
      toast.info('You\'ve already claimed your share bonus for this pass! Thanks for sharing again.', { duration: 5000 });
      markSharedLocally();
      setShareState('already-claimed');
      return;
    }

    // Auth error (401/403)
    if (statusCode === 401 || statusCode === 403 || 
        errorBody?.error?.includes?.('Session expired') || 
        errorBody?.error?.includes?.('Not authenticated')) {
      toast.warning('Shared successfully! Please sign in again to claim your bonus.', { duration: 5000 });
      markSharedLocally();
      setShareState('error');
      return;
    }

    // No active pass (404)
    if (statusCode === 404 || errorBody?.error?.includes?.('No active pass')) {
      toast.warning('Thanks for sharing! Your pass may have expired. Purchase a new pass to earn bonuses.', { duration: 5000 });
      markSharedLocally();
      setShareState('error');
      return;
    }

    // Rate limited (429)
    if (statusCode === 429 || errorBody?.error?.includes?.('Too many requests')) {
      const retryAfter = errorBody?.retryAfter || 60;
      toast.error(`Too many attempts. Please try again in ${retryAfter} seconds.`, { duration: 6000 });
      setShareState('error');
      return;
    }

    // Generic server error
    const errorMsg = errorBody?.error || error?.message || 'Unknown error';
    console.error('[ShareCTA] extend-pass failed:', errorMsg, { error, errorBody, statusCode });
    toast.error('Shared successfully, but couldn\'t apply your bonus. Tap "Retry" to try again.', { duration: 6000 });
    markSharedLocally();
    setShareState('error');
  };

  const handleShare = async () => {
    if (shareState === 'success' || shareState === 'sharing') return;
    
    setShareState('sharing');

    const passLabel = PASS_LABELS[passType] || passType;
    const shareData = {
      title: `StikmNek - ${passLabel}`,
      text: `Check out StikmNek! Get amazing deals in Vanuatu with the ${passLabel}. ${bonus.description}`,
      url: window.location.origin,
    };

    try {
      // Step 1: Share the app
      let shareSucceeded = false;
      let platform = 'clipboard';

      if (navigator.share) {
        try {
          await navigator.share(shareData);
          shareSucceeded = true;
          platform = 'native-share';
        } catch (err: any) {
          if (err.name === 'AbortError') {
            setShareState('idle');
            return;
          }
          // Fallback to clipboard
          try {
            await navigator.clipboard.writeText(`${shareData.text}\n${shareData.url}`);
            shareSucceeded = true;
            platform = 'clipboard';
            toast.success('Link copied to clipboard!');
          } catch {
            toast.error('Could not share. Please try again.');
            setShareState('error');
            return;
          }
        }
      } else {
        try {
          await navigator.clipboard.writeText(`${shareData.text}\n${shareData.url}`);
          shareSucceeded = true;
          platform = 'clipboard';
          toast.success('Link copied! Share it with friends to unlock your bonus.');
        } catch {
          toast.error('Could not copy link. Please try again.');
          setShareState('error');
          return;
        }
      }

      if (!shareSucceeded) {
        setShareState('idle');
        return;
      }

      // Step 2: Call extend-pass with retry to claim the bonus
      const accessToken = await ensureFreshSession();
      if (!accessToken) {
        toast.warning('Shared successfully! Sign in again to claim your bonus days.', { duration: 5000 });

        markSharedLocally();
        setShareState('success');
        return;
      }

      const shareProof = `share_${Date.now()}_${platform}_${passType}_confirmation`;
      const { data, error, errorBody, statusCode } = await invokeExtendPassWithRetry(
        userId,
        shareProof,
        platform,
        accessToken,
        1 // 1 retry
      );

      handleExtendPassResult(data, error, errorBody, statusCode);
    } catch (err: any) {
      console.error('[ShareCTA] Share error:', err);
      if (err.name !== 'AbortError') {
        toast.error('Something went wrong. Please try again.');
        setShareState('error');
      } else {
        setShareState('idle');
      }
    }
  };

  const handleRetry = async () => {
    setRetrying(true);
    try {
      const accessToken = await ensureFreshSession();

      if (!accessToken) {
        toast.warning('Please sign in again to claim your bonus.', { duration: 5000 });
        setRetrying(false);
        return;
      }

      const shareProof = `share_retry_${Date.now()}_${passType}_confirmation`;
      const { data, error, errorBody, statusCode } = await invokeExtendPassWithRetry(
        userId,
        shareProof,
        'retry',
        accessToken,
        1 // 1 retry
      );

      handleExtendPassResult(data, error, errorBody, statusCode);
    } catch (err) {
      console.error('[ShareCTA] Retry error:', err);
      toast.error('Retry failed. Please try again later.');
    } finally {
      setRetrying(false);
    }
  };

  const isCompleted = shareState === 'success' || shareState === 'already-claimed';

  return (
    <div className={`mt-6 rounded-2xl overflow-hidden border transition-all duration-500 ${
      isCompleted
        ? 'bg-gradient-to-br from-emerald-50 via-teal-50 to-green-50 border-emerald-200'
        : 'bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 border-amber-200 shadow-lg shadow-amber-100'
    }`}>
      {/* Header */}
      <div className={`px-6 py-4 ${
        isCompleted
          ? 'bg-gradient-to-r from-emerald-500 to-teal-600'
          : 'bg-gradient-to-r from-amber-500 to-orange-500'
      }`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/20">
            {isCompleted ? (
              <PartyPopper className="w-5 h-5 text-white" />
            ) : (
              <Gift className="w-5 h-5 text-white" />
            )}
          </div>
          <div>
            <h3 className="text-white font-bold text-base">
              {isCompleted ? 'Share Bonus Unlocked!' : 'Unlock Your Share Bonus!'}
            </h3>
            <p className="text-white/80 text-xs">
              {isCompleted
                ? 'Your pass has been extended. Enjoy!'
                : 'Share StikmNek with friends and earn free extras'}
            </p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="px-6 py-5">
        {/* Bonus badges */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {bonus.extraDays > 0 && (
            <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              isCompleted
                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                : 'bg-amber-100 text-amber-800 border border-amber-200'
            }`}>
              <Calendar className="w-3.5 h-3.5" />
              +{bonus.extraDays} free day{bonus.extraDays > 1 ? 's' : ''}
            </div>
          )}
          {bonus.extraPeople > 0 && (
            <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              isCompleted
                ? 'bg-blue-100 text-blue-800 border border-blue-200'
                : 'bg-amber-100 text-amber-800 border border-amber-200'
            }`}>
              <Users className="w-3.5 h-3.5" />
              +{bonus.extraPeople} extra people
            </div>
          )}
          {bonus.extraKids > 0 && (
            <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              isCompleted
                ? 'bg-purple-100 text-purple-800 border border-purple-200'
                : 'bg-amber-100 text-amber-800 border border-amber-200'
            }`}>
              <Baby className="w-3.5 h-3.5" />
              +{bonus.extraKids} extra kid{bonus.extraKids > 1 ? 's' : ''}
            </div>
          )}
        </div>

        <p className={`text-sm mb-4 ${isCompleted ? 'text-emerald-700' : 'text-gray-600'}`}>
          {isCompleted
            ? 'Thanks for sharing! Your bonus has been applied to your pass.'
            : bonus.description}
        </p>

        {/* Share button or success state */}
        {isCompleted ? (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-100/60 border border-emerald-200">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center flex-shrink-0">
              <Check className="w-4 h-4 text-white" strokeWidth={3} />
            </div>
            <div>
              <p className="text-sm font-bold text-emerald-800">Bonus Applied</p>
              <p className="text-xs text-emerald-600">Your pass has been extended with the share bonus</p>
            </div>
            <Sparkles className="w-5 h-5 text-emerald-400 ml-auto flex-shrink-0" />
          </div>
        ) : shareState === 'error' ? (
          <div className="space-y-2">
            <button
              onClick={handleShare}
              disabled={shareState === 'sharing'}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold text-sm hover:from-amber-600 hover:to-orange-600 transition-all shadow-lg shadow-amber-200 disabled:opacity-70"
            >
              <Share2 className="w-4 h-4" />
              Share Again
            </button>
            <button
              onClick={handleRetry}
              disabled={retrying}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white border border-gray-200 text-gray-700 font-semibold text-sm hover:bg-gray-50 transition-colors disabled:opacity-70"
            >
              {retrying ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Retrying bonus claim...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 4 23 10 17 10" />
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                  </svg>
                  Retry Bonus Claim
                </>
              )}
            </button>
          </div>
        ) : (
          <button
            onClick={handleShare}
            disabled={shareState === 'sharing'}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold text-sm hover:from-amber-600 hover:to-orange-600 transition-all shadow-lg shadow-amber-200 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {shareState === 'sharing' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Sharing & Claiming Bonus...
              </>
            ) : (
              <>
                <Share2 className="w-4 h-4" />
                Share Now & Unlock Bonus
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
};


// ─── Main PaymentConfirmation Component ───
const PaymentConfirmation: React.FC = () => {
  const { user, setCurrentView } = useAppContext();
  const [payment, setPayment] = useState<PaymentResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const receiptRef = useRef<HTMLDivElement>(null);
  const emailSentRef = useRef(false);

  useEffect(() => {
    const stored = localStorage.getItem('lastPayment');
    if (stored) {
      try {
        setPayment(JSON.parse(stored));
      } catch {
        setPayment(null);
      }
    }
  }, []);

  // Auto-send confirmation email when payment loads
  useEffect(() => {
    if (payment && user?.email && !emailSentRef.current) {
      emailSentRef.current = true;
      sendConfirmationEmail();
    }
  }, [payment, user]);

const sendConfirmationEmail = async () => {
    if (!payment || !user?.email) return;
    setSendingEmail(true); // This starts the spinner
    
    try {
      const { data, error } = await supabase.functions.invoke('send-email', {
        body: {
          action: 'send_pass_confirmation',
          user_id: user.id,
          user_name: user.name,
          user_email: user.email,
          receipt_number: payment.receiptNumber,
          pass_label: passLabel,
          pass_group: passGroup,
          pass_days: passDays,
          amount: payment.amount,
          currency: 'AUD',
          payment_method: payment.paymentMethod === 'card'
            ? `Credit Card ending ${payment.cardLast4 || '****'}`
            : 'PayPal',
          valid_from: payment.validFrom,
          valid_until: payment.validUntil,
        },
      });

      if (error) throw error; // Stops the hang if server crashes

      if (data?.success) {
        setEmailSent(true);
        toast.success('Confirmation email sent!');
      } else {
        throw new Error(data?.error || 'Failed to send');
      }

    } catch (err: any) {
      console.error("Email failed:", err);
      // This tells you what actually happened
      toast.error(err.message || 'Email failed to send.'); 
    } finally {
      // 🚨 THIS IS THE FIX: This stops the spinner no matter what!
      setSendingEmail(false); 
    }
  };  
if (!payment) {
    return (
      <div className="min-h-screen bg-gray-50 pt-20 pb-16">
        <div className="max-w-lg mx-auto px-4 text-center pt-20">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gray-100 flex items-center justify-center">
            <Receipt className="w-10 h-10 text-gray-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-3">No Payment Found</h2>
          <p className="text-gray-500 mb-6">No recent payment to display.</p>
          <button
            onClick={() => setCurrentView('home')}
            className="px-6 py-3 rounded-xl bg-teal-600 text-white font-semibold hover:bg-teal-700 transition-colors"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

// 1. Define if this is the $99 pass
  const isUltimate = payment?.amount >= 99;

  // 2. Force the correct Label (Ultimate Crew)
  const passLabel = isUltimate 
    ? 'Ultimate Crew Experience Pass' 
    : (payment?.passLabel || (payment?.passType ? PASS_LABELS[payment.passType] : 'Pass'));

  // 3. Force the correct Group (7 people)
  const passGroup = isUltimate 
    ? '7 people' 
    : (payment?.group || (payment?.passType ? PASS_GROUPS[payment.passType] : '4 people'));

  // 4. Force the correct Days (6 days)
  const passDays = isUltimate 
    ? 6 
    : (payment?.days || (payment?.amount >= 45 ? 6 : 1));

  const passIcons: Record<string, React.ReactNode> = {
    daily: <Zap className="w-6 h-6" />,
    weekly: <Star className="w-6 h-6" />,
    monthly: <Crown className="w-6 h-6" />,
  };
  const passColors: Record<string, string> = {
    daily: 'from-sky-500 to-blue-600',
    weekly: 'from-teal-500 to-emerald-600',
    monthly: 'from-orange-500 to-amber-600',
  };

  const expiryDate = new Date(payment.expiresAt);
  const completedDate = new Date(payment.completedAt);
  const validFromDate = payment.validFrom ? new Date(payment.validFrom) : null;
  const validUntilDate = payment.validUntil ? new Date(payment.validUntil) : null;

  const formatDateShort = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const formatDateLong = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' });

  const copyReceipt = () => {
    navigator.clipboard.writeText(payment.receiptNumber);
    setCopied(true);
    toast.success('Receipt number copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  const printReceipt = () => {
    window.print();
  };

  const downloadReceipt = () => {
    const receiptText = `
═══════════════════════════════════════
         STIKMNEK PAYMENT RECEIPT
═══════════════════════════════════════

Receipt #: ${payment.receiptNumber}
Date: ${completedDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
Time: ${completedDate.toLocaleTimeString()}

─────────────────────────────────────
ITEM DETAILS
─────────────────────────────────────
Pass: ${passLabel}
Group: ${passGroup}
Duration: ${passDays} day(s)
─────────────────────────────────────
DISCOUNT VALIDITY PERIOD
─────────────────────────────────────
Valid From: ${validFromDate ? formatDateLong(validFromDate) : 'N/A'}
Valid Until: ${validUntilDate ? formatDateLong(validUntilDate) : formatDateLong(expiryDate)}

─────────────────────────────────────
PAYMENT DETAILS
─────────────────────────────────────
Method: ${payment.paymentMethod === 'card' ? `Credit Card ending ${payment.cardLast4 || '****'}` : 'PayPal'}
Currency: AUD (Australian Dollar)

Amount: A$${payment.amount}.00 AUD
Processing Fee: A$0.00
Tax: A$0.00
Total: A$${payment.amount}.00 AUD

─────────────────────────────────────
CUSTOMER
─────────────────────────────────────
Name: ${user?.name || 'N/A'}
Email: ${user?.email || 'N/A'}

═══════════════════════════════════════
Thank you for choosing StikmNek!
Enjoy your deals in Vanuatu!
═══════════════════════════════════════
    `.trim();

    const blob = new Blob([receiptText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `StikmNek-Receipt-${payment.receiptNumber}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Receipt downloaded!');
  };

  return (
    <div className="min-h-screen bg-gray-50 pt-20 pb-16">
      <div className="max-w-2xl mx-auto px-4 sm:px-6">
        {/* Success Animation */}
        <div className="text-center mb-8">
          <div className="relative inline-block">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center shadow-xl shadow-green-200 animate-bounce">
              <CheckCircle className="w-12 h-12 text-white" />
            </div>
            <div className="absolute -top-1 -right-1 w-8 h-8 rounded-full bg-yellow-400 flex items-center justify-center shadow-lg">
              <span className="text-sm">
                <svg viewBox="0 0 24 24" className="w-4 h-4 text-yellow-800" fill="currentColor">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
              </span>
            </div>
          </div>
          <h1 className="text-3xl font-extrabold text-gray-900 mt-6 mb-2">Payment Successful!</h1>
          <p className="text-gray-500 text-lg">Your {passLabel} is now active</p>
          {passGroup && (
            <div className="inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full bg-teal-50 text-teal-700 text-sm font-semibold">
              <Users className="w-4 h-4" />
              {passGroup}
            </div>
          )}
        </div>

        {/* Receipt Card */}
        <div ref={receiptRef} className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden print:shadow-none">
          {/* Receipt Header */}
          <div className={`bg-gradient-to-r ${passColors[payment.passType] || passColors.weekly} p-6 text-white`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
              {payment?.passType ? passIcons[payment.passType] : <Zap className="w-6 h-6" />}
                </div>
                <div>
                  <p className="text-white/80 text-sm font-medium">StikmNek</p>
                  <h3 className="text-lg font-bold">{passLabel}</h3>
                  {passGroup && (
                    <p className="text-white/70 text-xs mt-0.5 flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {passGroup}
                    </p>
                  )}
                </div>
              </div>
              <div className="text-right">
                <p className="text-3xl font-extrabold">A${payment.amount}</p>
                <p className="text-white/70 text-xs">AUD</p>
              </div>
            </div>
          </div>

          {/* Receipt Body */}
          <div className="p-6 space-y-5">
            {/* Receipt Number */}
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
              <div className="flex items-center gap-3">
                <Hash className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-xs text-gray-400 font-medium">Receipt Number</p>
                  <p className="text-sm font-bold text-gray-900 font-mono">{payment.receiptNumber}</p>
                </div>
              </div>
              <button
                onClick={copyReceipt}
                className="p-2 rounded-lg hover:bg-gray-200 transition-colors"
              >
                {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-gray-400" />}
              </button>
            </div>

            {/* ═══ DISCOUNT VALIDITY DATE RANGE ═══ */}
            <div className="p-4 rounded-xl bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-200">
              <div className="flex items-center gap-2 mb-3">
                <CalendarRange className="w-5 h-5 text-teal-600" />
                <span className="text-sm font-bold text-teal-800">Discount Validity Period</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-white rounded-lg p-3 border border-teal-200 shadow-sm">
                  <p className="text-[10px] text-gray-400 font-semibold uppercase">Valid From</p>
                  <p className="text-sm font-bold text-gray-900 mt-0.5">
                    {validFromDate ? formatDateShort(validFromDate) : formatDateShort(completedDate)}
                  </p>
                </div>
                <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
                  <div className="px-3 py-1 rounded-full bg-teal-600 text-white text-[10px] font-bold shadow-sm">
{passDays} day{passDays > 1 ? 's' : ''}         
        </div>
                  <div className="w-8 h-0.5 bg-teal-300 rounded-full" />
                </div>
                <div className="flex-1 bg-white rounded-lg p-3 border border-orange-200 shadow-sm">
                  <p className="text-[10px] text-gray-400 font-semibold uppercase">Valid Until</p>
                  <p className="text-sm font-bold text-gray-900 mt-0.5">
                    {validUntilDate ? formatDateShort(validUntilDate) : formatDateShort(expiryDate)}
                  </p>
                </div>
              </div>

              {validFromDate && validFromDate <= new Date() && (
                <div className="mt-3 flex items-center gap-1.5 text-xs text-teal-700">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="font-semibold">Your discounts are active now!</span>
                </div>
              )}
              {validFromDate && validFromDate > new Date() && (
                <div className="mt-3 flex items-center gap-1.5 text-xs text-teal-700">
                  <Calendar className="w-3.5 h-3.5" />
                  <span className="font-semibold">Your discounts will activate on {formatDateLong(validFromDate)}</span>
                </div>
              )}
            </div>

            {/* Details Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-gray-50">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <span className="text-xs text-gray-400 font-medium">Purchase Date</span>
                </div>
                <p className="text-sm font-semibold text-gray-900">
                  {completedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
                <p className="text-xs text-gray-400">{completedDate.toLocaleTimeString()}</p>
              </div>

              <div className="p-4 rounded-xl bg-gray-50">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-4 h-4 text-gray-400" />
                  <span className="text-xs text-gray-400 font-medium">Pass Duration</span>
                </div>
                <p className="text-sm font-semibold text-gray-900">
{passDays} day{passDays > 1 ? 's' : ''}                </p>
              </div>

              <div className="p-4 rounded-xl bg-gray-50">
                <div className="flex items-center gap-2 mb-2">
                  <CreditCard className="w-4 h-4 text-gray-400" />
                  <span className="text-xs text-gray-400 font-medium">Payment Method</span>
                </div>
                <p className="text-sm font-semibold text-gray-900">
                  {payment.paymentMethod === 'card'
                    ? `Card ending ${payment.cardLast4 || '****'}`
                    : 'PayPal'}
                </p>
              </div>



              <div className="p-4 rounded-xl bg-gray-50">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="w-4 h-4 text-gray-400" />
                  <span className="text-xs text-gray-400 font-medium">Status</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <p className="text-sm font-semibold text-green-600">Active</p>
                </div>
              </div>
            </div>

            {/* Billing Info */}
            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs text-gray-400 font-medium mb-2">Billed To</p>
              <p className="text-sm font-semibold text-gray-900">{user?.name}</p>
              <p className="text-sm text-gray-500">{user?.email}</p>
            </div>

            {/* Price Breakdown */}
            <div className="border-t border-gray-100 pt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{passLabel}</span>
                <span className="font-medium text-gray-900">A${payment.amount}.00</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Processing fee</span>
                <span className="font-medium text-gray-900">A$0.00</span>
              </div>
              <div className="flex justify-between text-sm border-t border-gray-100 pt-2 mt-2">
                <span className="font-bold text-gray-900">Total Paid</span>
                <span className="font-extrabold text-gray-900">A${payment.amount}.00 AUD</span>
              </div>
            </div>
          </div>

          {/* Receipt Footer with Email Status */}
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
            <div className="flex items-center justify-center gap-2">
              {sendingEmail ? (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-500" />
                  <span>Sending confirmation email...</span>
                </div>
              ) : emailSent ? (
                <div className="flex items-center gap-2 text-xs text-green-600">
                  <Mail className="w-3.5 h-3.5" />
                  <span>Confirmation email sent to {user?.email}</span>
                </div>
              ) : (
                <button
                  onClick={sendConfirmationEmail}
                  className="flex items-center gap-2 text-xs text-teal-600 hover:text-teal-700 font-medium"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>Resend confirmation email to {user?.email}</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ═══ SHARE CTA SECTION ═══ */}
        {user?.id && payment.passType && (
          <ShareCTA passType={payment.passType} userId={user.id} />
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-3 mt-6">
          <button
            onClick={downloadReceipt}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white border border-gray-200 text-gray-700 font-semibold hover:bg-gray-50 transition-colors"
          >
            <Download className="w-4 h-4" />
            Download Receipt
          </button>
          <button
            onClick={printReceipt}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white border border-gray-200 text-gray-700 font-semibold hover:bg-gray-50 transition-colors"
          >
            <Printer className="w-4 h-4" />
            Print Receipt
          </button>
          <button
            onClick={() => setCurrentView('deals')}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-semibold hover:from-teal-700 hover:to-emerald-700 transition-all shadow-lg shadow-teal-200"
          >
            Start Exploring Deals
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* Help Text */}
        <div className="mt-8 text-center">
          <p className="text-xs text-gray-400">
            Need help? Contact us at <a href="mailto:support@stikm.nek" className="text-teal-600 hover:underline">support@stikm.nek</a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default PaymentConfirmation;

