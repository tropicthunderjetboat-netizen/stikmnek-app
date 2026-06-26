import React, { useMemo, useEffect, useState, useCallback } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { getBasePeople, getShareBonusTotalPeople, getPassDisplayTitle } from '@/data/pricing';
import type { PassProductId } from '@/data/passCatalog';
import { getHolidayPassMaskDisplay } from '@/lib/holidayPassDisplay';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { t, type Language } from '@/data/translations';
import { QrCode, Calendar, Shield, Ticket, Copy, Check, Share2, Loader2 } from 'lucide-react';

function toDateOnly(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function toPassLang(language: string | undefined): Language {
  return language === 'fr' ? 'fr' : language === 'bi' ? 'bi' : 'en';
}

const QRCodeDisplay: React.FC = () => {
  const { user, language, refreshUserPass } = useAppContext();
  const passLang = toPassLang(language);
  const [copied, setCopied] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  /** Fresh row from DB so QR + dates update after extend-pass even if context lags. */
  const [passRow, setPassRow] = useState<{
    validFrom: string | null;
    validUntil: string | null;
    maxPeople: number | null;
    shareBonusApplied: boolean;
  } | null>(null);

  useEffect(() => {
    if (!user?.passId) {
      setPassRow(null);
      return;
    }
    let cancelled = false;

    const load = async () => {
      const { data, error } = await supabase
        .from('passes')
        .select('valid_from, valid_until, max_people, share_bonus_applied')
        .eq('id', user.passId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) return;
      setPassRow({
        validFrom: toDateOnly(data.valid_from),
        validUntil: toDateOnly(data.valid_until),
        maxPeople: typeof data.max_people === 'number' ? data.max_people : null,
        shareBonusApplied: !!data.share_bonus_applied,
      });
    };

    void load();

    const channel = supabase
      .channel(`qr-pass-${user.passId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'passes', filter: `id=eq.${user.passId}` },
        () => {
          void load();
        },
      )
      .subscribe();

    const onVis = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      void supabase.removeChannel(channel);
    };
  }, [user?.passId, user?.passValidUntil]);

  const validFrom = passRow?.validFrom ?? user?.passValidFrom ?? null;
  const validUntil = passRow?.validUntil ?? user?.passValidUntil ?? null;
  const shareApplied =
    passRow != null ? passRow.shareBonusApplied : !!(user?.shareBonusApplied ?? false);

  const passPurchasedCapacity =
    user?.pass == null
      ? null
      : (passRow?.maxPeople ??
          user.passPeopleCount ??
          (shareApplied ? getShareBonusTotalPeople(user.pass) : getBasePeople(user.pass)));

  /** QR encodes only the pass UUID — verify-redemption loads user + validity from DB. */
  const qrPayload = useMemo(() => {
    if (!user || !user.pass || !user.passId) return null;
    return user.passId;
  }, [user?.pass, user?.passId]);

  // Generate QR code URL using qrserver.com API
  const qrCodeUrl = useMemo(() => {
    if (!qrPayload) return null;
    const encoded = encodeURIComponent(qrPayload);
    return `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encoded}&color=0d9488&bgcolor=ffffff&margin=8`;
  }, [qrPayload]);

  const passMask = useMemo(
    () =>
      getHolidayPassMaskDisplay({
        validFrom,
        validUntil,
        shareBonusApplied: shareApplied,
        isExtendedPass: null,
      }),
    [validFrom, validUntil, shareApplied],
  );

  const displayValidUntil = passMask.showFirstWeekOnly ? passMask.displayUntilDateStr : validUntil;
  const displayPeriodDays = passMask.displayDayCount;

  const fmtShort = useCallback(
    (ds: string | null) => {
      if (!ds) return '-';
      const loc = language === 'fr' ? 'fr-FR' : 'en-US';
      return new Date(`${ds.slice(0, 10)}T12:00:00`).toLocaleDateString(loc, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    },
    [language],
  );

  const handleUnlockSecondWeek = useCallback(async () => {
    if (!user?.id || shareBusy) return;
    setShareBusy(true);
    try {
      let shareSucceeded = false;
      const shareData = {
        title: 'StikmNek',
        text: t('share.holiday_navigator_body', passLang),
        url: typeof window !== 'undefined' ? window.location.origin : '',
      };
      if (navigator.share) {
        try {
          await navigator.share(shareData);
          shareSucceeded = true;
        } catch (e: unknown) {
          const name = e && typeof e === 'object' && 'name' in e ? String((e as { name?: string }).name) : '';
          if (name === 'AbortError') {
            setShareBusy(false);
            return;
          }
          try {
            await navigator.clipboard.writeText(`${shareData.text}\n${shareData.url}`);
            shareSucceeded = true;
            toast.success('Link copied — claiming bonus…');
          } catch {
            toast.error('Could not share or copy link.');
            return;
          }
        }
      } else {
        try {
          await navigator.clipboard.writeText(`${shareData.text}\n${shareData.url}`);
          shareSucceeded = true;
          toast.success('Link copied — claiming bonus…');
        } catch {
          toast.error('Could not copy link.');
          return;
        }
      }
      if (!shareSucceeded) return;

      const { data, error } = await supabase.functions.invoke('extend-pass', {
        body: {
          user_id: user.id,
          share_proof: `qr_${Date.now()}_display`,
          platform: 'qr-display',
        },
      });
      if (error) {
        toast.error(typeof error.message === 'string' ? error.message : 'Could not apply bonus');
        return;
      }
      const d = data as {
        success?: boolean;
        already_claimed?: boolean;
        share_bonus_ineligible?: boolean;
        code?: string;
        error?: string;
        bonus?: { days?: number };
      };
      if (d?.share_bonus_ineligible || d?.code === 'no_active_pass') {
        toast.info(d.error || 'Share bonus is only available on a 7-day holiday pass.');
        return;
      }
      if (d?.already_claimed) {
        toast.info('Share bonus already applied.');
        await refreshUserPass();
        return;
      }
      if (d?.success) {
        const bd = d.bonus?.days ?? 0;
        if (bd > 0) {
          toast.success('Second week unlocked!');
        } else {
          toast.info(d.error || 'No bonus applied for this pass.');
        }
        await refreshUserPass();
        return;
      }
      toast.error(d?.error ?? 'Could not apply bonus');
    } finally {
      setShareBusy(false);
    }
  }, [user?.id, shareBusy, refreshUserPass, language]);

  const handleCopyCode = () => {
    if (qrPayload) {
      navigator.clipboard.writeText(qrPayload).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  if (!user || !user.pass || !user.passId) {
    return null;
  }

  const passColors: Record<PassProductId, string> = {
    dynamic: 'from-teal-500 to-emerald-600',
  };

  const passBgColors: Record<PassProductId, string> = {
    dynamic: 'bg-teal-50 border-teal-200',
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className={`bg-gradient-to-r ${passColors[user.pass] ?? passColors.dynamic} p-5 text-white`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg">Your Pass QR Code</h3>
              <p className="text-white/90 text-xs font-semibold leading-snug">{getPassDisplayTitle(user.pass, language)}</p>
              <p className="text-white/75 text-[11px] mt-0.5">Show this to businesses to redeem discounts</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 text-xs font-bold">
            <div className="w-1.5 h-1.5 rounded-full bg-green-300 animate-pulse" />
            Active
          </div>
        </div>
      </div>

      {/* QR Code */}
      <div className="p-6 flex flex-col items-center">
        <div className={`p-4 rounded-2xl border-2 ${passBgColors[user.pass] ?? passBgColors.dynamic} mb-4`}>
          {qrCodeUrl ? (
            <img
              src={qrCodeUrl}
              alt="Your StikmNek Pass QR Code"
              className="w-[280px] h-[280px] rounded-xl"
              loading="eager"
            />
          ) : (
            <div className="w-[280px] h-[280px] rounded-xl bg-gray-100 flex items-center justify-center">
              <QrCode className="w-16 h-16 text-gray-300" />
            </div>
          )}
        </div>

        {/* Pass Info */}
        <div className="w-full space-y-3">
          <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50">
            <div className="flex items-center gap-2">
              <Ticket className="w-4 h-4 text-teal-600" />
              <span className="text-sm text-gray-600">Valid for</span>
            </div>
            <span className="text-sm font-bold text-gray-900">
              {passPurchasedCapacity ?? getBasePeople(user.pass)} people
              {shareApplied && (
                <span className="ml-1.5 text-xs font-medium text-emerald-600">(Share bonus applied)</span>
              )}
            </span>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-teal-600" />
              <span className="text-sm text-gray-600">Valid Period</span>
            </div>
            <span className="text-sm font-bold text-gray-900 text-right">
              {fmtShort(validFrom)}
              {' – '}
              {fmtShort(displayValidUntil)}
              {displayPeriodDays > 0 && (
                <span className="block text-xs font-semibold text-teal-700 mt-0.5">
                  {displayPeriodDays} day{displayPeriodDays !== 1 ? 's' : ''}
                  {passMask.showFirstWeekOnly
                    ? t('share.qr_period_bonus_hint', passLang)
                    : shareApplied
                      ? ' · Share bonus included'
                      : ' total'}
                </span>
              )}
            </span>
          </div>

          {passMask.isHolidayPass && passMask.showFirstWeekOnly && (
            <div className="p-3 rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50">
              <p className="text-xs font-semibold text-amber-900 mb-2">
                {t('share.qr_holiday_prompt', passLang)}
              </p>
              <button
                type="button"
                onClick={() => void handleUnlockSecondWeek()}
                disabled={shareBusy}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-bold hover:from-amber-600 hover:to-orange-600 disabled:opacity-60"
              >
                {shareBusy ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {language === 'fr' ? 'Partage…' : language === 'bi' ? 'Plis raetem wan komen abaotem eksperiens blong yu' : 'Sharing…'}
                  </>
                ) : (
                  <>
                    <Share2 className="w-4 h-4" />
                    {t('share.qr_unlock_button', passLang)}
                  </>
                )}
              </button>
            </div>
          )}

          <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-teal-600" />
              <span className="text-sm text-gray-600">Pass Holder</span>
            </div>
            <span className="text-sm font-bold text-gray-900">{user.name}</span>
          </div>
        </div>

        {/* Copy Button (for manual entry fallback) */}
        <button
          onClick={handleCopyCode}
          className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4 text-green-600" />
              <span className="text-green-600 font-medium">Copied to clipboard!</span>
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              <span>Copy pass code (for manual entry)</span>
            </>
          )}
        </button>

        {/* Instructions */}
        <div className="mt-4 p-4 rounded-xl bg-blue-50 border border-blue-100 w-full">
          <p className="text-xs font-semibold text-blue-800 mb-1">How to use your QR code:</p>
          <ol className="text-xs text-blue-700 space-y-1 list-decimal list-inside">
            <li>Visit any participating business</li>
            <li>Show this QR code to the staff</li>
            <li>They will scan it to verify your pass</li>
            <li>Enjoy your discount automatically!</li>
          </ol>
        </div>
      </div>
    </div>
  );
};

export default QRCodeDisplay;
