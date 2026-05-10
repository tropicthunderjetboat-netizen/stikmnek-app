import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '@/contexts/AppContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import {
  ArrowLeft, Shield, Lock, Check, Loader2,
  ChevronRight, Calendar, CalendarRange, Info,
  Users, CreditCard, AlertCircle, CheckCircle, Ticket, Zap, Sparkles,
} from 'lucide-react';

import {
  calculatePassPrice,
  passInclusiveCalendarDays,
  validUntilDayOffset,
  addCalendarDaysIso,
  clampPartySize,
  MAX_PARTY_SIZE,
  BASE_PRICE_AUD,
  GUEST_FEE_AUD,
  EXTEND_FEE_AUD,
} from '@/data/pricing';
import { inclusiveCalendarDaysBetween } from '@/lib/passValidity';
import { inferIsExtendedPassFromTripDates } from '@/lib/optimalPassFromRegistration';
import CheckoutPricingSummary from '@/components/CheckoutPricingSummary';
import { t } from '@/data/translations';
import type { Language } from '@/data/translations';

/** Local calendar YYYY-MM-DD */
function dateOnlyLocal(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** UTC calendar YYYY-MM-DD (matches process-card-payment validity checks). */
function dateOnlyUtc(d = new Date()): string {
  return d.toISOString().split('T')[0];
}

/**
 * First day allowed for pass start: later of local "today" and UTC "today" (ISO string compare).
 * Avoids sending a date the Edge function treats as before UTC midnight "today".
 */
function earliestPassStartDateIso(now = new Date()): string {
  const local = dateOnlyLocal(now);
  const utc = dateOnlyUtc(now);
  return local > utc ? local : utc;
}

/** Last start day allowed by Edge: UTC today + 30 days (same as process-card-payment). */
function latestPassStartDateUtc(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 30);
  return d.toISOString().split('T')[0];
}

/**
 * Ensures the Supabase SDK has a valid, fresh access token before Edge invokes.
 * Refreshes when missing or within 120s of expiry. Do not pass a custom Authorization
 * header on `functions.invoke` — supabase-js sets it from the session; a mismatched
 * manual Bearer token can cause Kong "Invalid JWT" before the Edge handler runs.
 */
async function ensureFreshSession(): Promise<string | null> {
  let { data: { session } } = await supabase.auth.getSession();

  if (!session?.access_token) {
    const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
    if (refreshErr || !refreshed?.session?.access_token) {
      console.error('[PaymentCheckout] ensureFreshSession: NO session and refresh failed', refreshErr?.message);
      return null;
    }
    session = refreshed.session;
  }

  const expiresAt = session.expires_at;
  const now = Math.floor(Date.now() / 1000);
  const secondsLeft = expiresAt ? expiresAt - now : 0;

  // If token expires in less than 120 seconds, refresh it
  if (secondsLeft < 120) {
    const { data: { session: refreshed }, error } = await supabase.auth.refreshSession();
    if (error) {
      console.error('[PaymentCheckout] ensureFreshSession: refresh FAILED:', error.message);
      return null;
    }
    if (!refreshed?.access_token) {
      console.error('[PaymentCheckout] ensureFreshSession: refresh returned no token');
      return null;
    }
    return refreshed.access_token;
  }

  return session.access_token;
}

/** Get HTTP status from Supabase Edge Function invoke error. */
function getInvokeStatus(error: any): number | null {
  try {
    if (error?.context && typeof (error.context as Response).status === 'number') return (error.context as Response).status;
    if (typeof error?.status === 'number') return error.status;
  } catch {}
  return null;
}

/** Get response body from Edge Function error (FunctionsHttpError has context = Response). */
async function getInvokeErrorBody(error: any): Promise<Record<string, unknown> | null> {
  try {
    const res = error?.context as Response | undefined;
    if (res && typeof res.json === 'function') {
      const body = await res.json();
      return body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
    }
  } catch {}
  return null;
}

/** `FunctionsFetchError`: fetch threw before HTTP — unwrap TypeError / cause for debugging. */
function describeFunctionsFetchFailure(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const e = error as { name?: string; context?: unknown };
  if (e.name !== 'FunctionsFetchError') return null;
  const ctx = e.context;
  if (ctx != null && typeof ctx === 'object') {
    const c = ctx as { message?: string; cause?: { message?: string } };
    if (typeof c.message === 'string' && c.message.trim()) return c.message.trim();
    if (c.cause && typeof c.cause.message === 'string' && c.cause.message.trim()) {
      return c.cause.message.trim();
    }
  }
  return null;
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
  const navigate = useNavigate();
  const { user, userProfile, setCurrentView, cart, setCart, setShowAuth, setAuthMode, refreshUserPass, language } =
    useAppContext();
  const checkoutLang: Language = language === 'fr' ? 'fr' : language === 'bi' ? 'bi' : 'en';
  const [processing, setProcessing] = useState(false);
  const [step, setStep] = useState<'dates' | 'payment' | 'processing' | 'success'>('dates');
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Date state — min/max aligned with process-card-payment (UTC) + timezone-safe earliest day
  const minStartDate = earliestPassStartDateIso();
  const maxStartDate = latestPassStartDateUtc();
  const normalizeDateOnly = (v: unknown): string | null => {
    if (!v) return null;
    const s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  };

  /**
   * Source of truth for pass startDate:
   * - Prefer the user's selected travel arrival date (user_profiles.expected_arrival_date) when present.
   * - Do NOT silently default to "today" once an arrival date exists.
   */
  const preferredArrivalDate = normalizeDateOnly(userProfile?.expected_arrival_date);
  const initialStartDate =
    preferredArrivalDate != null && preferredArrivalDate >= minStartDate
      ? preferredArrivalDate
      : minStartDate;
  const [startDate, setStartDate] = useState(initialStartDate);
  const startDateTouchedRef = useRef(false);

  // Keep startDate aligned to profile arrival date unless the user manually changes it in this checkout.
  useEffect(() => {
    if (startDateTouchedRef.current) return;
    if (!preferredArrivalDate) return;
    const next =
      preferredArrivalDate >= minStartDate ? preferredArrivalDate : minStartDate;
    if (next !== startDate) {
      setStartDate(next);
    }
  }, [preferredArrivalDate, minStartDate, startDate]);

  // If clock crosses midnight or min moves, keep start in [minStartDate, maxStartDate].
  useEffect(() => {
    if (startDate < minStartDate) {
      setStartDate(minStartDate);
      return;
    }
    if (startDate > maxStartDate) {
      setStartDate(maxStartDate);
    }
  }, [minStartDate, maxStartDate, startDate]);

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
  /** Previous `cart.partySize` for oversize → capped sync (keep warning visible after cap). */
  const prevCartPartySizeRef = useRef<number | null>(null);
  /** One-time merge of demographics + trip length into cart when profile loads (reduces re-typing). */
  const profileCheckoutSyncedRef = useRef(false);

  /**
   * Stable idempotency key for pass purchase retries (same cart pass type).
   * Sent to process-card-payment as paymentTransactionId so duplicate inserts are avoided
   * if the client retries after a network error or double-submit.
   */
  const passPurchaseIdempotencyKeyRef = useRef<string | null>(null);

  useEffect(() => {
    passPurchaseIdempotencyKeyRef.current = null;
  }, [cart?.partySize, cart?.isExtended]);

  function getOrCreatePassPurchaseIdempotencyKey(): string {
    if (!passPurchaseIdempotencyKeyRef.current) {
      passPurchaseIdempotencyKeyRef.current =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `stk-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    }
    return passPurchaseIdempotencyKeyRef.current;
  }

  const [partySize, setPartySize] = useState(() => clampPartySize(cart?.partySize ?? 1));
  const [isExtended, setIsExtended] = useState(() => cart?.isExtended ?? false);
  const [showGroupSizeWarning, setShowGroupSizeWarning] = useState(
    () => cart != null && Number(cart.partySize) > MAX_PARTY_SIZE,
  );
  const [showPartyEditor, setShowPartyEditor] = useState(false);

  const handlePartySizeChange = (value: number) => {
    if (!cart) return;
    if (value > MAX_PARTY_SIZE) {
      setShowGroupSizeWarning(true);
      setPartySize(MAX_PARTY_SIZE);
      setCart({ ...cart, partySize: MAX_PARTY_SIZE, isExtended: cart.isExtended });
    } else {
      setShowGroupSizeWarning(false);
      setPartySize(value);
      setCart({ ...cart, partySize: value, isExtended: cart.isExtended });
    }
  };

  const handleDurationChange = (nextExtended: boolean) => {
    setIsExtended(nextExtended);
    if (cart) setCart({ ...cart, partySize, isExtended: nextExtended });
  };

  useEffect(() => {
    if (!cart || !userProfile || profileCheckoutSyncedRef.current) return;

    let nextParty = cart.partySize;
    let nextExtended = cart.isExtended;

    const adults = userProfile.num_adults ?? 0;
    const children = userProfile.num_children ?? 0;
    const combined = adults + children;
    if (combined > 0) {
      nextParty = clampPartySize(combined);
    } else if (
      userProfile.party_size != null &&
      Number.isFinite(Number(userProfile.party_size)) &&
      Number(userProfile.party_size) >= 1
    ) {
      nextParty = clampPartySize(Number(userProfile.party_size));
    }

    if (userProfile.preferred_pass_duration !== 'short' && inferIsExtendedPassFromTripDates(userProfile)) {
      nextExtended = true;
    }

    if (nextParty === cart.partySize && nextExtended === cart.isExtended) {
      profileCheckoutSyncedRef.current = true;
      return;
    }

    profileCheckoutSyncedRef.current = true;
    setPartySize(nextParty);
    setIsExtended(nextExtended);
    setCart({ ...cart, partySize: nextParty, isExtended: nextExtended });
  }, [cart, userProfile, setCart]);

  useEffect(() => {
    if (!cart) return;
    const raw = Number(cart.partySize);
    const clamped = clampPartySize(Number.isFinite(raw) ? raw : 1);
    const prev = prevCartPartySizeRef.current;
    prevCartPartySizeRef.current = raw;

    setPartySize(clamped);
    setIsExtended(cart.isExtended);

    if (raw > MAX_PARTY_SIZE) {
      setShowGroupSizeWarning(true);
      if (clamped !== raw) {
        setCart({ ...cart, partySize: clamped, isExtended: cart.isExtended });
      }
    } else if (!(prev != null && prev > MAX_PARTY_SIZE && raw <= MAX_PARTY_SIZE)) {
      setShowGroupSizeWarning(false);
    }
  }, [cart?.partySize, cart?.isExtended]);

  const passLabel = 'StikmNek Pass';
  const priceAud = useMemo(() => calculatePassPrice(partySize, isExtended), [partySize, isExtended]);
  const priceShortOption = useMemo(() => calculatePassPrice(partySize, false), [partySize]);
  const priceExtendedOption = useMemo(() => calculatePassPrice(partySize, true), [partySize]);

  const profilePartyCount = useMemo(() => {
    const a = userProfile?.num_adults ?? 0;
    const c = userProfile?.num_children ?? 0;
    const combined = a + c;
    return combined > 0 ? clampPartySize(combined) : 0;
  }, [userProfile?.num_adults, userProfile?.num_children]);

  const grantSecondWeekPreview = Boolean(user?.shareBonusUnlocked) && isExtended;
  const daysCount = passInclusiveCalendarDays(isExtended, grantSecondWeekPreview);
  const extendedCalendarDays = passInclusiveCalendarDays(true, false);
  const groupLabel = useMemo(() => {
    if (checkoutLang === 'fr') {
      return `${partySize} voyageur${partySize > 1 ? 's' : ''} (6 ans et +) · ${BASE_PRICE_AUD} $ + ${GUEST_FEE_AUD} $/invité supp.`;
    }
    if (checkoutLang === 'bi') {
      return `${partySize} man (6+) · A$${BASE_PRICE_AUD} + A$${GUEST_FEE_AUD}/narafala`;
    }
    return `${partySize} guests (ages 6+) · A$${BASE_PRICE_AUD} first + A$${GUEST_FEE_AUD}/extra`;
  }, [partySize, checkoutLang]);

  const tripInclusiveDays = useMemo(() => {
    const a = normalizeDateOnly(userProfile?.expected_arrival_date);
    const d = normalizeDateOnly(userProfile?.expected_departure_date);
    if (!a || !d) return null;
    return inclusiveCalendarDaysBetween(a, d);
  }, [userProfile?.expected_arrival_date, userProfile?.expected_departure_date]);

  const tripNights = tripInclusiveDays != null ? Math.max(0, tripInclusiveDays - 1) : null;

  const coverageUi = useMemo(() => {
    const cal = daysCount;
    const passWindowBadge = t('checkout.period_badge_pass_window', checkoutLang).replace('__CAL__', String(cal));
    const calendarNote = t('checkout.summary_calendar_note', checkoutLang).replace('__CAL__', String(cal));

    if (!isExtended) {
      return {
        periodBadge: t('checkout.period_badge_one_day', checkoutLang),
        periodSub: null as string | null,
        windowTripHint: null as string | null,
        endHelper: t('checkout.end_date_helper_short', checkoutLang),
        orderDealsLine: t('checkout.order_summary_deals_short', checkoutLang),
        summaryPrimary: t('checkout.period_badge_one_day', checkoutLang),
        summarySecondary: calendarNote,
        paymentBarSecondary: calendarNote,
      };
    }
    const legal = t('checkout.period_legal_extended', checkoutLang).replace('__CAL__', String(cal));
    const windowTripHint =
      tripNights != null && tripNights >= 1
        ? t('checkout.window_trip_hint', checkoutLang).replace('__NIGHTS__', String(tripNights))
        : null;

    return {
      periodBadge: passWindowBadge,
      periodSub: legal,
      windowTripHint,
      endHelper: t('checkout.end_date_helper_extended', checkoutLang).replace('__CAL__', String(cal)),
      orderDealsLine: t('checkout.order_summary_deals_extended', checkoutLang).replace('__CAL__', String(cal)),
      summaryPrimary: passWindowBadge,
      summarySecondary: calendarNote,
      paymentBarSecondary: calendarNote,
    };
  }, [isExtended, tripNights, daysCount, checkoutLang, grantSecondWeekPreview]);

  const profilePartySummary =
    userProfile != null
      ? t('checkout.profile_party_line', checkoutLang)
          .replace('__ADULTS__', String(userProfile.num_adults ?? 0))
          .replace('__CHILDREN__', String(userProfile.num_children ?? 0))
          .replace('__INFANTS__', String(userProfile.num_infants ?? 0))
          .replace('__PARTY__', String(partySize))
      : null;

  const endDate = useMemo(() => {
    if (!startDate) return '';
    const g = Boolean(user?.shareBonusUnlocked) && isExtended;
    return addCalendarDaysIso(startDate, validUntilDayOffset(isExtended, g));
  }, [startDate, isExtended, user?.shareBonusUnlocked]);

  const cardType = detectCardType(cardNumber);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const iso = dateStr.slice(0, 10);
    const d = new Date(`${iso}T12:00:00Z`);
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
  };

  if (!user) return null;

  if (!cart) {
    return (
      <div className="min-h-screen bg-gray-50 pt-20 pb-16">
        <div className="max-w-lg mx-auto px-4 text-center pt-20">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gray-100 flex items-center justify-center">
            <CreditCard className="w-10 h-10 text-gray-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-3">No Pass Selected</h2>
          <p className="text-gray-500 mb-6">Please select a pass to purchase first.</p>
          <button
            type="button"
            onClick={() => navigate('/passes?info=1')}
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

  // ═══ PROCESS CARD PAYMENT (direct card on StikmNek — no redirect) ═══
  //
  // 1. ensureFreshSession() refreshes JWT when near expiry (SDK attaches Authorization).
  // 2. Parse non-2xx bodies (401 diagnostics, passType errors, etc.).
  // ═══════════════════════════════════════════════════════════════
  const handlePayWithCard = async () => {
    if (!validateCard()) return;

    setProcessing(true);
    setStep('processing');
    setPaymentError(null);

    try {
      // Step 1: Ensure the SDK has a fresh, valid session token
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

      // Step 2: Get stored referral code if any
      let referralCode: string | null = null;
      try {
        referralCode = localStorage.getItem('stikmnek-referral-code');
      } catch {}

      const minPay = earliestPassStartDateIso();
      const maxPay = latestPassStartDateUtc();
      const payStartDate =
        startDate < minPay ? minPay : startDate > maxPay ? maxPay : startDate;

      const invokeBody = {
        action: 'purchase_pass' as const,
        passType: 'dynamic',
        partySize,
        isExtended,
        startDate: payStartDate,
        cardNumber: cardNumber.replace(/\s/g, ''),
        cardExpiry,
        cardCvv,
        cardName: cardName.trim(),
        referralCode,
        paymentTransactionId: getOrCreatePassPurchaseIdempotencyKey(),
      };

      const { data, error } = await supabase.functions.invoke('process-card-payment', {
        body: invokeBody,
      });

      // Step 4: Handle the response
      // The SDK returns { data, error }. On non-2xx, error is set and data is often null;
      // read the real message from the response body via error.context (Response).
      if (error) {
        console.error('[PaymentCheckout] Edge function error object:', error);
        const status = getInvokeStatus(error);
        const body = await getInvokeErrorBody(error);
        const fromBody = typeof body?.error === 'string' ? body.error : null;
        const serverError =
          fromBody ??
          (typeof data?.error === 'string' ? data.error : null) ??
          (typeof data?.message === 'string' ? data.message : null);

        if (status === 401) {
          console.warn(
            '[PaymentCheckout] process-card-payment 401 — response JSON:',
            JSON.stringify(body ?? null, null, 2),
          );
        }

        if (serverError) {
          throw new Error(serverError);
        }
        const fetchDetail = describeFunctionsFetchFailure(error);
        const errMsg = fetchDetail
          ? `${error.message || 'Payment processing failed'} (${fetchDetail})`
          : error.message || 'Payment processing failed';
        if (errMsg.includes('non-2xx')) {
          if (status === 404) throw new Error('Payment server: "process-card-payment" not found. Deploy the Edge Function in Supabase.');
          if (status === 501) throw new Error('Card payment is temporarily unavailable. Please try again later.');
          if (status === 400) throw new Error(fromBody || 'Invalid request. Please check your details and try again.');
          if (status === 401) {
            throw new Error(
              'Your session could not be verified for payment. Please sign out and sign in again, then retry.',
            );
          }
          throw new Error('Payment server unavailable. Check your connection or try again.');
        }
        throw new Error(errMsg);
      }

      if (!data) {
        throw new Error('No response from payment server');
      }

      if (data.success) {
        // Payment successful!
        setPaymentResult(data);
        setStep('success');

        const paymentResultData = {
          receiptNumber: data.receiptNumber,
          passType: data.passType,
          passLabel: data.passLabel || passLabel,
          amount: data.amount,
          currency: data.currency || 'AUD',
          paymentMethod: data.paymentMethod || 'card',
          expiresAt: data.expiresAt,
          validFrom: data.validFrom,
          validUntil: data.validUntil,
          days: data.days,
          shareBonusApplied: Boolean(data.shareBonusApplied),
          group: data.group || groupLabel,
          partySize,
          isExtended,
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
          setCurrentView('payment-confirmation');
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
      // Keep cart, startDate, and card fields — user can fix and retry without re-picking pass/dates.
      setStep('payment');
      setProcessing(false);
    }
  };


  const Icon = Ticket;
  const passCardGradient = 'from-teal-500 to-emerald-600';
  const currentStepIndex = step === 'dates' ? 0 : step === 'payment' ? 1 : step === 'success' ? 2 : 2;

  return (
    <div className="min-h-screen bg-gray-50 pt-20 pb-16">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Back Button */}
        <button
          type="button"
          onClick={() => navigate('/passes?info=1')}
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
                      <p className="text-teal-700">{t('checkout.how_it_works_compact', checkoutLang)}</p>
                    </div>
                  </div>

                  {profilePartySummary && (
                    <div className="rounded-xl border border-teal-100 bg-white p-4 shadow-sm">
                      <p className="text-xs font-bold uppercase tracking-wide text-teal-700 mb-1.5">
                        {t('checkout.profile_party_title', checkoutLang)}
                      </p>
                      <p className="text-sm text-gray-700 leading-relaxed">{profilePartySummary}</p>
                    </div>
                  )}

                  <div className="pt-1">
                    <h4 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-3">
                      {t('checkout.section_pass_group', checkoutLang)}
                    </h4>
                  <div>
                    {!showPartyEditor && profilePartyCount > 0 ? (
                      <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-teal-100 bg-teal-50/40 px-4 py-3">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wide text-teal-700">
                            {t('checkout.party_summary_label', checkoutLang)}
                          </p>
                          <p className="text-sm font-bold text-gray-900 mt-0.5">
                            {t('checkout.party_summary_line', checkoutLang).replace('__N__', String(partySize))}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowPartyEditor(true)}
                          className="text-sm font-semibold text-teal-700 hover:text-teal-900 px-3 py-1.5 rounded-lg border border-teal-200 bg-white shrink-0"
                        >
                          {t('checkout.party_edit', checkoutLang)}
                        </button>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="block text-sm font-semibold text-gray-700">People (ages 6+)</label>
                          {profilePartyCount > 0 && (
                            <button
                              type="button"
                              onClick={() => setShowPartyEditor(false)}
                              className="text-xs font-semibold text-teal-600 hover:text-teal-800"
                            >
                              {t('checkout.party_done', checkoutLang)}
                            </button>
                          )}
                        </div>
                        <select
                          value={partySize}
                          onChange={(e) => handlePartySizeChange(Number(e.target.value))}
                          className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                        >
                          {[1, 2, 3, 4, 5, 6].map((n) => (
                            <option key={n} value={n}>
                              {n} {n === 1 ? 'person' : 'people'}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  <div>
                    <span className="block text-sm font-semibold text-gray-700 mb-2">{t('checkout.plan_pick_title', checkoutLang)}</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => handleDurationChange(false)}
                        className={`text-left rounded-xl border-2 p-4 transition-all ${
                          !isExtended
                            ? 'border-teal-600 bg-teal-50/80 ring-2 ring-teal-300 shadow-md'
                            : 'border-gray-200 bg-white hover:border-teal-200'
                        }`}
                      >
                        <p className="text-sm font-extrabold text-gray-900">{t('checkout.plan_day_title', checkoutLang)}</p>
                        <p className="text-xs text-muted-foreground mt-1 leading-snug">
                          {t('checkout.plan_day_sub', checkoutLang)}
                        </p>
                        <p className="text-lg font-extrabold text-teal-700 mt-3">
                          A${priceShortOption.toFixed(2)}{' '}
                          <span className="text-xs font-semibold text-gray-500">{t('checkout.option_total', checkoutLang)}</span>
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDurationChange(true)}
                        className={`text-left rounded-xl border-2 p-4 transition-all ${
                          isExtended
                            ? 'border-teal-600 bg-teal-50/80 ring-2 ring-teal-300 shadow-md'
                            : 'border-gray-200 bg-white hover:border-teal-200'
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-extrabold text-gray-900">{t('checkout.plan_holiday_title', checkoutLang)}</p>
                          {tripNights != null && tripNights >= 1 && (
                            <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200">
                              {t('checkout.option_extended_badge', checkoutLang).replace('__NIGHTS__', String(tripNights))}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 leading-snug">
                          {t('checkout.plan_holiday_sub', checkoutLang)}
                        </p>
                        <p className="mt-2 text-[11px] font-bold text-emerald-900 leading-snug bg-emerald-100/90 border border-emerald-200 rounded-lg px-2.5 py-1.5">
                          {t('checkout.share_second_week_unlock', checkoutLang)}
                        </p>
                        <p className="text-lg font-extrabold text-teal-700 mt-3">
                          A${priceExtendedOption.toFixed(2)}{' '}
                          <span className="text-xs font-normal text-gray-500">
                            (+A${EXTEND_FEE_AUD.toFixed(0)} vs day pass)
                          </span>
                        </p>
                      </button>
                    </div>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3.5 mt-4">
                    <div className="flex items-start gap-2.5">
                      <span className="text-lg flex-shrink-0 mt-0.5" role="img" aria-label="Information">
                        ℹ️
                      </span>
                      <p className="text-sm text-blue-900 leading-relaxed">
                        <span className="font-semibold">Children under 6 are FREE!</span>{' '}
                        {`They don't count toward your party size and can accompany your group at no extra cost.`}
                      </p>
                    </div>
                  </div>

                  {showGroupSizeWarning && (
                    <div className="bg-amber-50 border-l-4 border-amber-500 rounded-r-lg p-4 mt-3 mb-4">
                      <div className="flex items-start gap-3">
                        <span className="text-xl flex-shrink-0" aria-hidden="true">
                          ⚠️
                        </span>
                        <div className="flex-1">
                          <p className="font-semibold text-amber-900 text-sm sm:text-base">
                            Group Size Limit Reached
                          </p>
                          <p className="text-sm text-amber-800 mt-1">
                            Maximum {MAX_PARTY_SIZE} people per voucher. For groups larger than {MAX_PARTY_SIZE}, please purchase a second voucher after completing this one.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  <CheckoutPricingSummary
                    partySize={partySize}
                    isExtended={isExtended}
                    language={checkoutLang}
                  />
                  </div>

                  <div className="mt-6 pt-2">
                    <div className="rounded-2xl border-2 border-teal-300/80 bg-gradient-to-br from-teal-50/95 via-white to-emerald-50/90 p-5 sm:p-6 shadow-[0_20px_50px_-20px_rgba(13,148,136,0.45)] ring-1 ring-teal-200/60">
                      <div className="flex flex-col sm:flex-row sm:items-start gap-4 mb-6 pb-5 border-b border-teal-200/60">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-600 to-emerald-600 text-white shadow-lg shadow-teal-700/25">
                          <CalendarRange className="w-6 h-6" aria-hidden />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-base sm:text-lg font-black uppercase tracking-wide text-teal-950">
                            {t('checkout.section_dates', checkoutLang)}
                          </h4>
                          <p className="text-sm text-teal-900/90 mt-1.5 leading-snug font-medium">
                            {t('checkout.section_dates_sub', checkoutLang)}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-5">
                        {/* Start Date Picker */}
                        <div className="rounded-xl bg-white/95 border border-teal-200/90 p-4 shadow-sm">
                          <label className="block text-sm font-semibold text-gray-800 mb-2 flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-teal-600 shrink-0" />
                            Discounts Valid From (Start Date)
                          </label>
                          <input
                            type="date"
                            value={startDate}
                            min={minStartDate}
                            max={maxStartDate}
                            onChange={(e) => {
                              startDateTouchedRef.current = true;
                              setStartDate(e.target.value);
                            }}
                            className="w-full px-4 py-3.5 rounded-xl border-2 border-teal-100 bg-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all cursor-pointer hover:border-teal-300"
                          />
                          <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                            You can start your pass up to 30 days from today (UTC calendar, same as checkout validation)
                          </p>
                        </div>

                        {/* End Date (Auto-calculated) */}
                        <div className="rounded-xl bg-white/95 border border-orange-200/80 p-4 shadow-sm">
                          <label className="block text-sm font-semibold text-gray-800 mb-2 flex items-center gap-2 flex-wrap">
                            <Calendar className="w-4 h-4 text-orange-500 shrink-0" />
                            Discounts Valid Until (End Date)
                            <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-orange-50 text-orange-800 font-bold border border-orange-200/80">
                              Auto-calculated
                            </span>
                          </label>
                          <div className="relative">
                            <input
                              type="date"
                              value={endDate}
                              readOnly
                              className="w-full px-4 py-3.5 rounded-xl border-2 border-orange-100/90 bg-orange-50/40 text-sm font-medium text-gray-700 cursor-not-allowed"
                            />
                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                              <Lock className="w-4 h-4 text-orange-300" />
                            </div>
                          </div>
                          <p className="text-xs text-gray-600 mt-2 leading-relaxed">{coverageUi.endHelper}</p>
                        </div>
                      </div>

                      {/* Date range preview — focal card */}
                      <div className="mt-6 rounded-2xl bg-gradient-to-b from-emerald-100/80 via-teal-50/90 to-white p-4 sm:p-5 border-2 border-emerald-400/55 shadow-inner shadow-emerald-900/10">
                        <p className="text-[11px] font-black text-teal-950 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-amber-500 shrink-0" aria-hidden />
                          {t('checkout.discount_window_card_title', checkoutLang)}
                        </p>
                        <div className="flex flex-col sm:flex-row sm:items-stretch gap-4">
                          <div className="flex-1 bg-white rounded-xl p-3.5 border-2 border-teal-300/50 shadow-md">
                            <p className="text-[10px] text-teal-700 font-bold uppercase tracking-wider">
                              {t('checkout.window_label_start', checkoutLang)}
                            </p>
                            <p className="text-sm font-bold text-gray-900 mt-1">{formatDate(startDate)}</p>
                          </div>
                          <div className="flex sm:flex-col items-center justify-center gap-2 flex-shrink-0 px-1">
                            <div className="px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white text-xs font-black shadow-md text-center leading-snug max-w-[12.5rem] ring-1 ring-white/30">
                              {coverageUi.periodBadge}
                            </div>
                            {coverageUi.windowTripHint && (
                              <p className="text-[10px] text-slate-600 text-center leading-snug max-w-[13rem] font-medium">
                                {coverageUi.windowTripHint}
                              </p>
                            )}
                            {coverageUi.periodSub && (
                              <p className="text-[10px] text-teal-900/85 text-center leading-snug max-w-[13rem] mt-0.5 hidden sm:block font-medium">
                                {coverageUi.periodSub}
                              </p>
                            )}
                          </div>
                          <div className="flex-1 bg-white rounded-xl p-3.5 border-2 border-orange-300/50 shadow-md">
                            <p className="text-[10px] text-orange-800 font-bold uppercase tracking-wider">
                              {t('checkout.window_label_end', checkoutLang)}
                            </p>
                            <p className="text-sm font-bold text-gray-900 mt-1">{formatDate(endDate)}</p>
                          </div>
                        </div>
                        {coverageUi.periodSub && (
                          <p className="text-[10px] text-teal-900/85 text-center leading-snug mt-3 sm:hidden font-medium px-1">
                            {coverageUi.periodSub}
                          </p>
                        )}

                        {startDate === minStartDate && (
                          <p className="text-xs text-teal-800 mt-4 flex items-center gap-2 rounded-lg bg-white/70 border border-teal-200/60 px-3 py-2.5 font-semibold">
                            <Zap className="w-3.5 h-3.5 flex-shrink-0 text-amber-500" />
                            Starting on the earliest available day — discounts activate right after purchase.
                          </p>
                        )}
                        {startDate > minStartDate && (
                          <p className="text-xs text-teal-800 mt-4 flex items-center gap-2 rounded-lg bg-white/70 border border-teal-200/60 px-3 py-2.5 font-semibold">
                            <Calendar className="w-3.5 h-3.5 flex-shrink-0 text-teal-600" />
                            Your discounts will activate on {formatDate(startDate)}.
                          </p>
                        )}
                      </div>
                    </div>
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
                <div className="flex gap-3 p-3 rounded-xl bg-teal-50 border border-teal-100 text-sm">
                  <CalendarRange className="w-4 h-4 text-teal-600 flex-shrink-0 mt-0.5" />
                  <div className="text-teal-800 min-w-0">
                    <p>
                      <strong>{formatDate(startDate)}</strong>
                      <span className="mx-2 text-teal-400">to</span>
                      <strong>{formatDate(endDate)}</strong>
                    </p>
                    <p className="text-xs text-teal-700 mt-1 leading-snug">
                      <span className="font-semibold">{coverageUi.periodBadge}</span>
                      {coverageUi.paymentBarSecondary ? (
                        <span className="text-teal-600"> · {coverageUi.paymentBarSecondary}</span>
                      ) : null}
                    </p>
                  </div>
                </div>

                <CheckoutPricingSummary
                  partySize={partySize}
                  isExtended={isExtended}
                  language={checkoutLang}
                  showSavingsCallout={false}
                />

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
                        <p className="text-xs text-gray-500">Pay securely on StikmNek — no redirect</p>
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

                {partySize >= 1 && (
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-blue-600 p-4 rounded-r-lg mb-6 shadow-sm">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl shrink-0" aria-hidden>
                        💰
                      </span>
                      <div>
                        <p className="text-base sm:text-lg font-semibold text-gray-900 leading-snug">
                          {t('checkout.savings_anchor_v2', checkoutLang)
                            .replace('__COUNT__', String(partySize))
                            .replace('__PASS__', priceAud.toFixed(0))}
                        </p>
                        <p className="text-sm text-gray-700 mt-1">{t('checkout.savings_subline', checkoutLang)}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Pay with Card Button */}
                <button
                  type="button"
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
                      Pay A${priceAud.toFixed(2)} with Card
                    </>
                  )}
                </button>

                <p className="text-xs text-center text-gray-400">
                  Card is processed securely. You stay on StikmNek — no redirect.
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
                  Your {passLabel} is now active. Redirecting to your receipt...
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
                <div className={`relative bg-gradient-to-br ${passCardGradient} rounded-xl p-5 text-white mb-5 overflow-hidden`}>
                  <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-6 translate-x-6" />
                  <div className="relative">
                    <div className="flex items-center gap-2 mb-3">
                      <Icon className="w-5 h-5" />
                      <span className="text-sm font-medium text-white/80">StikmNek</span>
                    </div>
                    <h4 className="text-lg font-bold">{passLabel}</h4>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/20 text-white text-xs font-semibold">
                        <Users className="w-3 h-3" />
                        {groupLabel}
                      </span>
                    </div>
                    <p className="text-sm text-white/80 mt-2 leading-snug">
                      {coverageUi.orderDealsLine}
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
                      <span className="font-bold text-gray-900">{formatDate(startDate)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">Valid Until</span>
                      <span className="font-bold text-gray-900">{endDate ? formatDate(endDate) : '—'}</span>
                    </div>
                    <div className="pt-1 border-t border-teal-100 space-y-0.5">
                      <div className="flex items-center justify-between text-xs gap-2">
                        <span className="text-gray-500 shrink-0">{t('checkout.summary_duration_label', checkoutLang)}</span>
                        <span className="font-bold text-teal-700 text-right leading-snug">{coverageUi.summaryPrimary}</span>
                      </div>
                      {coverageUi.summarySecondary && (
                        <p className="text-[10px] text-gray-500 text-right leading-snug">{coverageUi.summarySecondary}</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mb-5">
                  <CheckoutPricingSummary
                    partySize={partySize}
                    isExtended={isExtended}
                    language={checkoutLang}
                    variant="sidebar"
                    showSavingsCallout={step !== 'payment'}
                  />
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
