/**
 * English product line for transactional email (receipts, subjects).
 * Matches the live app default EN copy in `src/data/pricing.ts` (`getPassDisplayTitle`):
 * single **StikmNek Pass** product — legacy `pass_type` values are not given distinct names in email.
 */

export function transactionalPassProductNameEn(): string {
  return 'StikmNek Pass';
}
