import React, { useMemo, useEffect, useState } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { getBasePeople, getShareBonusTotalPeople, getPassDisplayTitle } from '@/data/pricing';
import type { PassProductId } from '@/data/passCatalog';
import { inclusiveCalendarDaysBetween } from '@/lib/passValidity';
import { supabase } from '@/lib/supabase';
import { QrCode, Calendar, Shield, Ticket, Copy, Check } from 'lucide-react';

function toDateOnly(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

const QRCodeDisplay: React.FC = () => {
  const { user, language } = useAppContext();
  const [copied, setCopied] = useState(false);
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

  const effectiveMaxPeople =
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

  const passDurationDays = useMemo(() => {
    if (!validFrom || !validUntil) return null;
    return inclusiveCalendarDaysBetween(validFrom, validUntil);
  }, [validFrom, validUntil]);

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
              {effectiveMaxPeople ?? getBasePeople(user.pass)} people
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
              {validFrom
                ? new Date(validFrom + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                : '-'}
              {' – '}
              {validUntil
                ? new Date(validUntil + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                : '-'}
              {passDurationDays != null && (
                <span className="block text-xs font-semibold text-teal-700 mt-0.5">
                  {passDurationDays} day{passDurationDays !== 1 ? 's' : ''} total
                  {shareApplied ? ' · Share bonus included' : ''}
                </span>
              )}
            </span>
          </div>

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
