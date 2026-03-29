import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { getPassDisplayTitle } from '@/data/pricing';
import {
  computeRedemptionSavingsForListing,
  partyFromValidityApi,
  type PartyCounts,
} from '@/lib/redemptionSavings';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import {
  Camera, X, CheckCircle, XCircle, Loader2, ScanLine,
  User, Calendar, Ticket, DollarSign, Clock, AlertTriangle,
  Keyboard, RotateCcw, Zap, Shield, Eye, ShieldCheck,
  CalendarCheck, CalendarX, Timer, TrendingDown, History,
  BadgeCheck, Ban, Info, Sparkles, CreditCard, Hash,
  ArrowRight, Crown, Award, Star, Receipt, CircleDot, Tag
} from 'lucide-react';


interface VoucherInfo {
  validFrom: string | null;
  validUntil: string | null;
  status: 'active' | 'expired' | 'not_yet_valid' | 'no_dates';
  daysRemaining: number | null;
  daysUntilStart: number | null;
  totalDays: number | null;
  elapsedDays: number | null;
}

interface RedemptionResult {
  success: boolean;
  message?: string;
  error?: string;
  redemption?: {
    id: string;
    touristName: string;
    touristEmail: string;
    passType: string;
    validFrom: string;
    validUntil: string;
    businessName: string;
    discountApplied: string;
    savedAmount: number;
    redeemedAt: string;
    originalPrice?: number;
    dealPrice?: number;
    savingsLine?: string;
    isTieredPricing?: boolean;
    party?: PartyCounts;
  };
  voucher?: VoucherInfo | null;
  passType?: string;
  status?: string;
}

interface ValidityResult {
  success: boolean;
  action: 'validity_check';
  canRedeem: boolean;
  tourist: { name: string; email: string };
  /** From tourist user_profiles — used for party-sized savings. */
  party?: { adults: number; children: number; infants: number };
  pass: {
    id: string;
    type: string;
    status: string;
    message: string;
    active: boolean;
    validFrom: string;
    validUntil: string;
    expiresAt: string;
    purchasedAt: string;
  };
  voucher: {
    businessName: string;
    discount: string;
    originalPrice: number;
    dealPrice: number;
    savedAmount: number;
    validFrom: string | null;
    validUntil: string | null;
    status: 'active' | 'expired' | 'not_yet_valid' | 'no_dates';
    daysRemaining: number | null;
    daysUntilStart: number | null;
    totalDays: number | null;
    elapsedDays: number | null;
  } | null;
  redemptionHistory: {
    alreadyRedeemedToday: boolean;
    totalRedemptionsAtBusiness: number;
    lastRedemptions: string[];
  };
  error?: string;
}

export type OwnerListingOffer = {
  id: string;
  /** `public.businesses.id` — sent to verify-redemption as businessId */
  profileBusinessId: string;
  name: string;
  discount: string | null;
  original_price: number | null;
  deal_price: number | null;
  pricing_tiers?: unknown;
  category?: string | null;
};

interface QRScannerProps {
  onClose: () => void;
  /** Profile `businesses.id` for validity check / redemption ownership (not offering id). */
  preferredBusinessId?: string | null;
  /** Offering id from `business_offerings` when pre-selecting a specific deal in the picker. */
  preferredOfferingId?: string | null;
  preferredBusinessName?: string | null;
}

function formatOfferDiscountLine(listing: OwnerListingOffer): string {
  const disc = (listing.discount ?? '').trim();
  const title = (listing.name ?? '').trim();
  if (disc && title) return `${disc} — ${title}`;
  if (disc) return disc;
  return title || 'Discount';
}

// ═══ PASS TIER STYLING ═══
const getPassTierConfig = (passType: string) => {
  const type = (passType || '').toLowerCase();
  if (type === 'daily') {
    return { gradient: 'from-sky-500 to-blue-600', bg: 'bg-sky-50', border: 'border-sky-200', text: 'text-sky-800', badge: 'bg-gradient-to-r from-sky-500 to-blue-600', icon: <Zap className="w-4 h-4" />, label: getPassDisplayTitle('daily', 'en') };
  }
  if (type === 'weekly') {
    return { gradient: 'from-teal-500 to-emerald-600', bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-800', badge: 'bg-gradient-to-r from-teal-500 to-emerald-600', icon: <Star className="w-4 h-4" />, label: getPassDisplayTitle('weekly', 'en') };
  }
  if (type === 'monthly') {
    return { gradient: 'from-orange-500 to-amber-600', bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-800', badge: 'bg-gradient-to-r from-orange-500 to-amber-600', icon: <Crown className="w-4 h-4" />, label: getPassDisplayTitle('monthly', 'en') };
  }
  if (type.includes('gold') || type.includes('premium') || type.includes('vip')) {
    return { gradient: 'from-yellow-400 via-amber-500 to-yellow-600', bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-800', badge: 'bg-gradient-to-r from-yellow-400 to-amber-500', icon: <Crown className="w-4 h-4" />, label: 'GOLD' };
  }
  if (type.includes('silver') || type.includes('standard')) {
    return { gradient: 'from-gray-300 via-slate-400 to-gray-500', bg: 'bg-slate-50', border: 'border-slate-300', text: 'text-slate-700', badge: 'bg-gradient-to-r from-gray-400 to-slate-500', icon: <Award className="w-4 h-4" />, label: 'SILVER' };
  }
  if (type.includes('bronze') || type.includes('basic')) {
    return { gradient: 'from-orange-400 via-amber-600 to-orange-700', bg: 'bg-orange-50', border: 'border-orange-300', text: 'text-orange-800', badge: 'bg-gradient-to-r from-orange-400 to-amber-600', icon: <Star className="w-4 h-4" />, label: 'BRONZE' };
  }
  return { gradient: 'from-teal-400 via-emerald-500 to-teal-600', bg: 'bg-teal-50', border: 'border-teal-300', text: 'text-teal-800', badge: 'bg-gradient-to-r from-teal-500 to-emerald-500', icon: <Ticket className="w-4 h-4" />, label: getPassDisplayTitle(passType, 'en') };
};

// ═══ FAILURE REASON CONFIG ═══
const getFailureConfig = (status: string) => {
  switch (status) {
    case 'expired':
    case 'date_range_expired':
      return { icon: <CalendarX className="w-7 h-7" />, color: 'text-red-500', bg: 'bg-red-50', border: 'border-red-200', title: 'Pass Expired', suggestion: 'This tourist needs to purchase a new pass to receive discounts.' };
    case 'not_yet_valid':
      return { icon: <Timer className="w-7 h-7" />, color: 'text-amber-500', bg: 'bg-amber-50', border: 'border-amber-200', title: 'Not Yet Active', suggestion: 'The pass has a future start date. Ask the tourist to return when their pass becomes active.' };
    case 'already_redeemed_today':
      return { icon: <History className="w-7 h-7" />, color: 'text-orange-500', bg: 'bg-orange-50', border: 'border-orange-200', title: 'Already Redeemed Today', suggestion: 'Each pass allows one redemption per business per day. The tourist can return tomorrow.' };
    case 'inactive':
      return { icon: <Ban className="w-7 h-7" />, color: 'text-gray-500', bg: 'bg-gray-50', border: 'border-gray-200', title: 'Pass Inactive', suggestion: 'This pass has been deactivated. The tourist should contact support.' };
    default:
      return { icon: <XCircle className="w-7 h-7" />, color: 'text-red-500', bg: 'bg-red-50', border: 'border-red-200', title: 'Verification Failed', suggestion: 'Please try scanning again or ask the tourist to show their pass code.' };
  }
};

type RedeemSubStep = 'none' | 'pick_offer' | 'no_offers';

const QRScanner: React.FC<QRScannerProps> = ({
  onClose,
  preferredBusinessId = null,
  preferredOfferingId = null,
  preferredBusinessName = null,
}) => {
  const { user } = useAppContext();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<number | null>(null);
  const detectorRef = useRef<any>(null);
  const lastScannedDataRef = useRef<string>('');

  const [inputMode, setInputMode] = useState<'camera' | 'manual'>('camera');
  const [scanPurpose, setScanPurpose] = useState<'redeem' | 'check'>('redeem');
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyStep, setVerifyStep] = useState(0);
  const [result, setResult] = useState<RedemptionResult | null>(null);
  const [validityResult, setValidityResult] = useState<ValidityResult | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [cameraReady, setCameraReady] = useState(false);
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);

  /** After pass is valid, owner picks which listing / offer was redeemed */
  const [redeemSubStep, setRedeemSubStep] = useState<RedeemSubStep>('none');
  const [ownerListings, setOwnerListings] = useState<OwnerListingOffer[]>([]);
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);
  const [pendingRedeemQr, setPendingRedeemQr] = useState<string | null>(null);
  /** Pass check result while choosing an offer (avoid showing full validity success screen). */
  const [verifiedForOfferFlow, setVerifiedForOfferFlow] = useState<ValidityResult | null>(null);

  // Initialize BarcodeDetector if available
  useEffect(() => {
    if ('BarcodeDetector' in window) {
      try {
        detectorRef.current = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
      } catch (e) {
        console.log('BarcodeDetector not supported:', e);
      }
    }
  }, []);

  // Start camera
  const startCamera = useCallback(async () => {
    try {
      setCameraError(null);
      setScanning(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setCameraReady(true);
          startScanning();
        };
      }
    } catch (err: any) {
      setCameraError(
        err.name === 'NotAllowedError'
          ? 'Camera access denied. Please allow camera permissions and try again.'
          : err.name === 'NotFoundError'
            ? 'No camera found on this device. Use manual code entry instead.'
            : 'Failed to access camera: ' + (err.message || 'Unknown error')
      );
      setScanning(false);
    }
  }, []);

  // Stop camera
  const stopCamera = useCallback(() => {
    if (scanIntervalRef.current) { clearInterval(scanIntervalRef.current); scanIntervalRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(track => track.stop()); streamRef.current = null; }
    setCameraReady(false);
    setScanning(false);
  }, []);

  // Scan frames using BarcodeDetector
  const startScanning = useCallback(() => {
    if (!detectorRef.current || !videoRef.current) {
      scanIntervalRef.current = window.setInterval(() => { /* canvas fallback */ }, 500);
      return;
    }
    scanIntervalRef.current = window.setInterval(async () => {
      if (!videoRef.current || videoRef.current.readyState !== 4) return;
      try {
        const barcodes = await detectorRef.current.detect(videoRef.current);
        if (barcodes.length > 0) {
          const qrData = barcodes[0].rawValue;
          if (qrData) { stopCamera(); handleQRData(qrData); }
        }
      } catch (err) { /* silently fail */ }
    }, 300);
  }, [scanPurpose]);

  // Start camera when component mounts in camera mode
  useEffect(() => {
    if (inputMode === 'camera' && !result && !validityResult && redeemSubStep === 'none' && !verifying) {
      startCamera();
    }
    return () => { stopCamera(); };
  }, [inputMode, result, validityResult, redeemSubStep, verifying]);

  // Animated verify steps
  useEffect(() => {
    if (!verifying) { setVerifyStep(0); return; }
    const steps = scanPurpose === 'redeem' ? [0, 1, 2, 3] : [0, 1, 2];
    let currentStep = 0;
    const interval = setInterval(() => {
      currentStep++;
      if (currentStep < steps.length) {
        setVerifyStep(currentStep);
      }
    }, 600);
    return () => clearInterval(interval);
  }, [verifying, scanPurpose]);

  const executeRedeemForListing = async (
    rawData: string,
    listing: OwnerListingOffer,
    party: PartyCounts,
  ) => {
    const discountLine = formatOfferDiscountLine(listing);
    const preview = computeRedemptionSavingsForListing(listing, party);
    const { data, error } = await supabase.functions.invoke('verify-redemption', {
      body: {
        action: 'verify_and_redeem',
        qrData: rawData,
        businessId: listing.profileBusinessId,
        businessName: listing.name,
        discount: discountLine,
        discountLabel: discountLine,
        savedAmount: preview.savedAmount,
        originalPrice: preview.totalStandard,
        dealPrice: preview.totalDeal,
        verifiedBy: user?.id,
      },
    });
    if (error) {
      setResult({ success: false, error: 'Failed to record redemption. Please try again.' });
      setRedeemSubStep('none');
      setOwnerListings([]);
      setVerifiedForOfferFlow(null);
      return;
    }
    const payload = data as RedemptionResult & { status?: string };
    setResult(payload);
    if (!payload?.success) {
      setRedeemSubStep('none');
      setOwnerListings([]);
      setSelectedListingId(null);
      setPendingRedeemQr(null);
      setVerifiedForOfferFlow(null);
      if (payload?.error) toast.error(payload.error);
      return;
    }
    setRedeemSubStep('none');
    setOwnerListings([]);
    setSelectedListingId(null);
    setPendingRedeemQr(null);
    setVerifiedForOfferFlow(null);
    setShowSuccessAnimation(true);
    toast.success('Discount redeemed successfully!');
  };

  const proceedAfterPassValidForRedeem = async (rawData: string, checkData: ValidityResult) => {
    if (!user?.id) {
      toast.error('You must be signed in to redeem.');
      setResult({ success: false, error: 'Not signed in.' });
      return;
    }

    const party = partyFromValidityApi(checkData.party);

    type OfferingJoin = {
      id?: string;
      title?: string | null;
      discount?: string | null;
      original_price?: number | null;
      deal_price?: number | null;
      pricing_tiers?: unknown;
      active?: boolean;
      businesses?: {
        id?: string;
        owner_id?: string;
        category?: string | null;
        name?: string | null;
        active?: boolean;
      };
    };

    const { data: offData, error: offErr } = await supabase
      .from('business_offerings')
      .select(
        'id, title, discount, original_price, deal_price, pricing_tiers, active, businesses!inner(id, owner_id, category, name, active)',
      )
      .eq('businesses.owner_id', user.id);

    let rows: OwnerListingOffer[] = [];
    if (!offErr && offData && (offData as OfferingJoin[]).length > 0) {
      rows = (offData as OfferingJoin[])
        .filter((o) => o.active !== false && o.businesses?.active !== false)
        .map((o) => ({
          id: String(o.id ?? ''),
          profileBusinessId: String(o.businesses?.id ?? ''),
          name: String(
            (o.title && String(o.title).trim()) || o.businesses?.name || 'Offer',
          ),
          discount: o.discount != null ? String(o.discount) : null,
          original_price: o.original_price != null ? Number(o.original_price) : null,
          deal_price: o.deal_price != null ? Number(o.deal_price) : null,
          pricing_tiers: o.pricing_tiers ?? null,
          category: o.businesses?.category != null ? String(o.businesses.category) : null,
        }))
        .filter((r) => r.id.length > 0 && r.profileBusinessId.length > 0)
        .sort((a, b) => a.name.localeCompare(b.name));
    }

    if (rows.length === 0) {
      const { data: mbData, error: mbErr } = await supabase.functions.invoke('manage-business', {
        body: { action: 'get_owner_businesses', userId: user.id },
      });

      if (mbErr) {
        console.error('[QRScanner] load owner listings (edge):', mbErr);
        toast.error('Could not load your listings.');
        setResult({ success: false, error: 'Could not load your active listings.' });
        return;
      }

      const mbPayload = mbData as { businesses?: Record<string, unknown>[]; error?: string };
      if (mbPayload?.error) {
        console.error('[QRScanner] load owner listings:', mbPayload.error);
        toast.error('Could not load your listings.');
        setResult({ success: false, error: 'Could not load your active listings.' });
        return;
      }

      const rawList = mbPayload.businesses ?? [];
      rows = rawList
        .filter((b) => b.active !== false)
        .map((b) => {
          const id = String(b.id ?? '');
          return {
            id,
            profileBusinessId: id,
            name: String(b.name ?? ''),
            discount: b.discount != null ? String(b.discount) : null,
            original_price: b.original_price != null ? Number(b.original_price) : null,
            deal_price: b.deal_price != null ? Number(b.deal_price) : null,
            pricing_tiers: b.pricing_tiers ?? null,
            category: b.category != null ? String(b.category) : null,
          };
        })
        .filter((r) => r.id.length > 0)
        .sort((a, b) => a.name.localeCompare(b.name));
    }

    if (rows.length === 0) {
      setPendingRedeemQr(rawData);
      setRedeemSubStep('no_offers');
      setVerifiedForOfferFlow(checkData);
      return;
    }

    if (rows.length === 1) {
      await executeRedeemForListing(rawData, rows[0], party);
      return;
    }

    setPendingRedeemQr(rawData);
    setOwnerListings(rows);
    const preferredFromOffering =
      preferredOfferingId && rows.some((r) => r.id === preferredOfferingId)
        ? preferredOfferingId
        : null;
    const singleOnProfile =
      preferredBusinessId &&
      rows.filter((r) => r.profileBusinessId === preferredBusinessId).length === 1
        ? rows.find((r) => r.profileBusinessId === preferredBusinessId)!.id
        : null;
    const preferred = preferredFromOffering || singleOnProfile;
    setSelectedListingId(preferred);
    setRedeemSubStep('pick_offer');
    setVerifiedForOfferFlow(checkData);
  };

  // Handle scanned QR data
  const handleQRData = async (rawData: string) => {
    lastScannedDataRef.current = rawData;
    setVerifying(true);
    setVerifyStep(0);
    setShowSuccessAnimation(false);
    setRedeemSubStep('none');
    setOwnerListings([]);
    setSelectedListingId(null);
    setPendingRedeemQr(null);
    setVerifiedForOfferFlow(null);
    try {
      if (scanPurpose === 'check') {
        const { data, error } = await supabase.functions.invoke('verify-redemption', {
          body: {
            action: 'check_voucher_validity',
            qrData: rawData,
            ...(preferredBusinessId ? { businessId: preferredBusinessId, businessName: preferredBusinessName ?? '' } : {}),
          },
        });
        if (error) {
          setValidityResult({ success: false, error: 'Failed to check validity. Please try again.' } as any);
          return;
        }
        setValidityResult(data as ValidityResult);
        if (data?.success && data?.canRedeem) {
          toast.success('Pass is valid and eligible for redemption!');
        } else if (data?.success && !data?.canRedeem) {
          toast.warning('Pass verified but not eligible for redemption right now.');
        }
      } else {
        const { data, error } = await supabase.functions.invoke('verify-redemption', {
          body: {
            action: 'check_voucher_validity',
            qrData: rawData,
          },
        });
        if (error) {
          setResult({ success: false, error: 'Failed to verify pass. Please try again.' });
          return;
        }
        const v = data as ValidityResult;
        if (!v?.success || !v.canRedeem) {
          setResult({
            success: false,
            error: v?.pass?.message || v?.error || 'Pass cannot be redeemed right now.',
            status: v?.pass?.status,
            passType: v?.pass?.type,
          });
          return;
        }
        await proceedAfterPassValidForRedeem(rawData, v);
      }
    } catch (err: any) {
      if (scanPurpose === 'check') {
        setValidityResult({ success: false, error: err.message || 'Verification failed.' } as any);
      } else {
        setResult({ success: false, error: err.message || 'Verification failed. Please try again.' });
      }
    } finally {
      setVerifying(false);
    }
  };

  // Handle manual code submission
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) { toast.error('Please enter or paste the pass code'); return; }
    handleQRData(manualCode.trim());
  };

  // Reset to scan again
  const handleReset = () => {
    setResult(null);
    setValidityResult(null);
    setManualCode('');
    setVerifying(false);
    setVerifyStep(0);
    setShowSuccessAnimation(false);
    setRedeemSubStep('none');
    setOwnerListings([]);
    setSelectedListingId(null);
    setPendingRedeemQr(null);
    setVerifiedForOfferFlow(null);
    lastScannedDataRef.current = '';
    if (inputMode === 'camera') { startCamera(); }
  };

  // Proceed to redeem from validity check
  const handleProceedToRedeem = () => {
    if (!validityResult || !validityResult.canRedeem) return;
    const savedData = lastScannedDataRef.current;
    setScanPurpose('redeem');
    const savedValidity = validityResult;
    setValidityResult(null);
    if (savedData) {
      (async () => {
        lastScannedDataRef.current = savedData;
        setVerifying(true);
        setVerifyStep(0);
        setShowSuccessAnimation(false);
        setRedeemSubStep('none');
        setOwnerListings([]);
        setSelectedListingId(null);
        setPendingRedeemQr(null);
        try {
          await proceedAfterPassValidForRedeem(savedData, savedValidity);
        } catch (e: any) {
          setResult({ success: false, error: e?.message || 'Redemption failed.' });
        } finally {
          setVerifying(false);
        }
      })();
    } else {
      toast.info('Please scan or enter the code again to redeem.');
      handleReset();
    }
  };

  const confirmSelectedOffer = async () => {
    const raw = pendingRedeemQr || lastScannedDataRef.current;
    if (!raw || !selectedListingId) {
      toast.error('Select an offer to continue.');
      return;
    }
    const listing = ownerListings.find((l) => l.id === selectedListingId);
    if (!listing) return;
    const party = partyFromValidityApi(verifiedForOfferFlow?.party);
    setVerifying(true);
    try {
      await executeRedeemForListing(raw, listing, party);
    } catch (e: any) {
      setResult({ success: false, error: e?.message || 'Redemption failed.' });
    } finally {
      setVerifying(false);
    }
  };

  const hasBarcodeDetector = 'BarcodeDetector' in window;
  const inOfferFlow = redeemSubStep === 'pick_offer' || redeemSubStep === 'no_offers';
  const hasResult = !!(result || validityResult);

  // ═══ VERIFY STEP LABELS ═══
  const verifySteps = scanPurpose === 'redeem'
    ? ['Reading QR data...', 'Checking pass status...', 'Verifying tourist identity...', 'Recording redemption...']
    : ['Reading QR data...', 'Checking pass status...', 'Verifying voucher validity...'];

  // ═══ VOUCHER VALIDITY PANEL ═══
  const renderVoucherValidityPanel = (voucher: VoucherInfo | ValidityResult['voucher'], label?: string) => {
    if (!voucher) return null;

    const statusConfig = {
      active: { bg: 'bg-emerald-50', border: 'border-emerald-200', icon: <ShieldCheck className="w-5 h-5 text-emerald-600" />, label: 'Active', textColor: 'text-emerald-700', badgeBg: 'bg-emerald-100 text-emerald-800', barColor: 'bg-emerald-500' },
      expired: { bg: 'bg-red-50', border: 'border-red-200', icon: <CalendarX className="w-5 h-5 text-red-500" />, label: 'Expired', textColor: 'text-red-700', badgeBg: 'bg-red-100 text-red-800', barColor: 'bg-red-500' },
      not_yet_valid: { bg: 'bg-amber-50', border: 'border-amber-200', icon: <Timer className="w-5 h-5 text-amber-500" />, label: 'Not Yet Valid', textColor: 'text-amber-700', badgeBg: 'bg-amber-100 text-amber-800', barColor: 'bg-amber-500' },
      no_dates: { bg: 'bg-gray-50', border: 'border-gray-200', icon: <Info className="w-5 h-5 text-gray-400" />, label: 'No Dates Set', textColor: 'text-gray-600', badgeBg: 'bg-gray-100 text-gray-700', barColor: 'bg-gray-400' },
    };

    const config = statusConfig[voucher.status] || statusConfig.no_dates;
    const progressPercent = voucher.totalDays && voucher.elapsedDays != null
      ? Math.min(100, Math.max(0, (voucher.elapsedDays / voucher.totalDays) * 100))
      : voucher.status === 'expired' ? 100 : 0;

    return (
      <div className={`rounded-xl ${config.bg} border ${config.border} overflow-hidden`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-inherit">
          <div className="flex items-center gap-2.5">
            {config.icon}
            <div>
              <p className="text-xs font-bold text-gray-800">{label || 'Voucher Validity'}</p>
              <p className={`text-[10px] font-semibold ${config.textColor}`}>
                {'businessName' in voucher && voucher.businessName ? voucher.businessName : (preferredBusinessName ?? '')}
              </p>
            </div>
          </div>
          <span className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold ${config.badgeBg}`}>
            {config.label}
          </span>
        </div>
        <div className="px-4 py-3 space-y-3">
          {(voucher.validFrom || voucher.validUntil) && (
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <p className="text-[10px] text-gray-500 mb-0.5">Start Date</p>
                <p className="text-sm font-bold text-gray-900">
                  {voucher.validFrom
                    ? new Date(voucher.validFrom + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    : 'Not set'}
                </p>
              </div>
              <div className="flex items-center gap-1 text-gray-300">
                <div className="w-6 h-px bg-gray-300" />
                <CalendarCheck className="w-3.5 h-3.5" />
                <div className="w-6 h-px bg-gray-300" />
              </div>
              <div className="flex-1 text-right">
                <p className="text-[10px] text-gray-500 mb-0.5">End Date</p>
                <p className="text-sm font-bold text-gray-900">
                  {voucher.validUntil
                    ? new Date(voucher.validUntil + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    : 'Not set'}
                </p>
              </div>
            </div>
          )}
          {voucher.totalDays != null && voucher.totalDays > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] text-gray-500">
                  {voucher.status === 'active' && voucher.elapsedDays != null
                    ? `Day ${voucher.elapsedDays + 1} of ${voucher.totalDays}`
                    : voucher.status === 'expired'
                      ? `${voucher.totalDays} days completed`
                      : `${voucher.totalDays} day period`}
                </span>
                <span className="text-[10px] font-bold text-gray-600">{Math.round(progressPercent)}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-white/80 overflow-hidden shadow-inner">
                <div className={`h-full rounded-full ${config.barColor} transition-all duration-500`} style={{ width: `${progressPercent}%` }} />
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            {voucher.status === 'active' && voucher.daysRemaining != null && (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-white/60">
                <Timer className="w-4 h-4 text-emerald-500" />
                <div><p className="text-[10px] text-gray-500">Days Left</p><p className="text-sm font-extrabold text-emerald-700">{voucher.daysRemaining}</p></div>
              </div>
            )}
            {voucher.status === 'not_yet_valid' && voucher.daysUntilStart != null && (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-white/60">
                <Timer className="w-4 h-4 text-amber-500" />
                <div><p className="text-[10px] text-gray-500">Starts In</p><p className="text-sm font-extrabold text-amber-700">{voucher.daysUntilStart} day{voucher.daysUntilStart !== 1 ? 's' : ''}</p></div>
              </div>
            )}
            {voucher.status === 'expired' && (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-white/60">
                <Ban className="w-4 h-4 text-red-500" />
                <div><p className="text-[10px] text-gray-500">Status</p><p className="text-sm font-extrabold text-red-700">Expired</p></div>
              </div>
            )}
            {voucher.totalDays != null && (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-white/60">
                <Calendar className="w-4 h-4 text-blue-500" />
                <div><p className="text-[10px] text-gray-500">Total Period</p><p className="text-sm font-extrabold text-gray-800">{voucher.totalDays} day{voucher.totalDays !== 1 ? 's' : ''}</p></div>
              </div>
            )}
          </div>
          {'discount' in voucher && voucher.discount && (
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-white/60 border border-white/80">
              <div className="flex items-center gap-2"><TrendingDown className="w-4 h-4 text-orange-500" /><span className="text-xs font-medium text-gray-600">Discount</span></div>
              <span className="text-sm font-extrabold text-orange-600">{voucher.discount}</span>
            </div>
          )}
          {'savedAmount' in voucher && voucher.savedAmount > 0 && (
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-white/60 border border-white/80">
              <div className="flex items-center gap-2"><DollarSign className="w-4 h-4 text-green-500" /><span className="text-xs font-medium text-gray-600">{'originalPrice' in voucher ? `${voucher.originalPrice} VT → ${voucher.dealPrice} VT` : 'Savings'}</span></div>
              <span className="text-sm font-extrabold text-green-600">Save {voucher.savedAmount} VT</span>
            </div>
          )}
          {voucher.status === 'no_dates' && (
            <div className="p-2.5 rounded-lg bg-white/60 text-center">
              <p className="text-xs text-gray-500">No validity dates set for this voucher.</p>
              <p className="text-[10px] text-gray-400 mt-0.5">The discount is available indefinitely.</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ═══ RENDER: ENHANCED VERIFYING STATE ═══
  const renderVerifyingState = () => (
    <div className="py-8">
      {/* Animated scanner pulse */}
      <div className="relative w-24 h-24 mx-auto mb-6">
        <div className="absolute inset-0 rounded-full bg-teal-100 animate-ping opacity-30" />
        <div className="absolute inset-2 rounded-full bg-teal-50 animate-pulse" />
        <div className="absolute inset-0 rounded-full bg-white flex items-center justify-center shadow-lg border-2 border-teal-200">
          <ScanLine className="w-10 h-10 text-teal-600 animate-pulse" />
        </div>
      </div>

      <h3 className="text-lg font-extrabold text-gray-900 mb-2 text-center">
        {scanPurpose === 'check' ? 'Checking Pass...' : 'Verifying & Redeeming...'}
      </h3>

      {/* Step progress */}
      <div className="max-w-xs mx-auto space-y-2.5 mt-5">
        {verifySteps.map((stepLabel, i) => {
          const isActive = i === verifyStep;
          const isComplete = i < verifyStep;

          return (
            <div key={i} className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-300 ${isActive ? 'bg-teal-50 border border-teal-200 shadow-sm' : isComplete ? 'bg-green-50 border border-green-100' : 'bg-gray-50 border border-gray-100'}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300 ${isActive ? 'bg-teal-500' : isComplete ? 'bg-green-500' : 'bg-gray-200'}`}>
                {isComplete ? (
                  <CheckCircle className="w-4 h-4 text-white" />
                ) : isActive ? (
                  <Loader2 className="w-4 h-4 text-white animate-spin" />
                ) : (
                  <CircleDot className="w-3.5 h-3.5 text-gray-400" />
                )}
              </div>
              <span className={`text-sm font-medium transition-all duration-300 ${isActive ? 'text-teal-800' : isComplete ? 'text-green-700' : 'text-gray-400'}`}>
                {stepLabel}
              </span>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-gray-400 text-center mt-4">This usually takes just a moment...</p>
    </div>
  );

  // ═══ RENDER: SUCCESS SCREEN (REDEMPTION) ═══
  const renderRedeemSuccess = () => {
    if (!result?.redemption) return null;
    const r = result.redemption;
    const tierConfig = getPassTierConfig(r.passType);

    return (
      <div className="space-y-4 -mx-5 -mt-5">
        {/* ── Green Success Banner ── */}
        <div className="relative bg-gradient-to-br from-green-500 via-emerald-500 to-teal-600 px-6 pt-8 pb-6 overflow-hidden">
          {/* Decorative circles */}
          <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/10 -mr-10 -mt-10" />
          <div className="absolute bottom-0 left-0 w-24 h-24 rounded-full bg-white/5 -ml-8 -mb-8" />
          {showSuccessAnimation && (
            <>
              <div className="absolute top-4 left-6 w-2 h-2 rounded-full bg-yellow-300 animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="absolute top-8 right-12 w-1.5 h-1.5 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: '200ms' }} />
              <div className="absolute bottom-6 left-16 w-1.5 h-1.5 rounded-full bg-yellow-200 animate-bounce" style={{ animationDelay: '400ms' }} />
              <div className="absolute top-12 left-24 w-1 h-1 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '100ms' }} />
              <div className="absolute bottom-10 right-20 w-2 h-2 rounded-full bg-emerald-300 animate-bounce" style={{ animationDelay: '300ms' }} />
            </>
          )}

          <div className="relative text-center">
            {/* Animated checkmark */}
            <div className="relative w-20 h-20 mx-auto mb-4">
              <div className={`absolute inset-0 rounded-full bg-white/20 ${showSuccessAnimation ? 'animate-ping' : ''}`} style={{ animationDuration: '1.5s', animationIterationCount: '2' }} />
              <div className="absolute inset-0 rounded-full bg-white flex items-center justify-center shadow-xl">
                <CheckCircle className="w-10 h-10 text-green-500" />
              </div>
            </div>

            <h3 className="text-2xl font-extrabold text-white mb-1">Redemption Confirmed</h3>
            <p className="text-green-100 text-sm font-medium">Discount successfully applied</p>

            {/* Pass tier badge */}
            <div className="inline-flex items-center gap-1.5 mt-3 px-4 py-1.5 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 max-w-[90%]">
              <span className="text-white shrink-0">{tierConfig.icon}</span>
              <span className="text-white text-xs font-bold text-center leading-tight">{getPassDisplayTitle(r.passType, 'en')}</span>
            </div>
          </div>
        </div>

        {/* ── Tourist Identity Card ── */}
        <div className="px-5">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center gap-4 p-4 border-b border-gray-50">
              <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${tierConfig.gradient} flex items-center justify-center text-white text-xl font-extrabold shadow-lg flex-shrink-0`}>
                {r.touristName.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-lg font-extrabold text-gray-900 truncate">{r.touristName}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold text-white ${tierConfig.badge}`}>
                    {tierConfig.icon}
                    {tierConfig.label}
                  </span>
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-green-100 text-green-700 text-[10px] font-bold">
                    <ShieldCheck className="w-3 h-3" />VERIFIED
                  </span>
                </div>
              </div>
            </div>

            {/* ── Receipt-style Details ── */}
            <div className="p-4 space-y-3">
              {/* Dashed separator */}
              <div className="border-t border-dashed border-gray-200 -mx-4" />

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><Receipt className="w-4 h-4 text-gray-400" /><span className="text-xs text-gray-500">Business</span></div>
                <span className="text-sm font-bold text-gray-900">{r.businessName}</span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><Tag className="w-4 h-4 text-gray-400" /><span className="text-xs text-gray-500">Discount</span></div>
                <span className="text-sm font-bold text-orange-600">{r.discountApplied?.trim() ? r.discountApplied : '—'}</span>
              </div>

              {(r.originalPrice != null && r.dealPrice != null && r.originalPrice > 0) && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><CreditCard className="w-4 h-4 text-gray-400" /><span className="text-xs text-gray-500">Group total</span></div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 line-through">{r.originalPrice} VT</span>
                    <ArrowRight className="w-3 h-3 text-gray-300" />
                    <span className="text-sm font-bold text-green-600">{r.dealPrice} VT</span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><Calendar className="w-4 h-4 text-gray-400" /><span className="text-xs text-gray-500">Pass Valid</span></div>
                <span className="text-xs font-semibold text-gray-700">
                  {r.validFrom ? new Date(r.validFrom).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-'}
                  {' - '}
                  {r.validUntil ? new Date(r.validUntil).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-'}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-gray-400" /><span className="text-xs text-gray-500">Redeemed At</span></div>
                <span className="text-xs font-semibold text-gray-700">
                  {new Date(r.redeemedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
                </span>
              </div>

              {r.id && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><Hash className="w-4 h-4 text-gray-400" /><span className="text-xs text-gray-500">Ref ID</span></div>
                  <span className="text-[10px] font-mono text-gray-400">{r.id.substring(0, 8).toUpperCase()}</span>
                </div>
              )}

              {/* Dashed separator */}
              <div className="border-t border-dashed border-gray-200 -mx-4" />

              {/* Savings highlight */}
              {r.savedAmount > 0 && (
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-4 border border-green-200 text-center">
                  <p className="text-xs font-semibold text-green-600 mb-1">Tourist savings (whole group)</p>
                  <p className="text-3xl font-extrabold text-green-700">{r.savedAmount} <span className="text-lg">VT</span></p>
                  {r.savingsLine && (
                    <p className="text-[11px] font-semibold text-green-800 mt-2 leading-snug px-1">{r.savingsLine}</p>
                  )}
                  <div className="flex items-center justify-center gap-1.5 mt-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-green-500" />
                    <span className="text-[10px] font-bold text-green-600 uppercase tracking-wider">Redemption Recorded in Database</span>
                  </div>
                </div>
              )}
              {r.savedAmount <= 0 && (
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-3 border border-green-200 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span className="text-xs font-bold text-green-700">Redemption Recorded Successfully</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Voucher Validity Panel */}
        {result.voucher && (
          <div className="px-5">
            {renderVoucherValidityPanel(result.voucher, 'Your Voucher Validity')}
          </div>
        )}

        {/* Actions */}
        <div className="px-5 pb-5 flex items-center gap-3">
          <button onClick={handleReset} className="flex-1 py-3.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-bold hover:from-teal-700 hover:to-emerald-700 transition-all shadow-lg shadow-teal-200/50 flex items-center justify-center gap-2">
            <ScanLine className="w-5 h-5" />Scan Another
          </button>
          <button onClick={() => { stopCamera(); onClose(); }} className="flex-1 py-3.5 rounded-xl bg-gray-100 text-gray-700 font-bold hover:bg-gray-200 transition-colors">
            Done
          </button>
        </div>
      </div>
    );
  };

  // ═══ RENDER: FAILURE SCREEN (REDEMPTION) ═══
  const renderRedeemFailure = () => {
    if (!result) return null;
    const failConfig = getFailureConfig(result.status || '');

    return (
      <div className="space-y-4 -mx-5 -mt-5">
        {/* ── Red Failure Banner ── */}
        <div className="relative bg-gradient-to-br from-red-500 via-rose-500 to-red-600 px-6 pt-8 pb-6 overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/5 -mr-10 -mt-10" />
          <div className="absolute bottom-0 left-0 w-24 h-24 rounded-full bg-white/5 -ml-8 -mb-8" />

          <div className="relative text-center">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border-2 border-white/30">
              <XCircle className="w-10 h-10 text-white" />
            </div>
            <h3 className="text-2xl font-extrabold text-white mb-1">Redemption Failed</h3>
            <p className="text-red-100 text-sm font-medium">Unable to apply discount</p>
          </div>
        </div>

        <div className="px-5 space-y-4">
          {/* Status-specific reason card */}
          <div className={`rounded-2xl ${failConfig.bg} border ${failConfig.border} overflow-hidden`}>
            <div className="p-5">
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-xl ${failConfig.bg} border ${failConfig.border} flex items-center justify-center flex-shrink-0 ${failConfig.color}`}>
                  {failConfig.icon}
                </div>
                <div className="flex-1">
                  <h4 className="text-base font-extrabold text-gray-900 mb-1">{failConfig.title}</h4>
                  <p className="text-sm text-gray-600 leading-relaxed">{result.error}</p>
                </div>
              </div>

              {/* Pass type info if available */}
              {result.passType && (
                <div className="mt-4 flex items-center gap-3 p-3 rounded-xl bg-white/60 border border-white/80">
                  <Ticket className={`w-5 h-5 ${failConfig.color}`} />
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Pass Type</p>
                    <p className="text-sm font-bold text-gray-900 leading-snug">{getPassDisplayTitle(result.passType, 'en')}</p>
                  </div>
                  {result.status && (
                    <span className={`ml-auto px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase ${
                      result.status === 'expired' || result.status === 'date_range_expired' ? 'bg-red-100 text-red-700'
                      : result.status === 'not_yet_valid' ? 'bg-amber-100 text-amber-700'
                      : result.status === 'already_redeemed_today' ? 'bg-orange-100 text-orange-700'
                      : 'bg-gray-100 text-gray-700'
                    }`}>
                      {result.status.replace(/_/g, ' ')}
                    </span>
                  )}
                </div>
              )}

              {/* Suggestion */}
              <div className="mt-4 p-3 rounded-xl bg-blue-50 border border-blue-100">
                <div className="flex items-start gap-2">
                  <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-blue-700 font-medium leading-relaxed">{failConfig.suggestion}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pb-5">
            <button onClick={handleReset} className="flex-1 py-3.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-bold hover:from-teal-700 hover:to-emerald-700 transition-all shadow-lg shadow-teal-200/50 flex items-center justify-center gap-2">
              <RotateCcw className="w-5 h-5" />Try Again
            </button>
            <button onClick={() => { stopCamera(); onClose(); }} className="flex-1 py-3.5 rounded-xl bg-gray-100 text-gray-700 font-bold hover:bg-gray-200 transition-colors">
              Close
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ═══ RENDER: VALIDITY CHECK SUCCESS ═══
  const renderValiditySuccess = () => {
    if (!validityResult?.success) return null;
    const tierConfig = getPassTierConfig(validityResult.pass?.type || '');

    return (
      <div className="space-y-4 -mx-5 -mt-5">
        {/* Status Banner */}
        <div className={`relative px-6 pt-8 pb-6 overflow-hidden ${
          validityResult.canRedeem
            ? 'bg-gradient-to-br from-emerald-500 via-green-500 to-teal-600'
            : 'bg-gradient-to-br from-amber-400 via-orange-500 to-amber-600'
        }`}>
          <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/10 -mr-10 -mt-10" />
          <div className="relative text-center">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-white flex items-center justify-center shadow-xl">
              {validityResult.canRedeem
                ? <BadgeCheck className="w-10 h-10 text-emerald-500" />
                : <AlertTriangle className="w-10 h-10 text-amber-500" />
              }
            </div>
            <h3 className="text-2xl font-extrabold text-white mb-1">
              {validityResult.canRedeem ? 'Eligible for Redemption' : 'Not Eligible Right Now'}
            </h3>
            <p className="text-white/80 text-sm font-medium">
              {validityResult.canRedeem
                ? 'Pass and voucher are both valid'
                : validityResult.pass?.message || 'See details below'}
            </p>
          </div>
        </div>

        <div className="px-5 space-y-4">
          {/* Tourist Identity Card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center gap-4">
              <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${tierConfig.gradient} flex items-center justify-center text-white text-xl font-extrabold shadow-lg flex-shrink-0`}>
                {validityResult.tourist?.name?.charAt(0)?.toUpperCase() || 'T'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-lg font-extrabold text-gray-900 truncate">{validityResult.tourist?.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold text-white ${tierConfig.badge}`}>
                    {tierConfig.icon}
                    {tierConfig.label}
                  </span>
                  <span className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${
                    validityResult.pass?.status === 'active' ? 'bg-green-100 text-green-700'
                    : validityResult.pass?.status === 'expired' || validityResult.pass?.status === 'date_range_expired' ? 'bg-red-100 text-red-700'
                    : validityResult.pass?.status === 'not_yet_valid' ? 'bg-amber-100 text-amber-700'
                    : 'bg-gray-100 text-gray-700'
                  }`}>
                    <Shield className="w-3 h-3" />
                    {validityResult.pass?.status?.replace(/_/g, ' ').toUpperCase()}
                  </span>
                </div>
              </div>
            </div>

            {/* Pass dates */}
            <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gray-400" />
                <div>
                  <p className="text-[10px] text-gray-400">Pass Valid</p>
                  <p className="text-xs font-bold text-gray-700">
                    {validityResult.pass?.validFrom ? new Date(validityResult.pass.validFrom).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-'}
                    {' - '}
                    {validityResult.pass?.validUntil ? new Date(validityResult.pass.validUntil).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-400" />
                <div>
                  <p className="text-[10px] text-gray-400">Purchased</p>
                  <p className="text-xs font-bold text-gray-700">
                    {validityResult.pass?.purchasedAt ? new Date(validityResult.pass.purchasedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Voucher Validity Panel */}
          {validityResult.voucher && renderVoucherValidityPanel(validityResult.voucher, 'Your Voucher / Discount Validity')}

          {/* Redemption History */}
          {validityResult.redemptionHistory && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-2.5">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                <History className="w-3.5 h-3.5" />Redemption History
              </p>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Redeemed Today</span>
                <span className={`text-sm font-bold ${validityResult.redemptionHistory.alreadyRedeemedToday ? 'text-orange-600' : 'text-gray-900'}`}>
                  {validityResult.redemptionHistory.alreadyRedeemedToday ? 'Yes (limit reached)' : 'No'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Total Visits</span>
                <span className="text-sm font-bold text-gray-900">{validityResult.redemptionHistory.totalRedemptionsAtBusiness}</span>
              </div>
              {validityResult.redemptionHistory.lastRedemptions.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Recent Redemptions:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {validityResult.redemptionHistory.lastRedemptions.map((date, i) => (
                      <span key={i} className="px-2 py-0.5 rounded bg-gray-50 text-[10px] font-medium text-gray-600 border border-gray-200">
                        {new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pb-5">
            {validityResult.canRedeem && (
              <button onClick={handleProceedToRedeem} className="flex-1 py-3.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-bold hover:from-teal-700 hover:to-emerald-700 transition-all shadow-lg shadow-teal-200/50 flex items-center justify-center gap-2">
                <Zap className="w-5 h-5" />Proceed to Redeem
              </button>
            )}
            <button onClick={handleReset} className={`${validityResult.canRedeem ? '' : 'flex-1'} py-3.5 px-5 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2`}>
              <ScanLine className="w-5 h-5" />Scan Another
            </button>
            <button onClick={() => { stopCamera(); onClose(); }} className="py-3.5 px-5 rounded-xl bg-gray-100 text-gray-700 font-bold hover:bg-gray-200 transition-colors">
              Done
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ═══ RENDER: VALIDITY CHECK FAILURE ═══
  const renderValidityFailure = () => {
    if (!validityResult) return null;
    return (
      <div className="space-y-4 -mx-5 -mt-5">
        <div className="relative bg-gradient-to-br from-red-500 via-rose-500 to-red-600 px-6 pt-8 pb-6 overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/5 -mr-10 -mt-10" />
          <div className="relative text-center">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border-2 border-white/30">
              <XCircle className="w-10 h-10 text-white" />
            </div>
            <h3 className="text-2xl font-extrabold text-white mb-1">Validity Check Failed</h3>
            <p className="text-red-100 text-sm font-medium">Could not verify the pass</p>
          </div>
        </div>

        <div className="px-5 space-y-4">
          <div className="bg-red-50 rounded-2xl border border-red-200 p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-red-800 mb-1">Error Details</h4>
                <p className="text-sm text-red-700 leading-relaxed">{validityResult.error}</p>
              </div>
            </div>
            <div className="mt-4 p-3 rounded-xl bg-blue-50 border border-blue-100">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-blue-700 font-medium">Make sure the tourist is showing a valid StikmNek pass QR code. The code should be from their tourist dashboard.</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 pb-5">
            <button onClick={handleReset} className="flex-1 py-3.5 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2">
              <RotateCcw className="w-5 h-5" />Try Again
            </button>
            <button onClick={() => { stopCamera(); onClose(); }} className="flex-1 py-3.5 rounded-xl bg-gray-100 text-gray-700 font-bold hover:bg-gray-200 transition-colors">
              Close
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

        {/* Header - only show when not displaying full-bleed results */}
        {!(result?.success && result?.redemption) && !(result && !result.success) && !(validityResult?.success) && !(validityResult && !validityResult.success) && (
          <div className="flex items-center justify-between p-5 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white ${
                scanPurpose === 'check'
                  ? 'bg-gradient-to-br from-blue-500 to-indigo-500'
                  : 'bg-gradient-to-br from-teal-500 to-emerald-500'
              }`}>
                {scanPurpose === 'check' ? <Eye className="w-5 h-5" /> : <ScanLine className="w-5 h-5" />}
              </div>
              <div>
                <h2 className="font-bold text-gray-900">
                  {redeemSubStep === 'pick_offer'
                    ? 'Select offer redeemed'
                    : redeemSubStep === 'no_offers'
                      ? 'Pass verified'
                      : scanPurpose === 'check'
                        ? 'Check Voucher Validity'
                        : 'Scan & Redeem'}
                </h2>
                <p className="text-xs text-gray-500">
                  {redeemSubStep === 'pick_offer'
                    ? 'Tap the listing this discount applies to'
                    : redeemSubStep === 'no_offers'
                      ? 'No active listing on your account'
                      : preferredBusinessName || 'Your active listings'}
                </p>
              </div>
            </div>
            <button
              onClick={() => { stopCamera(); onClose(); }}
              className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        )}

        {/* Close button for full-bleed result screens */}
        {(hasResult) && (
          <button
            onClick={() => { stopCamera(); onClose(); }}
            className="absolute top-4 right-4 z-10 p-2 rounded-xl bg-white/20 backdrop-blur-sm hover:bg-white/40 transition-colors"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        )}

        {/* Purpose Toggle */}
        {!hasResult && !verifying && !inOfferFlow && (
          <div className="px-5 pt-4">
            <div className="flex items-center gap-1.5 p-1 bg-gray-100 rounded-xl">
              <button
                onClick={() => setScanPurpose('redeem')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                  scanPurpose === 'redeem'
                    ? 'bg-white text-teal-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                Verify & Redeem
              </button>
              <button
                onClick={() => setScanPurpose('check')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                  scanPurpose === 'check'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                Check Validity Only
              </button>
            </div>
            {scanPurpose === 'check' && (
              <p className="text-[10px] text-blue-600 text-center mt-1.5 font-medium">
                Checks pass & voucher validity without recording a redemption
              </p>
            )}
          </div>
        )}

        {/* Input Mode Toggle */}
        {!hasResult && !verifying && !inOfferFlow && (
          <div className="flex items-center gap-2 px-5 pt-3 pb-0">
            <button
              onClick={() => { setInputMode('camera'); setCameraError(null); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all ${
                inputMode === 'camera'
                  ? (scanPurpose === 'check' ? 'bg-blue-600 text-white shadow-sm' : 'bg-teal-600 text-white shadow-sm')
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Camera className="w-4 h-4" />
              Camera Scan
            </button>
            <button
              onClick={() => { stopCamera(); setInputMode('manual'); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all ${
                inputMode === 'manual'
                  ? (scanPurpose === 'check' ? 'bg-blue-600 text-white shadow-sm' : 'bg-teal-600 text-white shadow-sm')
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Keyboard className="w-4 h-4" />
              Manual Entry
            </button>
          </div>
        )}

        {/* Content */}
        <div className="p-5">
          {/* ═══ CAMERA MODE ═══ */}
          {inputMode === 'camera' && !hasResult && !verifying && !inOfferFlow && (
            <div>
              {cameraError ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-50 flex items-center justify-center">
                    <AlertTriangle className="w-8 h-8 text-red-500" />
                  </div>
                  <p className="text-sm text-red-600 mb-4">{cameraError}</p>
                  <div className="flex items-center gap-3 justify-center">
                    <button onClick={startCamera} className="px-4 py-2 rounded-xl bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 transition-colors flex items-center gap-2">
                      <RotateCcw className="w-4 h-4" />Retry
                    </button>
                    <button onClick={() => { setInputMode('manual'); setCameraError(null); }} className="px-4 py-2 rounded-xl bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 transition-colors">
                      Use Manual Entry
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="relative rounded-2xl overflow-hidden bg-black aspect-[4/3]">
                    <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                    <canvas ref={canvasRef} className="hidden" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="relative w-48 h-48">
                        <div className="absolute top-0 left-0 w-8 h-8 border-t-3 border-l-3 border-teal-400 rounded-tl-lg" style={{ borderWidth: '3px' }} />
                        <div className="absolute top-0 right-0 w-8 h-8 border-t-3 border-r-3 border-teal-400 rounded-tr-lg" style={{ borderWidth: '3px' }} />
                        <div className="absolute bottom-0 left-0 w-8 h-8 border-b-3 border-l-3 border-teal-400 rounded-bl-lg" style={{ borderWidth: '3px' }} />
                        <div className="absolute bottom-0 right-0 w-8 h-8 border-b-3 border-r-3 border-teal-400 rounded-br-lg" style={{ borderWidth: '3px' }} />
                        <div className="absolute left-2 right-2 h-0.5 bg-teal-400 animate-bounce opacity-75" style={{ top: '50%' }} />
                      </div>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/70 to-transparent">
                      <div className="flex items-center justify-center gap-2">
                        {cameraReady ? (
                          <>
                            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                            <span className="text-white text-xs font-medium">
                              {hasBarcodeDetector ? 'Scanning for QR code...' : 'Camera ready - use manual entry for best results'}
                            </span>
                          </>
                        ) : (
                          <><Loader2 className="w-4 h-4 text-white animate-spin" /><span className="text-white text-xs">Starting camera...</span></>
                        )}
                      </div>
                    </div>
                  </div>
                  {!hasBarcodeDetector && cameraReady && (
                    <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
                      <p className="text-xs text-amber-700"><strong>Tip:</strong> Your browser doesn't support automatic QR scanning. Ask the tourist to copy their pass code and use the Manual Entry tab.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ═══ MANUAL ENTRY MODE ═══ */}
          {inputMode === 'manual' && !hasResult && !verifying && !inOfferFlow && (
            <form onSubmit={handleManualSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Paste Tourist's Pass Code</label>
                <textarea
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  placeholder='Paste the pass code here (e.g. {"type":"stikm_nek_pass",...})'
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none h-32 font-mono text-xs"
                  autoFocus
                />
              </div>
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-100">
                <p className="text-xs text-blue-700"><strong>How to get the code:</strong> Ask the tourist to open their dashboard, find their QR code, and tap "Copy pass code" below it. Then paste it here.</p>
              </div>
              <button
                type="submit"
                disabled={!manualCode.trim()}
                className={`w-full py-3.5 rounded-xl text-white font-bold transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                  scanPurpose === 'check'
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-blue-200'
                    : 'bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 shadow-teal-200'
                }`}
              >
                {scanPurpose === 'check' ? <Eye className="w-5 h-5" /> : <Zap className="w-5 h-5" />}
                {scanPurpose === 'check' ? 'Check Voucher Validity' : 'Verify & Redeem Discount'}
              </button>
            </form>
          )}

          {/* ═══ OFFER SELECTION (after pass verified, redeem flow) ═══ */}
          {redeemSubStep === 'pick_offer' && verifiedForOfferFlow && !result && (
            <div className="space-y-4">
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <BadgeCheck className="w-5 h-5 text-emerald-600" />
                  <span className="text-sm font-extrabold text-emerald-900">Valid pass</span>
                </div>
                <p className="text-xs text-emerald-800">
                  {verifiedForOfferFlow.tourist?.name} · {getPassDisplayTitle(verifiedForOfferFlow.pass?.type || 'weekly', 'en')}
                </p>
                {(() => {
                  const p = partyFromValidityApi(verifiedForOfferFlow.party);
                  return (
                    <p className="text-[11px] text-emerald-900 font-semibold mt-2 pt-2 border-t border-emerald-200/80">
                      Group on profile: {p.adults} adult{p.adults !== 1 ? 's' : ''}
                      {p.children > 0 ? `, ${p.children} child${p.children !== 1 ? 'ren' : ''}` : ''}
                      {p.infants > 0 ? `, ${p.infants} infant${p.infants !== 1 ? 's' : ''}` : ''}
                      <span className="block font-normal text-emerald-800/90 mt-0.5">Savings below use this party size (from tourist profile).</span>
                    </p>
                  );
                })()}
              </div>
              <p className="text-sm font-bold text-gray-900">Which listing was this discount for?</p>
              <div className="space-y-2 max-h-[min(50vh,320px)] overflow-y-auto pr-1">
                {ownerListings.map((listing) => {
                  const selected = selectedListingId === listing.id;
                  const line = formatOfferDiscountLine(listing);
                  const party = partyFromValidityApi(verifiedForOfferFlow.party);
                  const savings = computeRedemptionSavingsForListing(listing, party);
                  return (
                    <button
                      key={listing.id}
                      type="button"
                      onClick={() => setSelectedListingId(listing.id)}
                      className={`w-full text-left rounded-xl border-2 p-3 transition-all ${
                        selected
                          ? 'border-teal-500 bg-teal-50 shadow-sm'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <p className="text-sm font-extrabold text-gray-900">{listing.name}</p>
                      <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{line}</p>
                      {savings.savedAmount > 0 && (
                        <p className="text-[11px] font-bold text-teal-800 mt-2 leading-snug">{savings.savingsLine}</p>
                      )}
                      {savings.savedAmount <= 0 && (listing.original_price != null && listing.deal_price != null) && (
                        <p className="text-[10px] text-gray-500 mt-1">
                          {Number(listing.original_price)} VT → {Number(listing.deal_price)} VT (per person — add tier or profile party for totals)
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                disabled={!selectedListingId || verifying}
                onClick={() => void confirmSelectedOffer()}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-bold hover:from-teal-700 hover:to-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {verifying ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
                Record redemption
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="w-full py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          )}

          {redeemSubStep === 'no_offers' && verifiedForOfferFlow && !result && (
            <div className="space-y-4 text-center py-2">
              <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 flex items-center justify-center">
                <BadgeCheck className="w-8 h-8 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-gray-900">Valid pass</h3>
                <p className="text-sm text-gray-600 mt-1">
                  {verifiedForOfferFlow.tourist?.name} — pass is active, but you have no active listings to attach this redemption to.
                </p>
              </div>
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-left">
                <p className="text-xs font-bold text-amber-900 mb-1">No active discounts found</p>
                <p className="text-xs text-amber-800">
                  Activate a listing in your dashboard or contact support. Redemption was not recorded.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleReset}
                  className="flex-1 py-3 rounded-xl bg-teal-600 text-white font-bold hover:bg-teal-700"
                >
                  Scan another
                </button>
                <button
                  type="button"
                  onClick={() => { stopCamera(); onClose(); }}
                  className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 font-bold hover:bg-gray-200"
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {/* ═══ VERIFYING STATE (ENHANCED) ═══ */}
          {verifying && renderVerifyingState()}

          {/* ═══ RESULT: VALIDITY CHECK SUCCESS (ENHANCED) ═══ */}
          {validityResult && validityResult.success && renderValiditySuccess()}

          {/* ═══ RESULT: VALIDITY CHECK ERROR (ENHANCED) ═══ */}
          {validityResult && !validityResult.success && renderValidityFailure()}

          {/* ═══ RESULT: REDEEM SUCCESS (ENHANCED) ═══ */}
          {result && result.success && result.redemption && renderRedeemSuccess()}

          {/* ═══ RESULT: REDEEM ERROR (ENHANCED) ═══ */}
          {result && !result.success && renderRedeemFailure()}
        </div>
      </div>
    </div>
  );
};

export default QRScanner;
