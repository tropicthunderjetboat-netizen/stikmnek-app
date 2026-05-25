import React from 'react';
import {
  CREDENTIAL_DEFINITIONS,
  credentialLabel,
  type BusinessCredentialsPublic,
  type CredentialKey,
} from '@/lib/businessCredentials';
import { Award, CheckCircle2, ShieldCheck, XCircle } from 'lucide-react';

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
  const title =
    language === 'en'
      ? 'My credentials'
      : language === 'fr'
        ? 'Accréditations'
        : 'Kredensel blong mi';

  const subtitle =
    language === 'en'
      ? 'Checked by StikmNek — green tick = verified, red X = not on file'
      : language === 'fr'
        ? 'Vérifié par StikmNek — coche verte = validé, X rouge = absent'
        : 'StikmNek i check — grin tick = verify, red X = no gat';

  const legend =
    language === 'en'
      ? 'Helps you see what this business has provided for your peace of mind.'
      : language === 'fr'
        ? 'Voyez ce que cet établissement a fourni pour votre tranquillité.'
        : 'Yu save lukim wanem dokumen bisnis ia i gat.';

  return (
    <div className="bg-white rounded-xl p-5 sm:p-6 shadow-sm border-2 border-amber-200/80 bg-gradient-to-br from-amber-50/40 via-white to-teal-50/30">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-500 flex items-center justify-center shadow-sm">
          <Award className="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 className="font-bold text-gray-900 text-sm">{title}</h3>
          <p className="text-xs text-teal-800/80 flex items-center gap-1 mt-0.5">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
            {subtitle}
          </p>
        </div>
      </div>
      <p className="text-xs text-gray-500 mb-3">{legend}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {CREDENTIAL_DEFINITIONS.map((def) => {
          const verified = Boolean(credentials[VERIFIED_BY_KEY[def.key]]);
          return (
            <div
              key={def.key}
              className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 shadow-sm ${
                verified
                  ? 'border-teal-200 bg-gradient-to-r from-teal-50/80 to-white'
                  : 'border-red-200/90 bg-gradient-to-r from-red-50/60 to-white'
              }`}
            >
              {verified ? (
                <CheckCircle2 className="w-5 h-5 text-teal-600 shrink-0" aria-hidden />
              ) : (
                <XCircle className="w-5 h-5 text-red-500 shrink-0" aria-hidden />
              )}
              <span
                className={`text-sm font-semibold ${
                  verified ? 'text-gray-900' : 'text-gray-600'
                }`}
              >
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
