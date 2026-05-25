/** Credential types stored on `business_credentials` (per business profile). */
export type CredentialKey =
  | 'tourism_permit'
  | 'liability_insurance'
  | 'association_credentials'
  | 'first_aid';

export type BusinessCredentialsPublic = {
  verifiedTourismPermit: boolean;
  verifiedLiabilityInsurance: boolean;
  verifiedAssociationCredentials: boolean;
  verifiedFirstAid: boolean;
  verifiedCount: number;
};

export type BusinessCredentialsRow = {
  business_id: string;
  liability_insurance_url?: string | null;
  liability_insurance_path?: string | null;
  verified_liability_insurance?: boolean;
  tourism_permit_url?: string | null;
  tourism_permit_path?: string | null;
  verified_tourism_permit?: boolean;
  association_credentials_url?: string | null;
  association_credentials_path?: string | null;
  verified_association_credentials?: boolean;
  first_aid_certificate_url?: string | null;
  first_aid_certificate_path?: string | null;
  first_aid_completed_at?: string | null;
  verified_first_aid?: boolean;
  admin_notes?: string | null;
};

export const CREDENTIAL_MAX_COUNT = 4;

/** First aid must be within this many months to count for leaderboard / public badge. */
export const FIRST_AID_RECENT_MONTHS = 24;

export const CREDENTIAL_DEFINITIONS: {
  key: CredentialKey;
  labelEn: string;
  labelFr: string;
  labelBi: string;
  hintEn: string;
}[] = [
  {
    key: 'tourism_permit',
    labelEn: 'Tourism permit',
    labelFr: 'Permis touristique',
    labelBi: 'Permit blong tourisim',
    hintEn: 'Valid tourism operator permit (if applicable).',
  },
  {
    key: 'liability_insurance',
    labelEn: 'Public liability insurance',
    labelFr: 'Assurance responsabilité civile',
    labelBi: 'Insurance blong liability',
    hintEn: 'Optional for markets and some retail — upload if you have cover.',
  },
  {
    key: 'association_credentials',
    labelEn: 'Association credentials',
    labelFr: 'Accréditation association',
    labelBi: 'Kredensel blong asosiesen',
    hintEn: 'Membership or accreditation from a recognised association.',
  },
  {
    key: 'first_aid',
    labelEn: 'First aid (guides & drivers)',
    labelFr: 'Premiers secours',
    labelBi: 'First aid',
    hintEn: 'Recent first aid certificate for guides or drivers (within 24 months).',
  },
];

export function credentialLabel(
  key: CredentialKey,
  language: 'en' | 'fr' | 'bi',
): string {
  const def = CREDENTIAL_DEFINITIONS.find((d) => d.key === key);
  if (!def) return key;
  if (language === 'fr') return def.labelFr;
  if (language === 'bi') return def.labelBi;
  return def.labelEn;
}

export function mapCredentialsFromListingRow(row: Record<string, unknown>): BusinessCredentialsPublic {
  return {
    verifiedTourismPermit: Boolean(row.cred_verified_tourism_permit),
    verifiedLiabilityInsurance: Boolean(row.cred_verified_liability_insurance),
    verifiedAssociationCredentials: Boolean(row.cred_verified_association_credentials),
    verifiedFirstAid: Boolean(row.cred_verified_first_aid),
    verifiedCount: Number(row.cred_verified_count) || 0,
  };
}

export function mapCredentialsFromDbRow(row: BusinessCredentialsRow | null): BusinessCredentialsPublic {
  if (!row) {
    return {
      verifiedTourismPermit: false,
      verifiedLiabilityInsurance: false,
      verifiedAssociationCredentials: false,
      verifiedFirstAid: false,
      verifiedCount: 0,
    };
  }
  const firstAidRecent = isFirstAidRecent(row.first_aid_completed_at);
  const tourism = Boolean(row.verified_tourism_permit && row.tourism_permit_path);
  const insurance = Boolean(row.verified_liability_insurance && row.liability_insurance_path);
  const association = Boolean(
    row.verified_association_credentials && row.association_credentials_path,
  );
  const firstAid = Boolean(row.verified_first_aid && row.first_aid_certificate_path && firstAidRecent);
  return {
    verifiedTourismPermit: tourism,
    verifiedLiabilityInsurance: insurance,
    verifiedAssociationCredentials: association,
    verifiedFirstAid: firstAid,
    verifiedCount: [tourism, insurance, association, firstAid].filter(Boolean).length,
  };
}

export function isFirstAidRecent(completedAt: string | null | undefined): boolean {
  if (!completedAt) return false;
  const d = new Date(completedAt);
  if (Number.isNaN(d.getTime())) return false;
  const monthsAgo =
    (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 30.437);
  return monthsAgo <= FIRST_AID_RECENT_MONTHS;
}

/** Leaderboard boost: 0–1 from admin-verified credentials (max 4 types). */
export function credentialsLeaderboardScore(creds: BusinessCredentialsPublic): number {
  return Math.min(Math.max(creds.verifiedCount, 0) / CREDENTIAL_MAX_COUNT, 1);
}

export function hasAnyPublicCredential(creds: BusinessCredentialsPublic): boolean {
  return creds.verifiedCount > 0;
}
