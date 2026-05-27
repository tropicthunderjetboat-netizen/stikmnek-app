import React, { useState } from 'react';
import { Building2, Mail, MapPin, Phone, RefreshCw, Trash2 } from 'lucide-react';
import BusinessProfileLogo from '@/components/BusinessProfileLogo';
import { getEdgeAuthHeaders, supabase } from '@/lib/supabase';
import { toast } from 'sonner';

export type IncompleteBusinessProfile = {
  id: string;
  name: string;
  category: string;
  owner_id: string;
  created_at: string;
  email: string | null;
  phone: string | null;
  location: string | null;
  logo_url: string | null;
  owner_email: string | null;
  owner_name: string | null;
};

type AdminIncompleteProfilesProps = {
  profiles: IncompleteBusinessProfile[];
  loading: boolean;
  onRefresh: () => void;
  adminUserId?: string;
};

/**
 * Owners who completed "business profile" onboarding but have not submitted a listing
 * (`pending_businesses` row). They do not appear in the main approvals queue until then.
 */
const AdminIncompleteProfiles: React.FC<AdminIncompleteProfilesProps> = ({
  profiles,
  loading,
  onRefresh,
  adminUserId,
}) => {
  const [removingId, setRemovingId] = useState<string | null>(null);

  const handleRemove = async (profile: IncompleteBusinessProfile) => {
    const label = profile.name || 'this profile';
    if (
      !window.confirm(
        `Remove "${label}" from StikmNek?\n\nThis deletes the unfinished business profile (no live listing). The owner account is not deleted.`,
      )
    ) {
      return;
    }
    if (!adminUserId) {
      toast.error('Sign in as admin to remove profiles.');
      return;
    }
    setRemovingId(profile.id);
    try {
      const { data, error } = await supabase.functions.invoke('manage-business', {
        headers: await getEdgeAuthHeaders(),
        body: {
          action: 'admin_delete_business',
          userId: adminUserId,
          businessId: profile.id,
          confirmDeleteEntireProfile: true,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      toast.success(`Removed "${label}".`);
      onRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not remove profile';
      toast.error(msg);
    } finally {
      setRemovingId(null);
    }
  };

  if (!loading && profiles.length === 0) return null;

  return (
    <div className="mb-6 rounded-xl border border-violet-200 bg-violet-50/60 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-violet-200/80 bg-violet-100/50">
        <div>
          <h3 className="text-sm font-bold text-violet-950 flex items-center gap-2">
            <Building2 className="w-4 h-4" aria-hidden />
            Profiles started — no listing submitted yet
          </h3>
          <p className="text-xs text-violet-800 mt-0.5 max-w-2xl">
            These partners saved their business profile but have not submitted a deal for review. Ask them to open
            Business Hub → Submit a listing. Remove test or duplicate profiles here.
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-violet-200 text-violet-900 text-xs font-semibold hover:bg-violet-50 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {loading && profiles.length === 0 ? (
        <p className="px-4 py-6 text-sm text-violet-800 text-center">Loading incomplete profiles…</p>
      ) : (
        <ul className="divide-y divide-violet-100">
          {profiles.map((p) => (
            <li key={p.id} className="px-4 py-3 flex flex-wrap items-start gap-4 bg-white/40">
              {p.logo_url ? (
                <BusinessProfileLogo src={p.logo_url} alt={p.name} variant="chip" className="shrink-0" />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
                  <Building2 className="w-6 h-6 text-violet-400" aria-hidden />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-900">{p.name || '(no name)'}</p>
                <p className="text-xs text-gray-500 capitalize mt-0.5">
                  {p.category || '—'} · Started {new Date(p.created_at).toLocaleString()}
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-600">
                  {(p.owner_email || p.email) && (
                    <span className="inline-flex items-center gap-1">
                      <Mail className="w-3.5 h-3.5" aria-hidden />
                      {p.owner_email || p.email}
                    </span>
                  )}
                  {p.phone && (
                    <span className="inline-flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5" aria-hidden />
                      {p.phone}
                    </span>
                  )}
                  {p.location && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" aria-hidden />
                      {p.location}
                    </span>
                  )}
                </div>
                {p.owner_name && (
                  <p className="text-xs text-gray-500 mt-1">Contact: {p.owner_name}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => void handleRemove(p)}
                disabled={removingId === p.id}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs font-semibold hover:bg-red-100 disabled:opacity-50 shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {removingId === p.id ? 'Removing…' : 'Remove'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default AdminIncompleteProfiles;
