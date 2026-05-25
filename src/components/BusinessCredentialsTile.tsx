import React from 'react';
import {
  CREDENTIAL_DEFINITIONS,
  credentialLabel,
  hasAnyPublicCredential,
  type BusinessCredentialsPublic,
  type CredentialKey,
} from '@/lib/businessCredentials';
import { Award, CheckCircle2, ShieldCheck } from 'lucide-react';

type BusinessCredentialsTileProps = {
  credentials: BusinessCredentialsPublic;
  language: 'en' | 'fr' | 'bi';
};

const VERIFIED_BY_KEY: Record<CredentialKey, keyof BusinessCredentialsPublic> = {
  tourism_permit: 'verifiedTourismPermit',
  liability_insurance: 'verifiedLiabilityInsurance',
  association_credentials: 'verifiedAssociationCredentials',
  first_aid: 'verifiedFirstAid',
};

const BusinessCredentialsTile: React.FC<BusinessCredentialsTileProps> = ({
  credentials,
  language,
}) => {
  if (!hasAnyPublicCredential(credentials)) return null;

  const title =
    language === 'en'
      ? 'My credentials'
      : language === 'fr'
        ? 'Accréditations'
        : 'Kredensel blong mi';

  const subtitle =
    language === 'en'
      ? 'Verified by StikmNek — documents checked by our team'
      : language === 'fr'
        ? 'Vérifié par StikmNek'
        : 'StikmNek i verify';

  return (
    <div className="bg-white rounded-xl p-5 sm:p-6 shadow-sm border-2 border-amber-200/80 bg-gradient-to-br from-amber-50/40 via-white to-teal-50/30">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-500 flex items-center justify-center shadow-sm">
          <Award className="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 className="font-bold text-gray-900 text-sm">{title}</h3>
          <p className="text-xs text-teal-800/80 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            {subtitle}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {CREDENTIAL_DEFINITIONS.map((def) => {
          const verified = credentials[VERIFIED_BY_KEY[def.key]];
          if (!verified) return null;
          return (
            <div
              key={def.key}
              className="flex items-center gap-2.5 rounded-lg border border-teal-200 bg-white px-3 py-2.5 shadow-sm"
            >
              <CheckCircle2 className="w-5 h-5 text-teal-600 shrink-0" />
              <span className="text-sm font-semibold text-gray-900">
                {credentialLabel(def.key, language)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default BusinessCredentialsTile;
