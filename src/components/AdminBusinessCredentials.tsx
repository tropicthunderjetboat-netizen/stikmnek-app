import React, { useCallback, useEffect, useState } from 'react';
import { getEdgeAuthHeaders, supabase } from '@/lib/supabase';
import {
  CREDENTIAL_DEFINITIONS,
  CREDENTIAL_VERIFY_COLUMNS,
  type BusinessCredentialsRow,
  type CredentialKey,
  isFirstAidRecent,
  resolveCredentialsBusinessId,
} from '@/lib/businessCredentials';
import { edgeFunctionErrorMessage } from '@/lib/credentialUpload';
import { Button } from '@/components/ui/button';
import { Check, ExternalLink, FileText, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';

type AdminBusinessCredentialsProps = {
  /** Profile `businesses.id` or a listing `business_offerings.id` (we resolve to profile). */
  businessId: string;
  businessName: string;
  onVerified?: () => void;
};

const DOC_FIELDS: {
  key: CredentialKey;
  pathKey: keyof BusinessCredentialsRow;
  verifiedKey: keyof BusinessCredentialsRow;
}[] = [
  { key: 'tourism_permit', pathKey: 'tourism_permit_path', verifiedKey: 'verified_tourism_permit' },
  {
    key: 'liability_insurance',
    pathKey: 'liability_insurance_path',
    verifiedKey: 'verified_liability_insurance',
  },
  {
    key: 'association_credentials',
    pathKey: 'association_credentials_path',
    verifiedKey: 'verified_association_credentials',
  },
  {
    key: 'first_aid',
    pathKey: 'first_aid_certificate_path',
    verifiedKey: 'verified_first_aid',
  },
];

const AdminBusinessCredentials: React.FC<AdminBusinessCredentialsProps> = ({
  businessId,
  businessName,
  onVerified,
}) => {
  const [loading, setLoading] = useState(true);
  const [profileId, setProfileId] = useState('');
  const [row, setRow] = useState<BusinessCredentialsRow | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const pid = await resolveCredentialsBusinessId(supabase, businessId);
      setProfileId(pid);
      if (!pid) {
        setRow(null);
        return;
      }

      const { data: directRow, error: directErr } = await supabase
        .from('business_credentials')
        .select('*')
        .eq('business_id', pid)
        .maybeSingle();

      if (!directErr && directRow) {
        setRow(directRow as BusinessCredentialsRow);
        return;
      }

      if (directErr) {
        console.warn('[AdminBusinessCredentials] direct select:', directErr.message);
      }

      const { data, error } = await supabase.functions.invoke('manage-business', {
        headers: await getEdgeAuthHeaders(),
        body: { action: 'get_business_credentials', businessId: pid },
      });
      if (error) {
        const msg = await edgeFunctionErrorMessage(data, error);
        if (directErr) throw new Error(msg || directErr.message);
        setLoadError(msg);
        setRow(null);
        return;
      }
      setRow((data?.credentials ?? null) as BusinessCredentialsRow | null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not load credentials';
      setLoadError(msg);
      toast.error(msg);
      setRow(null);
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDocument = async (filePath: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('business-credentials')
        .createSignedUrl(filePath, 3600);
      if (!error && data?.signedUrl) {
        window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
        return;
      }

      const { data: edgeData, error: edgeErr } = await supabase.functions.invoke('manage-business', {
        headers: await getEdgeAuthHeaders(),
        body: {
          action: 'get_credential_signed_url',
          businessId: profileId || businessId,
          filePath,
        },
      });
      if (edgeErr) throw edgeErr;
      const url = edgeData?.signedUrl;
      if (!url) throw new Error('No URL');
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not open document');
    }
  };

  const setVerified = async (key: CredentialKey, verified: boolean) => {
    const pid = profileId || (await resolveCredentialsBusinessId(supabase, businessId));
    if (!pid) return;
    setToggling(key);
    try {
      const cols = CREDENTIAL_VERIFY_COLUMNS[key];
      const patch: Record<string, unknown> = {
        business_id: pid,
        [cols.flag]: verified,
        [cols.at]: verified ? new Date().toISOString() : null,
        [cols.by]: verified ? (await supabase.auth.getUser()).data.user?.id ?? null : null,
        updated_at: new Date().toISOString(),
      };

      const { error: directErr } = await supabase
        .from('business_credentials')
        .upsert(patch, { onConflict: 'business_id' });

      if (directErr) {
        const { data, error } = await supabase.functions.invoke('manage-business', {
          headers: await getEdgeAuthHeaders(),
          body: {
            action: 'admin_verify_credential',
            businessId: pid,
            credentialKey: key,
            verified,
          },
        });
        if (error) throw new Error(await edgeFunctionErrorMessage(data, error));
        if (data?.error) throw new Error(String(data.error));
      }

      await load();
      onVerified?.();
      toast.success(verified ? 'Credential verified' : 'Verification removed');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setToggling(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="w-5 h-5 animate-spin text-teal-600" />
      </div>
    );
  }

  if (loadError) {
    return (
      <p className="text-sm text-red-600 py-4">
        Could not load credentials: {loadError}
      </p>
    );
  }

  const hasAny = DOC_FIELDS.some((f) => String(row?.[f.pathKey] ?? '').trim());

  if (!hasAny) {
    return (
      <div className="text-sm text-gray-500 py-4 space-y-1">
        <p>No credentials uploaded for {businessName}.</p>
        {profileId && (
          <p className="text-xs text-gray-400">
            Company profile ID: {profileId.slice(0, 8)}… — same credentials apply to all listings under
            this business.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {profileId && (
        <p className="text-xs text-teal-800 bg-teal-50 border border-teal-100 rounded-lg px-3 py-2">
          Credentials are shared across all listings for this company (profile ID{' '}
          {profileId.slice(0, 8)}…). Verifying here updates every deal under {businessName}.
        </p>
      )}
      <p className="text-xs text-gray-500">
        Review each document, then tick to verify. Only verified items appear on the public
        &quot;My credentials&quot; tile and boost leaderboard rank.
      </p>
      {DOC_FIELDS.map(({ key, pathKey, verifiedKey }) => {
        const path = String(row?.[pathKey] ?? '').trim();
        if (!path) return null;
        const def = CREDENTIAL_DEFINITIONS.find((d) => d.key === key)!;
        const verified = Boolean(row?.[verifiedKey]);
        const firstAidWarn =
          key === 'first_aid' &&
          row?.first_aid_completed_at &&
          !isFirstAidRecent(row.first_aid_completed_at);

        return (
          <div
            key={key}
            className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-gray-200 bg-gray-50/80 p-3"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">{def.labelEn}</p>
              {key === 'first_aid' && row?.first_aid_completed_at && (
                <p className={`text-xs mt-0.5 ${firstAidWarn ? 'text-amber-700' : 'text-gray-500'}`}>
                  Completed: {row.first_aid_completed_at}
                  {firstAidWarn ? ' (older than 24 months — verify only if still valid)' : ''}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => void openDocument(path)}
              >
                <FileText className="w-3.5 h-3.5" />
                View
                <ExternalLink className="w-3 h-3 opacity-60" />
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={toggling === key}
                className={
                  verified
                    ? 'bg-teal-600 hover:bg-teal-700 gap-1'
                    : 'bg-white border border-gray-300 text-gray-700 hover:bg-teal-50 gap-1'
                }
                onClick={() => void setVerified(key, !verified)}
              >
                {toggling === key ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : verified ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <span className="w-3.5 h-3.5 rounded border border-gray-400" />
                )}
                {verified ? 'Verified' : 'Verify'}
              </Button>
              {verified && (
                <button
                  type="button"
                  className="p-1.5 text-gray-400 hover:text-red-600"
                  title="Remove verification"
                  onClick={() => void setVerified(key, false)}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default AdminBusinessCredentials;
