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
import { loadTripState, tripLengthToIsExtended } from '@/lib/tripStorage';
import CheckoutPricingSummary from '@/components/CheckoutPricingSummary';
import { loadPayPalButtonsSdk, renderPayPalCheckoutButtons, type PayPalSdkNamespace } from '@/lib/paypalSdk';
import { t } from '@/data/translations';
import type { Language } from '@/data/translations';
import {
  FIRST25_CAMPAIGN_CODE,
  fetchPromoCampaignStatus,
  type PromoCampaignStatus,
} from '@/lib/promoCampaign';
import { analytics } from '@/lib/analytics';

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

/** True when the browser never got an HTTP response (network, CORS, blocked request, wrong URL). */
function isPaymentInvokeTransportFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { name?: string; message?: string };
  if (e.name === 'FunctionsFetchError') return true;
  const m = `${e.message ?? ''}`.toLowerCase();
  return (
    m.includes('failed to fetch') ||
    m.includes('networkerror') ||
    m.includes('network request failed') ||
    m.includes('load failed')
  );
}

/** Shown when `functions.invoke` never completes (DNS, TLS, ad blocker, wrong Supabase URL, etc.). */
const PAYMENT_TRANSPORT_FAILURE_HINT =
  'We could not reach the payment service (the request never completed). This is usually not your card being declined. Try: refresh and pay again, switch networks, disable ad blockers or strict privacy extensions for this site, or use a private window. If it keeps happening, confirm the app is built with the correct Supabase project URL and that the payment Edge Functions you use are deployed (PayPal checkout: **create-checkout** and **paypal-capture**; legacy card form: **process-card-payment**) — see Supabase Dashboard → Edge Functions → Logs.';

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
  const { user, userProfile, setCurrentView, cart, setCart, setShowAuth, setAuthMode, refreshUserPass, refreshUserProfile, language } =
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

  const paypalClientId = String(import.meta.env.VITE_PAYPAL_CLIENT_ID ?? '').trim();
  /** Smart Buttons checkout when public client id is configured (Expanded Card Fields not required). */
  const paypalSmartEnabled = paypalClientId.length > 0;

  const paypalCardButtonRef = useRef<HTMLDivElement>(null);
  const paypalWalletButtonRef = useRef<HTMLDivElement>(null);
  const [paypalButtonsSdkError, setPaypalButtonsSdkError] = useState<string | null>(null);
  const [paypalButtonsReady, setPaypalButtonsReady] = useState(false);

  const [promoStatus, setPromoStatus] = useState<PromoCampaignStatus | null>(null);
  const [promoMissedMessage, setPromoMissedMessage] = useState<string | null>(null);
  const [claimingPromo, setClaimingPromo] = useState(false);
  const promoAvailable = Boolean(promoStatus?.available) && !promoMissedMessage;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const status = await fetchPromoCampaignStatus(FIRST25_CAMPAIGN_CODE);
      if (!cancelled) setPromoStatus(status);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Previous `cart.partySize` for oversize → capped sync (keep warning visible after cap). */
  const prevCartPartySizeRef = useRef<number | null>(null);
  /** One-time merge of demographics + trip length into cart when profile loads (reduces re-typing). */
  const profileCheckoutSyncedRef = useRef(false);
  /** After the user edits party size or pass duration, do not overwrite from profile sync. */
  const checkoutTouchedRef = useRef(false);

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

  // Traveller details deferred from hub browsing — collected here at checkout.
  const [travellerName, setTravellerName] = useState('');
  const [travellerWhatsapp, setTravellerWhatsapp] = useState('');
  const [travellerResort, setTravellerResort] = useState('');
  const [travellerErrors, setTravellerErrors] = useState<{ name?: string; whatsapp?: string; resort?: string }>({});
  const [savingTraveller, setSavingTraveller] = useState(false);

  useEffect(() => {
    const name =
      (userProfile?.full_name || userProfile?.name || userProfile?.display_name || user?.name || '').trim();
    const wa = (userProfile?.whatsapp_number || userProfile?.phone || '').trim();
    const resort = (userProfile?.resort_name || '').trim();
    setTravellerName((prev) => prev || name);
    setTravellerWhatsapp((prev) => prev || wa);
    setTravellerResort((prev) => prev || resort);
  }, [userProfile, user?.name]);

  const showTravellerDetails = user?.type === 'tourist';

  const saveTravellerDetailsIfNeeded = async (): Promise<boolean> => {
    if (user?.type !== 'tourist' || !user?.id) return true;

    const nameTrim = travellerName.trim();
    const waTrim = travellerWhatsapp.trim();
    const resortTrim = travellerResort.trim();
    const errs: { name?: string; whatsapp?: string; resort?: string } = {};
    if (!nameTrim) errs.name = 'Enter your name';
    if (!waTrim) errs.whatsapp = 'Enter a WhatsApp number';
    if (!resortTrim) errs.resort = 'Enter your resort or accommodation';
    if (Object.keys(errs).length) {
      setTravellerErrors(errs);
      toast.error('Add your name, WhatsApp, and resort to continue');
      return false;
    }
    setTravellerErrors({});

    const alreadySaved =
      (userProfile?.full_name || userProfile?.name || userProfile?.display_name || '').trim() === nameTrim &&
      (userProfile?.whatsapp_number || '').trim() === waTrim &&
      (userProfile?.resort_name || '').trim() === resortTrim;
    if (alreadySaved) return true;

    setSavingTraveller(true);
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({
          name: nameTrim,
          full_name: nameTrim,
          display_name: nameTrim,
          whatsapp_number: waTrim,
          preferred_contact_method: 'whatsapp',
          resort_name: resortTrim,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);
      if (error) throw error;
      await refreshUserProfile();
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not save your details';
      toast.error(msg);
      return false;
    } finally {
      setSavingTraveller(false);
    }
  };

  const paySessionRef = useRef({
    startDate,
    partySize,
    cartPartySize: cart?.partySize,
    isExtended,
    priceAud: 0,
  });

  /** Keep PayPal createOrder in sync immediately — useEffect alone can lag one frame behind UI. */
  const syncPaySessionRef = (
    patch: Partial<{
      startDate: string;
      partySize: number;
      cartPartySize: number | undefined;
      isExtended: boolean;
      priceAud: number;
    }>,
  ) => {
    paySessionRef.current = { ...paySessionRef.current, ...patch };
  };

  const handlePartySizeChange = (value: number) => {
    if (!cart) return;
    checkoutTouchedRef.current = true;
    if (value > MAX_PARTY_SIZE) {
      setShowGroupSizeWarning(true);
      setPartySize(MAX_PARTY_SIZE);
      setCart({ ...cart, partySize: MAX_PARTY_SIZE, isExtended: cart.isExtended });
      syncPaySessionRef({ partySize: MAX_PARTY_SIZE, cartPartySize: MAX_PARTY_SIZE });
    } else {
      setShowGroupSizeWarning(false);
      setPartySize(value);
      setCart({ ...cart, partySize: value, isExtended: cart.isExtended });
      syncPaySessionRef({ partySize: value, cartPartySize: value });
    }
  };

  const handleDurationChange = (nextExtended: boolean) => {
    checkoutTouchedRef.current = true;
    setIsExtended(nextExtended);
    syncPaySessionRef({ isExtended: nextExtended });
    if (cart) setCart({ ...cart, partySize, isExtended: nextExtended });
  };

  useEffect(() => {
    if (!cart || profileCheckoutSyncedRef.current || checkoutTouchedRef.current) return;

    let nextParty = cart.partySize;
    let nextExtended = cart.isExtended;

    const trip = loadTripState();
    // Prefer in-feed tip-card selections over profile demographics.
    if (trip.vibePartyDone) {
      nextParty = clampPartySize(trip.paidPeople || 1);
    } else if (userProfile) {
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
    }

    if (trip.vibeTripLengthDone && trip.tripLength) {
      nextExtended = tripLengthToIsExtended(trip.tripLength);
    } else if (
      userProfile &&
      userProfile.preferred_pass_duration !== 'short' &&
      inferIsExtendedPassFromTripDates(userProfile)
    ) {
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
    syncPaySessionRef({
      partySize: nextParty,
      cartPartySize: nextParty,
      isExtended: nextExtended,
    });
  }, [cart, userProfile, setCart]);

  useEffect(() => {
    if (!cart) return;
    if (checkoutTouchedRef.current) return;
    const raw = Number(cart.partySize);
    const clamped = clampPartySize(Number.isFinite(raw) ? raw : 1);
    const prev = prevCartPartySizeRef.current;
    prevCartPartySizeRef.current = raw;

    setPartySize(clamped);
    setIsExtended(cart.isExtended);
    syncPaySessionRef({
      partySize: clamped,
      cartPartySize: cart.partySize,
      isExtended: cart.isExtended,
    });

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

  /** Sync payment ref during render so PayPal createOrder never reads stale pre-effect values. */
  paySessionRef.current = {
    startDate,
    partySize,
    cartPartySize: cart?.partySize,
    isExtended,
    priceAud,
  };

  const paypalMountKey = `${partySize}-${isExtended ? '7d' : '1d'}-${startDate}-${priceAud.toFixed(2)}`;

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
      <div className="min-h-[100dvh] bg-neutral-950 text-white flex flex-col items-center justify-center px-6 text-center">
        <p className="text-lg font-bold mb-2">No pass selected</p>
        <p className="text-sm text-neutral-400 mb-6">Go back and choose a pass to continue.</p>
        <button
          type="button"
          onClick={() => {
            setCurrentView('home');
            navigate('/');
          }}
          className="min-h-11 px-6 rounded-xl bg-teal-600 font-semibold"
        >
          Back to exploring
        </button>
      </div>
    );
  }

  function resolvePayContextFromRef() {
    const { startDate: sd, partySize: ps, cartPartySize, isExtended: ext, priceAud: uiPriceAud } =
      paySessionRef.current;
    const minPay = earliestPassStartDateIso();
    const maxPay = latestPassStartDateUtc();
    const payStartDate = sd < minPay ? minPay : sd > maxPay ? maxPay : sd;
    const fromState = Number(ps);
    const fromCart = cartPartySize != null ? Number(cartPartySize) : NaN;
    const rawPartyCount = Number.isFinite(fromState) ? fromState : Number.isFinite(fromCart) ? fromCart : 1;
    const partyForPay = clampPartySize(Math.floor(rawPartyCount) || 1);
    const extended = Boolean(ext);
    const expectedAud = calculatePassPrice(partyForPay, extended);
    return { payStartDate, partyForPay, isExtended: extended, expectedAud, uiPriceAud };
  }

  async function handleClaimPromoFree() {
    if (!user?.email) {
      toast.error('Sign in with an email account to claim a free pass.');
      setShowAuth(true);
      setAuthMode('signin');
      return;
    }

    setClaimingPromo(true);
    setPaymentError(null);
    setStep('processing');

    try {
      const token = await ensureFreshSession();
      if (!token) throw new Error('SESSION_EXPIRED');

      const { payStartDate, partyForPay, isExtended: ext, expectedAud } = resolvePayContextFromRef();

      const { data, error } = await supabase.functions.invoke('claim-promo-pass', {
        body: {
          campaignCode: FIRST25_CAMPAIGN_CODE,
          startDate: payStartDate,
          partySize: partyForPay,
          party_size: partyForPay,
          isExtended: ext,
          is_extended: ext,
        },
      });

      if (error) {
        const body = await getInvokeErrorBody(error);
        const fromBody = typeof body?.error === 'string' ? body.error : null;
        const reason = typeof body?.reason === 'string' ? body.reason : null;
        if (reason === 'already_claimed' || body?.fallbackToPaid) {
          setPromoMissedMessage(
            fromBody ||
              'Ah, just missed it — the free passes are gone, but here is your pass at full price.',
          );
          setPromoStatus((prev) => (prev ? { ...prev, available: false, remaining: 0 } : prev));
          setStep('payment');
          toast.info(fromBody || 'Free passes are gone — continue with paid checkout.');
          return;
        }
        throw new Error(fromBody || error.message || 'Could not claim free pass');
      }

      const ok = data as Record<string, unknown> | null;
      if (!ok?.success) {
        if (ok?.fallbackToPaid) {
          const msg =
            typeof ok.message === 'string'
              ? ok.message
              : 'Ah, just missed it — the free passes are gone, but here is your pass at full price.';
          setPromoMissedMessage(msg);
          setPromoStatus((prev) =>
            prev
              ? {
                  ...prev,
                  available: false,
                  remaining: 0,
                  claims_count: Number(ok.claims_count) || prev.claims_count,
                }
              : prev,
          );
          setStep('payment');
          toast.info(msg);
          return;
        }
        throw new Error(typeof ok?.error === 'string' ? String(ok.error) : 'Could not claim free pass');
      }

      setPaymentResult(data);
      setStep('success');

      const paymentResultData = {
        receiptNumber: ok.receiptNumber,
        passType: ok.passType,
        passLabel: ok.passLabel || passLabel,
        amount: 0,
        originalPrice: ok.originalPrice ?? expectedAud,
        currency: ok.currency || 'AUD',
        paymentMethod: 'promo',
        isPromoFree: true,
        expiresAt: ok.expiresAt,
        validFrom: ok.validFrom,
        validUntil: ok.validUntil,
        days: ok.days,
        shareBonusApplied: Boolean(ok.shareBonusApplied),
        group: ok.group || `Up to ${partyForPay} people (ages 6+)`,
        partySize: partyForPay,
        isExtended: ext,
        sessionId: ok.sessionId,
        completedAt: new Date().toISOString(),
        campaignCode: FIRST25_CAMPAIGN_CODE,
      };
      localStorage.setItem('lastPayment', JSON.stringify(paymentResultData));
      localStorage.removeItem('paypalPending');
      localStorage.removeItem('pendingPayment');

      try {
        analytics.promoPassClaimed(FIRST25_CAMPAIGN_CODE, expectedAud);
      } catch {
        /* ignore */
      }

      toast.success("You're in! Your free StikmNek Pass is ready.");
      setTimeout(() => {
        void refreshUserPass();
      }, 1000);
      setTimeout(() => {
        setCart(null);
        setCurrentView('payment-confirmation');
      }, 2500);
    } catch (err: unknown) {
      let msg = err instanceof Error ? err.message : 'Could not claim free pass';
      if (msg === 'SESSION_EXPIRED') {
        toast.error('Your session has expired. Please sign in again.');
        setShowAuth(true);
        setAuthMode('signin');
      } else {
        toast.error(msg);
      }
      setPaymentError(msg);
      setStep('payment');
    } finally {
      setClaimingPromo(false);
    }
  }

  useEffect(() => {
    if (!paypalSmartEnabled || step !== 'payment' || promoAvailable) {
      setPaypalButtonsSdkError(null);
      setPaypalButtonsReady(false);
      if (paypalCardButtonRef.current) paypalCardButtonRef.current.innerHTML = '';
      if (paypalWalletButtonRef.current) paypalWalletButtonRef.current.innerHTML = '';
      return;
    }

    let cancelled = false;
    let buttonsInstance: { close?: () => void } | null = null;

    (async () => {
      setPaypalButtonsSdkError(null);
      setPaypalButtonsReady(false);
      if (paypalCardButtonRef.current) paypalCardButtonRef.current.innerHTML = '';
      if (paypalWalletButtonRef.current) paypalWalletButtonRef.current.innerHTML = '';

      try {
        await loadPayPalButtonsSdk(paypalClientId);
        if (cancelled) return;

        type ButtonsInstance = {
          isEligible: () => boolean;
          render: (selector: HTMLElement | string) => Promise<void>;
        };

        const paypal = (window as unknown as { paypal?: PayPalSdkNamespace }).paypal;
        if (!paypal?.Buttons) {
          throw new Error('PayPal SDK did not expose Buttons');
        }

        const origin = window.location.origin;
        const returnUrl = `${origin}/passes`;
        const cancelUrl = `${origin}/passes`;

        const capturedPricing = {
          partySize,
          isExtended,
          startDate,
          priceAud,
        };

        const buttonConfig: Record<string, unknown> = {
          createOrder: async () => {
            const token = await ensureFreshSession();
            if (!token) throw new Error('SESSION_EXPIRED');

            const ctx = resolvePayContextFromRef();
            const partyForPay = clampPartySize(capturedPricing.partySize);
            const ext = capturedPricing.isExtended;
            const payStartDate =
              capturedPricing.startDate < earliestPassStartDateIso()
                ? earliestPassStartDateIso()
                : capturedPricing.startDate > latestPassStartDateUtc()
                  ? latestPassStartDateUtc()
                  : capturedPricing.startDate;
            const expectedAud = calculatePassPrice(partyForPay, ext);

            if (
              partyForPay !== ctx.partyForPay ||
              ext !== ctx.isExtended ||
              Math.abs(expectedAud - capturedPricing.priceAud) > 0.02
            ) {
              console.warn('[PaymentCheckout] PayPal pricing realigned from checkout UI', {
                captured: capturedPricing,
                ref: ctx,
              });
            }

            const { data, error } = await supabase.functions.invoke('create-checkout', {
              body: {
                startDate: payStartDate,
                start_date: payStartDate,
                partySize: partyForPay,
                party_size: partyForPay,
                isExtended: ext,
                is_extended: ext,
                expectedAmountAud: expectedAud,
                returnUrl,
                return_url: returnUrl,
                cancelUrl,
                cancel_url: cancelUrl,
              },
            });

            if (error) {
              if (isPaymentInvokeTransportFailure(error)) {
                const detail = describeFunctionsFetchFailure(error);
                throw new Error(
                  detail ? `${PAYMENT_TRANSPORT_FAILURE_HINT} (${detail})` : PAYMENT_TRANSPORT_FAILURE_HINT,
                );
              }
              const body = await getInvokeErrorBody(error);
              const serverError =
                (typeof body?.error === 'string' && body.error) ||
                error.message ||
                'Could not start payment';
              console.error('[PaymentCheckout] create-checkout error', getInvokeStatus(error), body, error);
              throw new Error(serverError);
            }
            const payload = data as Record<string, unknown> | null;
            const orderId = payload?.orderId ?? payload?.order_id;
            if (!payload?.success || !orderId) {
              const msg =
                typeof payload?.error === 'string'
                  ? String(payload.error)
                  : 'Could not start payment';
              throw new Error(msg);
            }
            const serverAmount = Number(payload?.amount);
            if (
              Number.isFinite(serverAmount) &&
              Math.abs(serverAmount - expectedAud) > 0.02
            ) {
              console.error('[PaymentCheckout] create-checkout amount mismatch', {
                expectedAud,
                serverAmount,
                partyForPay,
                isExtended: ext,
              });
              throw new Error(
                `Payment amount mismatch (expected A$${expectedAud.toFixed(2)}, order A$${serverAmount.toFixed(2)}). Tap “Change dates”, confirm group size and 7-day pass, then pay again.`,
              );
            }
            return String(orderId);
          },
          onApprove: async (data: { orderID?: string }) => {
            const orderId = String(data?.orderID ?? '');
            if (!orderId) throw new Error('Missing PayPal order');

            setProcessing(true);
            setPaymentError(null);
            setStep('processing');

            try {
              const token = await ensureFreshSession();
              if (!token) throw new Error('SESSION_EXPIRED');

              const payStartDate =
                capturedPricing.startDate < earliestPassStartDateIso()
                  ? earliestPassStartDateIso()
                  : capturedPricing.startDate > latestPassStartDateUtc()
                    ? latestPassStartDateUtc()
                    : capturedPricing.startDate;
              const partyForPay = clampPartySize(capturedPricing.partySize);
              const ext = capturedPricing.isExtended;
              let referralCode: string | null = null;
              try {
                referralCode = localStorage.getItem('stikmnek-referral-code');
              } catch {
                referralCode = null;
              }

              const { data: capData, error: capErr } = await supabase.functions.invoke('paypal-capture', {
                body: {
                  paypalOrderId: orderId,
                  startDate: payStartDate,
                  partySize: partyForPay,
                  party_size: partyForPay,
                  isExtended: ext,
                  is_extended: ext,
                  referralCode,
                  paymentTransactionId: getOrCreatePassPurchaseIdempotencyKey(),
                },
              });

              if (capErr) {
                const status = getInvokeStatus(capErr);
                const body = await getInvokeErrorBody(capErr);
                const fromBody = typeof body?.error === 'string' ? body.error : null;
                let serverError =
                  fromBody ??
                  (typeof (capData as Record<string, unknown> | null)?.error === 'string'
                    ? String((capData as Record<string, unknown>).error)
                    : null) ??
                  (typeof (capData as Record<string, unknown> | null)?.message === 'string'
                    ? String((capData as Record<string, unknown>).message)
                    : null);
                if (isPaymentInvokeTransportFailure(capErr)) {
                  const detail = describeFunctionsFetchFailure(capErr);
                  throw new Error(
                    detail ? `${PAYMENT_TRANSPORT_FAILURE_HINT} (${detail})` : PAYMENT_TRANSPORT_FAILURE_HINT,
                  );
                }
                if (serverError) throw new Error(serverError);
                throw new Error(capErr.message || 'Capture failed');
              }

              const ok = capData as Record<string, unknown> | null;
              if (!ok?.success) {
                throw new Error(typeof ok?.error === 'string' ? String(ok.error) : 'Payment capture failed');
              }

              setPaymentResult(capData);
              setStep('success');

              const paymentResultData = {
                receiptNumber: ok.receiptNumber,
                passType: ok.passType,
                passLabel: ok.passLabel || passLabel,
                amount: ok.amount,
                currency: ok.currency || 'AUD',
                paymentMethod: ok.paymentMethod || 'paypal',
                expiresAt: ok.expiresAt,
                validFrom: ok.validFrom,
                validUntil: ok.validUntil,
                days: ok.days,
                shareBonusApplied: Boolean(ok.shareBonusApplied),
                group: ok.group || `Up to ${partyForPay} people (ages 6+)`,
                partySize: partyForPay,
                isExtended: ext,
                sessionId: ok.sessionId,
                completedAt: new Date().toISOString(),
                cardLast4: ok.cardLast4,
                paypalOrderId: orderId,
              };
              localStorage.setItem('lastPayment', JSON.stringify(paymentResultData));
              try {
                localStorage.removeItem('stikmnek-referral-code');
              } catch {
                /* ignore */
              }
              localStorage.removeItem('paypalPending');
              localStorage.removeItem('pendingPayment');

              toast.success('Payment successful! Your pass is now active.');
              setTimeout(() => {
                refreshUserPass();
              }, 1000);
              setTimeout(() => {
                setCart(null);
                setCurrentView('payment-confirmation');
              }, 2500);
            } catch (err: unknown) {
              let msg = err instanceof Error ? err.message : 'Payment failed';
              if (msg === 'SESSION_EXPIRED') {
                toast.error('Your session has expired. Please sign in again.');
                setShowAuth(true);
                setAuthMode('signin');
              } else {
                if (/capture|activate|pass could not/i.test(msg)) {
                  msg += ' If you were charged the full pass amount (not a small ~130 VT hold), email support with your payment receipt — we can activate your pass manually.';
                }
                toast.error(msg);
              }
              setPaymentError(msg);
              setStep('payment');
            } finally {
              setProcessing(false);
            }
          },
          onError: (err: unknown) => {
            console.error('[PaymentCheckout] PayPal Buttons onError', err);
            const m =
              err && typeof err === 'object' && 'message' in err
                ? String((err as { message: string }).message)
                : 'Payment error';
            toast.error(m);
            setPaymentError(m);
          },
          onCancel: () => {
            toast.info('Payment cancelled');
          },
        };

        const cardEl = paypalCardButtonRef.current;
        const walletEl = paypalWalletButtonRef.current;
        if (!cardEl || !walletEl) throw new Error('PayPal button containers not ready');
        await renderPayPalCheckoutButtons(paypal, buttonConfig, { card: cardEl, wallet: walletEl });
        if (!cancelled) setPaypalButtonsReady(true);
      } catch (e: unknown) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : 'Checkout failed to load';
        setPaypalButtonsSdkError(msg);
        setPaypalButtonsReady(false);
        console.error('[PaymentCheckout] PayPal Buttons init', e);
      }
    })();

    return () => {
      cancelled = true;
      try {
        buttonsInstance?.close?.();
      } catch {
        /* ignore */
      }
      if (paypalCardButtonRef.current) paypalCardButtonRef.current.innerHTML = '';
      if (paypalWalletButtonRef.current) paypalWalletButtonRef.current.innerHTML = '';
    };
  }, [
    paypalSmartEnabled,
    paypalClientId,
    step,
    promoAvailable,
    passLabel,
    partySize,
    isExtended,
    startDate,
    priceAud,
    paypalMountKey,
    refreshUserPass,
    setCart,
    setCurrentView,
    setShowAuth,
    setAuthMode,
  ]);

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

      const fromState = Number(partySize);
      const fromCart = cart != null ? Number(cart.partySize) : NaN;
      const rawPartyCount = Number.isFinite(fromState)
        ? fromState
        : Number.isFinite(fromCart)
          ? fromCart
          : 1;
      const partyForPay = clampPartySize(Math.floor(rawPartyCount) || 1);

      const invokeBody = {
        action: 'purchase_pass' as const,
        passType: 'dynamic',
        partySize: partyForPay,
        party_size: partyForPay,
        isExtended: Boolean(isExtended),
        is_extended: Boolean(isExtended),
        startDate: payStartDate,
        start_date: payStartDate,
        cardNumber: cardNumber.replace(/\s/g, ''),
        cardExpiry,
        cardCvv,
        cardName: cardName.trim(),
        referralCode,
        paymentTransactionId: getOrCreatePassPurchaseIdempotencyKey(),
      };

      console.info('[PaymentCheckout] process-card-payment (no card data)', {
        partyForPay,
        cartParty: cart?.partySize,
        stateParty: partySize,
        isExtended,
        startDate: payStartDate,
      });

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
        let serverError =
          fromBody ??
          (typeof data?.error === 'string' ? data.error : null) ??
          (typeof data?.message === 'string' ? data.message : null);
        if (body?.reason === 'invalid_party_size' && (body.partyReceived !== undefined || body.bodyKeys)) {
          const hint = [
            typeof body.partyReceived !== 'undefined'
              ? `Server saw partySize: ${JSON.stringify(body.partyReceived)}`
              : null,
            Array.isArray(body.bodyKeys) && body.bodyKeys.length
              ? `Keys: ${(body.bodyKeys as string[]).join(', ')}`
              : null,
          ]
            .filter(Boolean)
            .join(' · ');
          if (hint) serverError = `${serverError ?? 'Payment failed'} (${hint})`;
        }

        if (status === 401) {
          console.warn(
            '[PaymentCheckout] process-card-payment 401 — response JSON:',
            JSON.stringify(body ?? null, null, 2),
          );
        }

        if (serverError) {
          throw new Error(serverError);
        }
        if (isPaymentInvokeTransportFailure(error)) {
          const detail = describeFunctionsFetchFailure(error);
          throw new Error(detail ? `${PAYMENT_TRANSPORT_FAILURE_HINT} (${detail})` : PAYMENT_TRANSPORT_FAILURE_HINT);
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
          partySize: partyForPay,
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



  const goHome = () => {
    setCurrentView('home');
    navigate('/');
  };

  const peopleWord = partySize === 1 ? '1 person' : `${partySize} people`;
  const planWord = isExtended ? '7-Day Pass' : '1-Day Pass';

  return (
    <div className="min-h-[100dvh] bg-neutral-950 text-white">
      <div className="max-w-md mx-auto px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between py-3">
          <button
            type="button"
            onClick={() => (step === 'payment' ? setStep('dates') : goHome())}
            className="flex items-center gap-1.5 text-sm text-neutral-400 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" />
            {step === 'payment' ? 'Back' : 'Explore'}
          </button>
          <p className="text-sm font-bold tracking-tight">StikmNek</p>
          <span className="w-14" />
        </div>

        {step === 'processing' && (
          <div className="py-24 text-center space-y-4">
            <Loader2 className="w-10 h-10 text-teal-400 animate-spin mx-auto" />
            <p className="text-lg font-bold">
              {claimingPromo ? 'Claiming free pass' : 'Processing payment'}
            </p>
            <p className="text-sm text-neutral-400">Stay on this page — usually a few seconds.</p>
          </div>
        )}

        {step === 'success' && (
          <div className="py-20 text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-teal-600/30 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-teal-400" />
            </div>
            <p className="text-xl font-bold">You’re in</p>
            <p className="text-sm text-neutral-400">
              {paymentResult?.isPromoFree || paymentResult?.paymentMethod === 'promo'
                ? "Your free StikmNek Pass is ready — here's what to do next."
                : 'Your pass is ready. Start messaging places from Your Trip.'}
            </p>
            <button
              type="button"
              onClick={() => setCurrentView('payment-confirmation')}
              className="w-full min-h-12 rounded-xl bg-teal-600 font-bold"
            >
              Continue
            </button>
          </div>
        )}

        {step === 'dates' && (
          <div className="space-y-6 pt-2">
            <div>
              <h1 className="text-2xl font-bold leading-tight">Your pass</h1>
              <p className="text-neutral-400 text-sm mt-1">Almost done — then message places direct.</p>
            </div>

            <div className="rounded-2xl bg-gradient-to-br from-teal-600 to-teal-800 p-5 shadow-lg shadow-teal-950/40">
              <p className="text-teal-100 text-xs font-semibold uppercase tracking-wide">{planWord}</p>
              {promoAvailable ? (
                <>
                  <p className="text-3xl font-bold mt-1">Free</p>
                  <p className="text-sm text-teal-100/90 mt-1 line-through opacity-80">
                    Was A${priceAud.toFixed(2)}
                  </p>
                </>
              ) : (
                <p className="text-3xl font-bold mt-1">A${priceAud.toFixed(2)}</p>
              )}
              <p className="text-sm text-teal-100/90 mt-1">{peopleWord} · ages 6+</p>
            </div>

            {promoAvailable && promoStatus ? (
              <div className="rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-3 py-2.5 text-sm text-emerald-100">
                🎉 {promoStatus.remaining} of {promoStatus.max_claims} free traveler passes left — you
                qualify!
              </div>
            ) : null}

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold">People on the pass</p>
                <p className="text-[11px] text-neutral-500">Kids under 6 free</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  aria-label="Fewer people"
                  disabled={partySize <= 1}
                  onClick={() => handlePartySizeChange(partySize - 1)}
                  className="w-12 h-12 rounded-xl bg-white/10 font-bold text-lg disabled:opacity-30"
                >
                  −
                </button>
                <div className="flex-1 text-center rounded-xl bg-white/5 border border-white/10 py-3">
                  <span className="text-xl font-bold">{partySize}</span>
                  <span className="text-neutral-400 text-sm ml-1">{partySize === 1 ? 'person' : 'people'}</span>
                </div>
                <button
                  type="button"
                  aria-label="More people"
                  disabled={partySize >= MAX_PARTY_SIZE}
                  onClick={() => handlePartySizeChange(partySize + 1)}
                  className="w-12 h-12 rounded-xl bg-white/10 font-bold text-lg disabled:opacity-30"
                >
                  +
                </button>
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold mb-2">How long?</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleDurationChange(false)}
                  className={`rounded-xl border-2 p-3.5 text-left transition-colors ${
                    !isExtended ? 'border-teal-500 bg-teal-500/15' : 'border-white/10 bg-white/5'
                  }`}
                >
                  <p className="font-bold text-sm">1 day</p>
                  <p className="text-teal-300 font-semibold text-sm mt-1">A${priceShortOption.toFixed(0)}</p>
                </button>
                <button
                  type="button"
                  onClick={() => handleDurationChange(true)}
                  className={`rounded-xl border-2 p-3.5 text-left transition-colors ${
                    isExtended ? 'border-teal-500 bg-teal-500/15' : 'border-white/10 bg-white/5'
                  }`}
                >
                  <p className="font-bold text-sm">7 days</p>
                  <p className="text-teal-300 font-semibold text-sm mt-1">A${priceExtendedOption.toFixed(0)}</p>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2" htmlFor="pass-start-date">
                Start date
              </label>
              <input
                id="pass-start-date"
                type="date"
                value={startDate}
                min={minStartDate}
                max={maxStartDate}
                onChange={(e) => {
                  startDateTouchedRef.current = true;
                  const next = e.target.value;
                  setStartDate(next);
                  syncPaySessionRef({ startDate: next });
                }}
                className="w-full px-4 py-3.5 rounded-xl bg-white/5 border border-white/15 text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 [color-scheme:dark]"
              />
              {endDate ? (
                <p className="text-xs text-neutral-500 mt-2">
                  Valid until <span className="text-neutral-300 font-medium">{formatDate(endDate)}</span>
                </p>
              ) : null}
            </div>

            {showTravellerDetails ? (
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-semibold">Your details</p>
                  <p className="text-[11px] text-neutral-500 mt-0.5">
                    So places can confirm bookings with you
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1.5" htmlFor="checkout-name">
                    Name
                  </label>
                  <input
                    id="checkout-name"
                    type="text"
                    autoComplete="name"
                    value={travellerName}
                    onChange={(e) => {
                      setTravellerName(e.target.value);
                      setTravellerErrors((p) => ({ ...p, name: undefined }));
                    }}
                    placeholder="e.g. Jane Smith"
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/15 text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 placeholder:text-neutral-600"
                  />
                  {travellerErrors.name ? (
                    <p className="text-xs text-amber-300 mt-1">{travellerErrors.name}</p>
                  ) : null}
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1.5" htmlFor="checkout-whatsapp">
                    WhatsApp
                  </label>
                  <input
                    id="checkout-whatsapp"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={travellerWhatsapp}
                    onChange={(e) => {
                      setTravellerWhatsapp(e.target.value);
                      setTravellerErrors((p) => ({ ...p, whatsapp: undefined }));
                    }}
                    placeholder="e.g. +678 12345"
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/15 text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 placeholder:text-neutral-600"
                  />
                  {travellerErrors.whatsapp ? (
                    <p className="text-xs text-amber-300 mt-1">{travellerErrors.whatsapp}</p>
                  ) : null}
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1.5" htmlFor="checkout-resort">
                    Resort / accommodation
                  </label>
                  <input
                    id="checkout-resort"
                    type="text"
                    autoComplete="organization"
                    value={travellerResort}
                    onChange={(e) => {
                      setTravellerResort(e.target.value);
                      setTravellerErrors((p) => ({ ...p, resort: undefined }));
                    }}
                    placeholder="Where are you staying?"
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/15 text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 placeholder:text-neutral-600"
                  />
                  {travellerErrors.resort ? (
                    <p className="text-xs text-amber-300 mt-1">{travellerErrors.resort}</p>
                  ) : null}
                </div>
              </div>
            ) : null}

            {showGroupSizeWarning ? (
              <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">
                Max {MAX_PARTY_SIZE} people per pass. Need more? Buy a second pass after this one.
              </p>
            ) : null}

            <button
              type="button"
              disabled={savingTraveller}
              onClick={() => {
                void (async () => {
                  const ok = await saveTravellerDetailsIfNeeded();
                  if (!ok) return;
                  syncPaySessionRef({
                    startDate,
                    partySize,
                    cartPartySize: cart?.partySize,
                    isExtended,
                  });
                  setStep('payment');
                })();
              }}
              className="w-full min-h-12 rounded-xl bg-teal-500 hover:bg-teal-400 text-white font-bold text-base active:scale-[0.99] transition-transform disabled:opacity-60"
            >
              {savingTraveller
                ? 'Saving…'
                : promoAvailable
                  ? 'Continue · Claim free pass'
                  : `Continue · A$${priceAud.toFixed(2)}`}
            </button>
            <p className="text-center text-[11px] text-neutral-500">Receipt to {user.email}</p>
          </div>
        )}

        {step === 'payment' && (
          <div className="space-y-5 pt-2">
            <div>
              <h1 className="text-2xl font-bold">{promoAvailable ? 'Claim free pass' : 'Pay'}</h1>
              <p className="text-sm text-neutral-400 mt-1">
                {planWord} for {peopleWord} ·{' '}
                {promoAvailable ? (
                  <span className="text-emerald-300 font-semibold">Free</span>
                ) : (
                  <>A${priceAud.toFixed(2)}</>
                )}
              </p>
              <p className="text-xs text-neutral-500 mt-1">
                {formatDate(startDate)} → {formatDate(endDate)}
              </p>
            </div>

            {promoAvailable && promoStatus ? (
              <div className="rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-3 py-2.5 text-sm text-emerald-100">
                🎉 {promoStatus.remaining} of {promoStatus.max_claims} free traveler passes left
              </div>
            ) : null}

            {promoMissedMessage ? (
              <div className="rounded-xl bg-amber-500/15 border border-amber-500/40 px-3 py-2.5 text-sm text-amber-100">
                {promoMissedMessage}
              </div>
            ) : null}

            {paymentError ? (
              <div className="rounded-xl bg-red-500/15 border border-red-500/40 px-3 py-2.5 text-sm text-red-200">
                {paymentError}
              </div>
            ) : null}
            {paypalButtonsSdkError && paypalSmartEnabled && !promoAvailable ? (
              <div className="rounded-xl bg-amber-500/15 border border-amber-500/40 px-3 py-2.5 text-sm text-amber-100">
                {paypalButtonsSdkError}
              </div>
            ) : null}

            {promoAvailable ? (
              <button
                type="button"
                onClick={() => void handleClaimPromoFree()}
                disabled={processing || claimingPromo}
                className="w-full min-h-12 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-bold disabled:opacity-60 flex items-center justify-center gap-2 shadow-lg shadow-teal-950/30"
              >
                {claimingPromo || processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Claim Your Free Pass
              </button>
            ) : (
            <div className="rounded-2xl bg-white text-neutral-900 p-4 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-neutral-900 flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-bold text-sm">Credit or debit card</p>
                  <p className="text-xs text-neutral-500">Secure checkout</p>
                </div>
              </div>

              {paypalSmartEnabled && !paypalButtonsSdkError ? (
                <div className="relative min-h-[48px]">
                  {!paypalButtonsReady ? (
                    <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 text-neutral-500 bg-white/90 rounded-xl">
                      <Loader2 className="w-5 h-5 animate-spin text-teal-600" />
                      <span className="text-sm">Loading…</span>
                    </div>
                  ) : null}
                  <div key={paypalMountKey} className="space-y-3">
                    <div ref={paypalCardButtonRef} className="min-h-[48px]" />
                    <div ref={paypalWalletButtonRef} className="sr-only" aria-hidden />
                  </div>
                </div>
              ) : null}

              {!paypalSmartEnabled ? (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={cardName}
                    onChange={(e) => { setCardName(e.target.value); setCardErrors((p) => ({ ...p, cardName: '' })); }}
                    placeholder="Name on card"
                    autoComplete="cc-name"
                    className="w-full px-3 py-2.5 rounded-xl border border-neutral-200 text-sm"
                  />
                  {cardErrors.cardName ? <p className="text-xs text-red-500">{cardErrors.cardName}</p> : null}
                  <input
                    type="text"
                    inputMode="numeric"
                    value={cardNumber}
                    onChange={(e) => {
                      setCardNumber(formatCardNumber(e.target.value));
                      setCardErrors((p) => ({ ...p, cardNumber: '' }));
                    }}
                    placeholder="Card number"
                    autoComplete="cc-number"
                    className="w-full px-3 py-2.5 rounded-xl border border-neutral-200 text-sm"
                  />
                  {cardErrors.cardNumber ? <p className="text-xs text-red-500">{cardErrors.cardNumber}</p> : null}
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={cardExpiry}
                      onChange={(e) => {
                        let v = e.target.value.replace(/\D/g, '').slice(0, 4);
                        if (v.length >= 3) v = `${v.slice(0, 2)}/${v.slice(2)}`;
                        setCardExpiry(v);
                        setCardErrors((p) => ({ ...p, cardExpiry: '' }));
                      }}
                      placeholder="MM/YY"
                      autoComplete="cc-exp"
                      className="w-full px-3 py-2.5 rounded-xl border border-neutral-200 text-sm"
                    />
                    <input
                      type="text"
                      inputMode="numeric"
                      value={cardCvv}
                      onChange={(e) => {
                        setCvv(e.target.value.replace(/\D/g, '').slice(0, 4));
                        setCardErrors((p) => ({ ...p, cardCvv: '' }));
                      }}
                      placeholder="CVV"
                      autoComplete="cc-csc"
                      className="w-full px-3 py-2.5 rounded-xl border border-neutral-200 text-sm"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void handlePayWithCard()}
                    disabled={processing}
                    className="w-full min-h-12 rounded-xl bg-teal-600 text-white font-bold disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Pay A${priceAud.toFixed(2)}
                  </button>
                </div>
              ) : null}
            </div>
            )}

            <p className="text-center text-[11px] text-neutral-500 flex items-center justify-center gap-1.5">
              <Shield className="w-3.5 h-3.5" />{' '}
              {promoAvailable
                ? 'Free traveler promo · same QR pass as paid'
                : 'Secure payment · pass unlocks messaging'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};


export default PaymentCheckout;
