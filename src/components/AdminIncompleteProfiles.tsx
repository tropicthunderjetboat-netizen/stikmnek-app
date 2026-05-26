import React from 'react';
import { Building2, Mail, MapPin, Phone, RefreshCw } from 'lucide-react';

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
};

/**
 * Owners who completed "business profile" onboarding but have not submitted a listing
 * (`pending_businesses` row). They do not appear in the main approvals queue until then.
 */
const AdminIncompleteProfiles: React.FC<AdminIncompleteProfilesProps> = ({
  profiles,
  loading,
  onRefresh,
}) => {
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
            Business Hub → Submit a listing. Logo upload issues here do not block saving the profile.
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
                <img
                  src={p.logo_url}
                  alt=""
                  className="w-12 h-12 rounded-lg object-cover border border-violet-100 shrink-0"
                />
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
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default AdminIncompleteProfiles;
