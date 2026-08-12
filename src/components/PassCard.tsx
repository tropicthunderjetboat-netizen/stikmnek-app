import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { clampPartySize, getBasePeople, getShareBonusTotalPeople } from '@/data/pricing';
import { getHolidayPassMaskDisplay } from '@/lib/holidayPassDisplay';
import { inclusiveCalendarDaysBetween } from '@/lib/passValidity';
import { supabase } from '@/lib/supabase';
import { t, type Language } from '@/data/translations';
import { Loader2, Share2 } from 'lucide-react';
import { toast } from 'sonner';

function toDateOnly(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function toPassLang(language: string | undefined): Language {
  return language === 'fr' ? 'fr' : 'en';
}

/** Short support ID from pass UUID, e.g. SMK-8821 */
export function formatShortPassId(passId: string): string {
  const hex = passId.replace(/-/g, '').slice(-4);
  const n = Number.parseInt(hex, 16);
  if (!Number.isFinite(n)) return 'SMK-0000';
  return `SMK-${String(n % 10000).padStart(4, '0')}`;
}

function formatValidUntilBanner(dateStr: string | null, language: Language): string {
  if (!dateStr) return '—';
  const loc = language === 'fr' ? 'fr-FR' : 'en-GB';
  const d = new Date(`${dateStr.slice(0, 10)}T12:00:00`);
  const day = d.toLocaleDateString(loc, { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase();
  return `${day} - 5PM`;
}

function formatLiveClock(d: Date): string {
  return d.toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export type PassCardProps = {
  /** Compact modal vs full dashboard */
  size?: 'default' | 'compact';
  className?: string;
  /** Show share-to-unlock second week prompt when applicable */
  showSharePrompt?: boolean;
};

/**
 * Visual Holiday Pass — high-contrast teal card for staff to read in sunlight.
 * No QR code; live clock proves the screen is current.
 */
const PassCard: React.FC<PassCardProps> = ({
  size = 'default',
  className = '',
  showSharePrompt = true,
}) => {
  const { user, language, refreshUserPass } = useAppContext();
  const passLang = toPassLang(language);
  const [now, setNow] = useState(() => new Date());
  const [shareBusy, setShareBusy] = useState(false);
  const [passRow, setPassRow] = useState<{
    validFrom: string | null;
    validUntil: string | null;
    maxPeople: number | null;
    shareBonusApplied: boolean;
  } | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

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
      .channel(`pass-card-${user.passId}`)
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
  const dayCount =
    passMask.displayDayCount ||
    inclusiveCalendarDaysBetween(validFrom || undefined, displayValidUntil || undefined) ||
    7;

  const partySize = clampPartySize(passPurchasedCapacity ?? user?.passPeopleCount ?? 1);
  const guestLabel = partySize === 1 ? '1 Guest' : `${partySize} Guests`;

  const passKind =
    dayCount >= 14
      ? 'HOLIDAY 14-DAY'
      : dayCount >= 7
        ? 'HOLIDAY 7-DAY'
        : '1-DAY';

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
          share_proof: `pass_${Date.now()}_display`,
          platform: 'pass-card',
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
  }, [user?.id, shareBusy, refreshUserPass, passLang]);

  if (!user || !user.pass || !user.passId) {
    return null;
  }

  const shortId = formatShortPassId(user.passId);
  const pad = size === 'compact' ? 'p-4 sm:p-5' : 'p-5 sm:p-6';

  return (
    <div
      className={`relative overflow-hidden rounded-2xl text-white shadow-xl shadow-teal-900/30 ${className}`}
      style={{
        background: 'linear-gradient(145deg, #0d9488 0%, #0f766e 45%, #115e59 100%)',
      }}
    >
      <div className={`relative z-10 ${pad} space-y-3 sm:space-y-4`}>
        {/* Row 1 */}
        <p className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.14em] text-teal-100/95">
          STIKMNEK PASS · {passKind}
        </p>

        {/* Row 2 */}
        <div>
          <p
            className={`font-black uppercase leading-tight tracking-tight text-white drop-shadow-sm ${
              size === 'compact' ? 'text-2xl sm:text-3xl' : 'text-3xl sm:text-4xl'
            }`}
          >
            {user.name}
          </p>
          <p className="mt-1 text-base sm:text-lg font-bold text-teal-50">
            Party: {guestLabel}
          </p>
        </div>

        {/* Row 3 — live validation */}
        <div className="flex items-center gap-2.5 rounded-xl bg-black/20 px-3 py-2.5 ring-1 ring-white/15">
          <span className="relative flex h-3 w-3 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-400" />
          </span>
          <p className="text-sm sm:text-base font-black tracking-wide text-white">
            ✓ VALID · {formatLiveClock(now)}
          </p>
        </div>

        {/* Row 4 */}
        <div>
          <p className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-teal-200/90">
            Valid until
          </p>
          <p
            className={`mt-0.5 font-black uppercase leading-tight text-white ${
              size === 'compact' ? 'text-xl sm:text-2xl' : 'text-2xl sm:text-3xl'
            }`}
          >
            {formatValidUntilBanner(displayValidUntil, passLang)}
          </p>
        </div>

        {/* Row 5 */}
        <p className="text-[11px] sm:text-xs font-medium leading-snug text-teal-100/85">
          Pass ID: {shortId} · Non-transferable · Name must match ID
        </p>

        {showSharePrompt && passMask.isHolidayPass && passMask.showFirstWeekOnly && (
          <div className="rounded-xl border border-amber-200/40 bg-amber-50/95 p-3 text-left">
            <p className="text-xs font-semibold text-amber-950 mb-2">
              {t('share.qr_holiday_prompt', passLang)}
            </p>
            <button
              type="button"
              onClick={() => void handleUnlockSecondWeek()}
              disabled={shareBusy}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-teal-700 text-white text-sm font-bold hover:bg-teal-800 disabled:opacity-60"
            >
              {shareBusy ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {language === 'fr' ? 'Partage…' : 'Sharing…'}
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
      </div>
    </div>
  );
};

export default PassCard;
