import React, { useCallback, useEffect, useState } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { getEdgeAuthHeaders, supabase } from '@/lib/supabase';
import {
  CREDENTIAL_DEFINITIONS,
  type BusinessCredentialsRow,
  type CredentialKey,
} from '@/lib/businessCredentials';
import CredentialUploader, { type CredentialUpload } from '@/components/CredentialUploader';
import { Award, Loader2, Save, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { edgeFunctionErrorMessage } from '@/lib/credentialUpload';
import { toast } from 'sonner';

type BusinessCredentialsSettingsProps = {
  profileBusinessId: string;
};

type DocState = {
  upload: CredentialUpload | null;
  verified: boolean;
};

const PATH_KEYS: Record<CredentialKey, keyof BusinessCredentialsRow> = {
  tourism_permit: 'tourism_permit_path',
  liability_insurance: 'liability_insurance_path',
  association_credentials: 'association_credentials_path',
  first_aid: 'first_aid_certificate_path',
};

const VERIFIED_KEYS: Record<CredentialKey, keyof BusinessCredentialsRow> = {
  tourism_permit: 'verified_tourism_permit',
  liability_insurance: 'verified_liability_insurance',
  association_credentials: 'verified_association_credentials',
  first_aid: 'verified_first_aid',
};

const BusinessCredentialsSettings: React.FC<BusinessCredentialsSettingsProps> = ({
  profileBusinessId,
}) => {
  const { user, language, refreshBusinesses } = useAppContext();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [firstAidDate, setFirstAidDate] = useState('');
  const [docs, setDocs] = useState<Record<CredentialKey, DocState>>({
    tourism_permit: { upload: null, verified: false },
    liability_insurance: { upload: null, verified: false },
    association_credentials: { upload: null, verified: false },
    first_aid: { upload: null, verified: false },
  });
  const [removedKeys, setRemovedKeys] = useState<Set<CredentialKey>>(new Set());
  const [initialPaths, setInitialPaths] = useState<Partial<Record<CredentialKey, string>>>({});

  const loadCredentials = useCallback(async () => {
    if (!profileBusinessId || !user?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-business', {
        headers: await getEdgeAuthHeaders(),
        body: {
          action: 'get_business_credentials',
          businessId: profileBusinessId,
        },
      });
      if (error) throw error;
      const row = (data?.credentials ?? null) as BusinessCredentialsRow | null;
      const next: Record<CredentialKey, DocState> = {
        tourism_permit: { upload: null, verified: false },
        liability_insurance: { upload: null, verified: false },
        association_credentials: { upload: null, verified: false },
        first_aid: { upload: null, verified: false },
      };
      for (const def of CREDENTIAL_DEFINITIONS) {
        const path = String(row?.[PATH_KEYS[def.key]] ?? '').trim();
        const verified = Boolean(row?.[VERIFIED_KEYS[def.key]]);
        if (path) {
          next[def.key] = {
            upload: { filePath: path, fileName: path.split('/').pop() || 'document' },
            verified,
          };
        } else {
          next[def.key] = { upload: null, verified: false };
        }
      }
      setDocs(next);
      const paths: Partial<Record<CredentialKey, string>> = {};
      for (const def of CREDENTIAL_DEFINITIONS) {
        const p = String(row?.[PATH_KEYS[def.key]] ?? '').trim();
        if (p) paths[def.key] = p;
      }
      setInitialPaths(paths);
      setRemovedKeys(new Set());
      setFirstAidDate(String(row?.first_aid_completed_at ?? '').slice(0, 10));
    } catch (err: unknown) {
      console.error('[BusinessCredentialsSettings]', err);
    } finally {
      setLoading(false);
    }
  }, [profileBusinessId, user?.id]);

  useEffect(() => {
    void loadCredentials();
  }, [loadCredentials]);

  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      const patch: Record<string, unknown> = {};
      for (const def of CREDENTIAL_DEFINITIONS) {
        const d = docs[def.key];
        const pathKey = PATH_KEYS[def.key];
        const urlKey = String(pathKey).replace('_path', '_url');
        if (removedKeys.has(def.key)) {
          patch[pathKey] = null;
          patch[urlKey] = null;
        } else if (d.upload && d.upload.filePath !== initialPaths[def.key]) {
          patch[pathKey] = d.upload.filePath;
          patch[urlKey] = d.upload.filePath;
        }
      }
      if (docs.first_aid.upload || firstAidDate) {
        patch.first_aid_completed_at = firstAidDate || null;
      }

      let saveOk = false;
      if (Object.keys(patch).length > 0) {
        const row: Record<string, unknown> = {
          business_id: profileBusinessId,
          updated_at: new Date().toISOString(),
          ...patch,
        };
        const resetVerified = (pathKey: string, flagKey: string, atKey: string, byKey: string) => {
          if (patch[pathKey]) {
            row[flagKey] = false;
            row[atKey] = null;
            row[byKey] = null;
          }
        };
        resetVerified(
          'tourism_permit_path',
          'verified_tourism_permit',
          'verified_tourism_permit_at',
          'verified_tourism_permit_by',
        );
        resetVerified(
          'liability_insurance_path',
          'verified_liability_insurance',
          'verified_liability_insurance_at',
          'verified_liability_insurance_by',
        );
        resetVerified(
          'association_credentials_path',
          'verified_association_credentials',
          'verified_association_credentials_at',
          'verified_association_credentials_by',
        );
        if (patch.first_aid_certificate_path) {
          row.verified_first_aid = false;
          row.verified_first_aid_at = null;
          row.verified_first_aid_by = null;
        }

        const { error: directErr } = await supabase
          .from('business_credentials')
          .upsert(row, { onConflict: 'business_id' });

        if (!directErr) {
          saveOk = true;
        } else {
          console.warn('[BusinessCredentialsSettings] direct upsert failed, trying edge:', directErr.message);
          const { data, error } = await supabase.functions.invoke('manage-business', {
            headers: await getEdgeAuthHeaders(),
            body: {
              action: 'upsert_business_credentials',
              businessId: profileBusinessId,
              credentials: patch,
            },
          });
          if (error) {
            throw new Error(await edgeFunctionErrorMessage(data, error));
          }
          if (data?.error) throw new Error(String(data.error));
          if (data?.success === false) {
            throw new Error(String(data.error || 'Save failed'));
          }
          saveOk = true;
        }
      } else {
        saveOk = true;
      }
      if (!saveOk) throw new Error('Save failed');

      await refreshBusinesses?.();
      await loadCredentials();
      toast.success(
        language === 'en'
          ? 'Credentials saved. Admin will verify documents for leaderboard boost.'
          : language === 'fr'
            ? 'Identifiants enregistrés. Un admin validera vos documents.'
            : 'Kredensel i sevem. Admin bae verify.',
      );
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-6 h-6 text-teal-600 animate-spin" />
      </div>
    );
  }

  const title =
    language === 'en'
      ? 'My credentials'
      : language === 'fr'
        ? 'Mes accréditations'
        : 'Kredensel blong mi';

  const subtitle =
    language === 'en'
      ? 'Optional — upload insurance, permits, or training certificates. Verified credentials help you rank higher on the leaderboard. Not required for markets or shops without insurance.'
      : language === 'fr'
        ? 'Facultatif — téléchargez assurance, permis ou certificats. Les documents vérifiés améliorent votre classement.'
        : 'Optional — upload insurance, permit o sertifikat. Sapos admin i verify, yu save rank moa high.';

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
          <Award className="w-5 h-5 text-amber-600" />
        </div>
        <div>
          <h3 className="text-lg font-extrabold text-gray-900">{title}</h3>
          <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {CREDENTIAL_DEFINITIONS.map((def) => (
          <div key={def.key} className="relative">
            <CredentialUploader
              businessId={profileBusinessId}
              userId={user!.id}
              label={
                language === 'fr' ? def.labelFr : language === 'bi' ? def.labelBi : def.labelEn
              }
              hint={language === 'en' ? def.hintEn : undefined}
              language={language}
              value={docs[def.key].upload}
              onChange={(upload) => {
                if (upload) {
                  setRemovedKeys((s) => {
                    const n = new Set(s);
                    n.delete(def.key);
                    return n;
                  });
                } else {
                  setRemovedKeys((s) => new Set(s).add(def.key));
                }
                setDocs((prev) => ({
                  ...prev,
                  [def.key]: { upload, verified: false },
                }));
              }}
            />
            {docs[def.key].upload && (
              <div className="mt-1.5 flex items-center gap-1.5 text-xs">
                {docs[def.key].verified ? (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
                    <span className="text-teal-700 font-semibold">
                      {language === 'en' ? 'Verified by StikmNek' : 'Vérifié'}
                    </span>
                  </>
                ) : (
                  <span className="text-amber-700 font-medium">
                    {language === 'en' ? 'Pending admin review' : 'En attente de validation'}
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {docs.first_aid.upload && (
        <div className="max-w-xs">
          <Label className="mb-1.5 block text-sm">
            {language === 'en'
              ? 'First aid course completed'
              : language === 'fr'
                ? 'Date du cours de premiers secours'
                : 'Dei blong first aid'}
          </Label>
          <Input
            type="date"
            value={firstAidDate}
            onChange={(e) => setFirstAidDate(e.target.value)}
          />
          <p className="text-xs text-gray-500 mt-1">
            {language === 'en'
              ? 'Must be within the last 24 months to count on the leaderboard.'
              : 'Doit dater de moins de 24 mois.'}
          </p>
        </div>
      )}

      <Button
        type="button"
        onClick={() => void handleSave()}
        disabled={saving}
        className="bg-teal-600 hover:bg-teal-700 gap-2"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {language === 'en' ? 'Save credentials' : language === 'fr' ? 'Enregistrer' : 'Sevem kredensel'}
      </Button>
    </div>
  );
};

export default BusinessCredentialsSettings;
