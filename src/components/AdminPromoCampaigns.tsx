import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import {
  Gift, Loader2, RefreshCw, ToggleLeft, ToggleRight, Users, Ticket, Star,
} from 'lucide-react';
import { FIRST25_CAMPAIGN_CODE } from '@/lib/promoCampaign';

type CampaignRow = {
  id: string;
  code: string;
  label: string;
  max_claims: number;
  claims_count: number;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
};

type ClaimRow = {
  id: string;
  email_normalized: string;
  claimed_at: string;
  user_id: string;
  pass_id: string | null;
  pass?: {
    id: string;
    valid_from: string | null;
    valid_until: string | null;
    active: boolean | null;
    original_price: number | null;
  } | null;
  redemption_count: number;
  review_count: number;
};

const AdminPromoCampaigns: React.FC = () => {
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [selectedCode, setSelectedCode] = useState(FIRST25_CAMPAIGN_CODE);

  const load = useCallback(async (showToast = false) => {
    try {
      const { data: camps, error: campErr } = await supabase
        .from('promo_campaigns')
        .select('id, code, label, max_claims, claims_count, is_active, starts_at, ends_at')
        .order('created_at', { ascending: true });

      if (campErr) throw campErr;
      setCampaigns((camps || []) as CampaignRow[]);

      const camp =
        (camps || []).find((c) => c.code === selectedCode) ||
        (camps || [])[0] ||
        null;
      if (!camp) {
        setClaims([]);
        return;
      }

      const { data: claimRows, error: claimErr } = await supabase
        .from('promo_claims')
        .select('id, email_normalized, claimed_at, user_id, pass_id')
        .eq('campaign_id', camp.id)
        .order('claimed_at', { ascending: false });

      if (claimErr) throw claimErr;

      const rows = (claimRows || []) as Omit<ClaimRow, 'redemption_count' | 'review_count' | 'pass'>[];
      const passIds = rows.map((r) => r.pass_id).filter(Boolean) as string[];
      const userIds = [...new Set(rows.map((r) => r.user_id))];

      const passesById = new Map<string, ClaimRow['pass']>();
      if (passIds.length > 0) {
        const { data: passes } = await supabase
          .from('passes')
          .select('id, valid_from, valid_until, active, original_price')
          .in('id', passIds);
        for (const p of passes || []) {
          passesById.set(String((p as { id: string }).id), p as ClaimRow['pass']);
        }
      }

      const redemptionByUser = new Map<string, number>();
      const reviewByUser = new Map<string, number>();
      if (userIds.length > 0) {
        const { data: reds } = await supabase
          .from('redemptions')
          .select('user_id')
          .in('user_id', userIds);
        for (const r of reds || []) {
          const uid = String((r as { user_id: string }).user_id);
          redemptionByUser.set(uid, (redemptionByUser.get(uid) || 0) + 1);
        }
        const { data: revs } = await supabase
          .from('reviews')
          .select('user_id')
          .in('user_id', userIds);
        for (const r of revs || []) {
          const uid = String((r as { user_id: string }).user_id);
          reviewByUser.set(uid, (reviewByUser.get(uid) || 0) + 1);
        }
      }

      setClaims(
        rows.map((r) => ({
          ...r,
          pass: r.pass_id ? passesById.get(r.pass_id) ?? null : null,
          redemption_count: redemptionByUser.get(r.user_id) || 0,
          review_count: reviewByUser.get(r.user_id) || 0,
        })),
      );

      if (showToast) toast.success('Promo data refreshed');
    } catch (err: unknown) {
      console.error('[AdminPromoCampaigns]', err);
      toast.error(err instanceof Error ? err.message : 'Failed to load promo campaigns');
    }
  }, [selectedCode]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const toggleActive = async (camp: CampaignRow) => {
    setTogglingId(camp.id);
    try {
      const { error } = await supabase
        .from('promo_campaigns')
        .update({ is_active: !camp.is_active, updated_at: new Date().toISOString() })
        .eq('id', camp.id);
      if (error) throw error;
      toast.success(camp.is_active ? 'Promo paused' : 'Promo activated');
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not update promo');
    } finally {
      setTogglingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-500 gap-2">
        <Loader2 className="w-5 h-5 animate-spin" /> Loading promos…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-extrabold text-gray-900 flex items-center gap-2">
            <Gift className="w-5 h-5 text-teal-600" />
            Promo Campaigns
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Free traveler passes for cold-start trust. Pause anytime — no deploy needed.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {campaigns.map((camp) => {
          const remaining = Math.max(0, camp.max_claims - camp.claims_count);
          const pct = camp.max_claims > 0 ? Math.min(100, (camp.claims_count / camp.max_claims) * 100) : 0;
          return (
            <div
              key={camp.id}
              className={`rounded-2xl border bg-white p-5 shadow-sm ${
                selectedCode === camp.code ? 'border-teal-400 ring-2 ring-teal-100' : 'border-gray-100'
              }`}
            >
              <button
                type="button"
                className="w-full text-left"
                onClick={() => setSelectedCode(camp.code)}
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">
                      {camp.code}
                    </p>
                    <p className="font-bold text-gray-900 mt-0.5">{camp.label}</p>
                  </div>
                  <span
                    className={`text-xs font-bold px-2 py-1 rounded-full ${
                      camp.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {camp.is_active ? 'Active' : 'Paused'}
                  </span>
                </div>
                <p className="text-2xl font-extrabold text-gray-900 mt-3">
                  {camp.claims_count}{' '}
                  <span className="text-base font-semibold text-gray-400">/ {camp.max_claims}</span>
                </p>
                <p className="text-xs text-gray-500 mt-1">{remaining} free passes left</p>
                <div className="mt-3 h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-teal-600 to-emerald-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </button>
              <button
                type="button"
                disabled={togglingId === camp.id}
                onClick={() => void toggleActive(camp)}
                className="mt-4 w-full flex items-center justify-center gap-2 min-h-10 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {togglingId === camp.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : camp.is_active ? (
                  <ToggleRight className="w-4 h-4 text-teal-600" />
                ) : (
                  <ToggleLeft className="w-4 h-4 text-gray-400" />
                )}
                {camp.is_active ? 'Pause promo' : 'Activate promo'}
              </button>
            </div>
          );
        })}
      </div>

      {campaigns.length === 0 ? (
        <p className="text-sm text-gray-500">
          No promo campaigns found. Run migration{' '}
          <code className="text-xs bg-gray-100 px-1 rounded">20260805120000_promo_first_25_travelers</code>.
        </p>
      ) : null}

      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <Users className="w-4 h-4 text-teal-600" />
          <h3 className="font-bold text-gray-900">Claims · {selectedCode}</h3>
          <span className="text-xs text-gray-400 ml-auto">claimed → redeemed → reviewed</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">Claimed</th>
                <th className="px-4 py-3 font-semibold">Trip dates</th>
                <th className="px-4 py-3 font-semibold">Redemptions</th>
                <th className="px-4 py-3 font-semibold">Reviews</th>
                <th className="px-4 py-3 font-semibold">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {claims.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    No claims yet
                  </td>
                </tr>
              ) : (
                claims.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50/80">
                    <td className="px-4 py-3 font-medium text-gray-900">{c.email_normalized}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {new Date(c.claimed_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {c.pass?.valid_from && c.pass?.valid_until ? (
                        <span className="inline-flex items-center gap-1">
                          <Ticket className="w-3.5 h-3.5 text-teal-600" />
                          {c.pass.valid_from} → {c.pass.valid_until}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${
                          c.redemption_count > 0
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {c.redemption_count}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${
                          c.review_count > 0
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        <Star className="w-3 h-3" />
                        {c.review_count}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      A${Number(c.pass?.original_price ?? 0).toFixed(0)}{' '}
                      <span className="text-xs">(forgone)</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminPromoCampaigns;
