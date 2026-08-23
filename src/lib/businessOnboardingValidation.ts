/**
 * Shared business onboarding / listing validation.
 * Use from CompleteBusinessProfile, BusinessListingForm, BusinessOwnerDashboard, etc.
 */

import {
  BUSINESS_DESCRIPTION_PLAIN_TEXT_MAX,
  hasMeaningfulDescriptionContent,
  plainTextFromHtml,
} from '@/lib/businessDescriptionHtml';
import {
  categoryUsesTieredPricing,
  validatePricingTiersForSubmit,
  type PricingTierInput,
} from '@/lib/pricingTiers';

// ─── Length limits (profile + listing metadata) ───────────────────────────

export const BUSINESS_NAME_MIN_LEN = 2;
export const BUSINESS_NAME_MAX_LEN = 120;

export const OWNER_NAME_MIN_LEN = 2;
export const OWNER_NAME_MAX_LEN = 120;

export const ADDRESS_MIN_LEN = 5;
export const ADDRESS_MAX_LEN = 500;

/** Non-empty title after trim (matches legacy listing form: any non-empty string). */
export const LISTING_TITLE_MIN_LEN = 1;
export const LISTING_TITLE_MAX_LEN = 200;

// ─── Result types ───────────────────────────────────────────────────────────

/** Single-field check: `null` means valid. */
export type FieldErrorMessage = string | null;

export type SingleFieldValidation = {
  valid: boolean;
  /** Human-readable, actionable message when `valid` is false. */
  message: string | null;
};

export type CompositeValidationResult = {
  valid: boolean;
  /** First error per logical field key (e.g. `businessName`, `pricing`, `photos`). */
  errors: Record<string, string>;
};

export type BusinessProfileOnboardingInput = {
  businessName: string;
  ownerName: string;
  email: string;
  phone: string;
  whatsapp: string;
  address: string;
  /** Owner consents to WhatsApp education tips. */
  whatsappMarketingOptIn?: boolean;
  /** When true (initial profile setup), opt-in must be checked if they use WhatsApp. */
  requireWhatsAppOptIn?: boolean;
  /** Owner does not use WhatsApp — phone/email contact only. */
  noWhatsApp?: boolean;
};

export type FlatListingPricingInput = {
  originalPrice: number | string;
  dealPrice: number | string;
  /** When set and non-empty, discount path: % must be 1–99 and deal &lt; original. */
  discountPercent?: string | null;
  /** Optional offer type for flat listings. */
  offerType?: 'price_discount' | 'free_add_on';
  /** Badge/offer text shown to tourists (e.g. "Free dessert"). */
  discountLabel?: string | null;
};

export type ListingSubmissionOnboardingInput = {
  title: string;
  descriptionHtml: string;
  category: string;
  /** First / hero image URL for the listing. */
  mainImageUrl: string;
  /** Used when `!categoryUsesTieredPricing(category)`. */
  flatPricing?: FlatListingPricingInput | null;
  /** Used when `categoryUsesTieredPricing(category)`. */
  pricingTiers?: PricingTierInput[] | null;
};

// ─── Low-level helpers ─────────────────────────────────────────────────────

const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

function digitsOnly(s: string): string {
  return (s || '').replace(/\D/g, '');
}

function single(valid: boolean, message: string | null): SingleFieldValidation {
  return { valid, message: valid ? null : message };
}

// ─── Individual validators (return `null` when valid) ───────────────────────

export function validateBusinessName(value: string): FieldErrorMessage {
  const t = (value || '').trim();
  if (!t) return 'Enter your business or trading name.';
  if (t.length < BUSINESS_NAME_MIN_LEN) {
    return `Business name must be at least ${BUSINESS_NAME_MIN_LEN} characters.`;
  }
  if (t.length > BUSINESS_NAME_MAX_LEN) {
    return `Business name must be at most ${BUSINESS_NAME_MAX_LEN} characters.`;
  }
  return null;
}

export function validateOwnerName(value: string): FieldErrorMessage {
  const t = (value || '').trim();
  if (!t) return 'Enter the owner or primary contact name.';
  if (t.length < OWNER_NAME_MIN_LEN) {
    return `Name must be at least ${OWNER_NAME_MIN_LEN} characters.`;
  }
  if (t.length > OWNER_NAME_MAX_LEN) {
    return `Name must be at most ${OWNER_NAME_MAX_LEN} characters.`;
  }
  return null;
}

export function validateBusinessEmail(value: string): FieldErrorMessage {
  const t = (value || '').trim();
  if (!t) return 'Enter an email address we can use to reach you.';
  if (t.length > 254) return 'Email address is too long.';
  if (!EMAIL_REGEX.test(t)) return 'Enter a valid email address (e.g. name@example.com).';
  return null;
}

export function validateBusinessPhone(value: string): FieldErrorMessage {
  const raw = (value || '').trim();
  if (!raw) return 'Enter a phone number (include country code if applicable).';
  const digits = digitsOnly(raw);
  if (digits.length < 7) return 'Phone number looks too short — include area/country code.';
  if (digits.length > 15) return 'Phone number looks too long — check for typos.';
  if (!/^[\d\s+().\-/]{7,}$/.test(raw)) return 'Use digits and common separators only (+, spaces, dashes, parentheses).';
  return null;
}

/** Required on business profile — primary channel for owner education & support. */
export function validateBusinessWhatsAppRequired(value: string): FieldErrorMessage {
  const raw = (value || '').trim();
  if (!raw) {
    return 'Enter your WhatsApp number — we use it to send setup tips and help you finish your listing.';
  }
  const digits = digitsOnly(raw);
  if (digits.length < 7) return 'WhatsApp number looks too short — include country code (e.g. +678 …).';
  if (digits.length > 15) return 'WhatsApp number looks too long — check for typos.';
  if (!/^[\d\s+().\-/]{7,}$/.test(raw)) {
    return 'Use digits and common separators only (+, spaces, dashes, parentheses).';
  }
  return null;
}

/** Optional on listings; validates format when a value is entered. */
export function validateWhatsAppNumber(value: string): FieldErrorMessage {
  const raw = (value || '').trim();
  if (!raw) return null;
  return validateBusinessWhatsAppRequired(raw);
}

export function validateBusinessAddress(value: string): FieldErrorMessage {
  const t = (value || '').trim();
  if (!t) return 'Enter your business address or service area.';
  if (t.length < ADDRESS_MIN_LEN) {
    return `Address should be at least ${ADDRESS_MIN_LEN} characters (e.g. street or island + area).`;
  }
  if (t.length > ADDRESS_MAX_LEN) {
    return `Address must be at most ${ADDRESS_MAX_LEN} characters.`;
  }
  return null;
}

/**
 * Listing / deal description: meaningful plain text and max length (matches app-wide cap).
 */
export function validateBusinessDescriptionHtml(html: string): FieldErrorMessage {
  const h = html ?? '';
  if (!hasMeaningfulDescriptionContent(h)) {
    return 'Add a description with real detail — empty formatting alone is not enough.';
  }
  const plainLen = plainTextFromHtml(h).length;
  if (plainLen > BUSINESS_DESCRIPTION_PLAIN_TEXT_MAX) {
    return `Description must be ${BUSINESS_DESCRIPTION_PLAIN_TEXT_MAX} characters or fewer (plain text after formatting is removed).`;
  }
  return null;
}

export function validateListingTitle(value: string): FieldErrorMessage {
  const t = (value || '').trim();
  if (!t) return 'Enter a title for this deal or listing.';
  if (t.length < LISTING_TITLE_MIN_LEN) {
    return `Title must be at least ${LISTING_TITLE_MIN_LEN} characters.`;
  }
  if (t.length > LISTING_TITLE_MAX_LEN) {
    return `Title must be at most ${LISTING_TITLE_MAX_LEN} characters.`;
  }
  return null;
}

/**
 * Hero / main image: non-empty URL, must be https (browser-safe hotlinking).
 */
export function validateHttpsListingImageUrl(url: string): FieldErrorMessage {
  const u = (url || '').trim();
  if (!u) return 'Add at least one photo and wait for the upload to finish.';
  if (!/^https:\/\//i.test(u)) {
    return 'Main image must be a secure https:// URL. Re-upload if you see a non-https link.';
  }
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== 'https:') return 'Main image must use https.';
  } catch {
    return 'Main image URL is not valid — try uploading the photo again.';
  }
  return null;
}

/**
 * Main listing hero image for new submissions — http or https, non-empty (matches `BusinessListingForm` uploader).
 */
export function validateListingMainImageUrl(url: string): FieldErrorMessage {
  const u = (url || '').trim();
  if (!u || !/^https?:\/\//i.test(u)) {
    return 'Add at least one photo and wait for the upload to finish (a valid image URL is required).';
  }
  try {
    void new URL(u);
  } catch {
    return 'Add at least one photo and wait for the upload to finish (a valid image URL is required).';
  }
  return null;
}

/**
 * Non–tiered categories: standard price &gt; 0; with optional % discount, StikmNek price &lt; standard when discount set.
 */
export function validateFlatListingPricing(input: FlatListingPricingInput): FieldErrorMessage {
  const orig = Number(String(input.originalPrice ?? '').replace(/,/g, ''));
  const dealRaw = Number(String(input.dealPrice ?? '').replace(/,/g, ''));
  const pctRaw = (input.discountPercent ?? '').trim();
  const hasDiscount = Boolean(pctRaw);
  const offerType = input.offerType === 'free_add_on' ? 'free_add_on' : 'price_discount';
  const discountLabel = (input.discountLabel ?? '').trim();

  if (!Number.isFinite(orig) || orig <= 0) {
    return 'Enter your standard price in VT (must be greater than 0).';
  }

  if (offerType === 'free_add_on') {
    if (!discountLabel) {
      return 'Enter the free add-on or special offer tourists get (e.g. Free dessert with 2 mains).';
    }
    return null;
  }

  if (hasDiscount) {
    const pct = Number(pctRaw);
    if (!Number.isFinite(pct) || pct <= 0 || pct >= 100) {
      return 'Discount must be between 1% and 99%.';
    }
    const deal = dealRaw;
    if (!Number.isFinite(deal) || deal <= 0) {
      return 'Enter a valid StikmNek / promotional price.';
    }
    if (deal >= orig) {
      return 'With a discount set, the StikmNek price must be less than your standard price.';
    }
    return null;
  }

  const deal = Number.isFinite(dealRaw) && dealRaw > 0 ? dealRaw : orig;
  if (!Number.isFinite(deal) || deal <= 0 || deal > orig) {
    return 'Listed price must be positive and not greater than your standard price.';
  }
  return null;
}

// ─── Single-field wrappers (object result) ─────────────────────────────────

export function validateBusinessNameField(value: string): SingleFieldValidation {
  const msg = validateBusinessName(value);
  return single(msg === null, msg);
}

export function validateOwnerNameField(value: string): SingleFieldValidation {
  const msg = validateOwnerName(value);
  return single(msg === null, msg);
}

export function validateBusinessEmailField(value: string): SingleFieldValidation {
  const msg = validateBusinessEmail(value);
  return single(msg === null, msg);
}

export function validateBusinessPhoneField(value: string): SingleFieldValidation {
  const msg = validateBusinessPhone(value);
  return single(msg === null, msg);
}

export function validateWhatsAppNumberField(value: string): SingleFieldValidation {
  const msg = validateWhatsAppNumber(value);
  return single(msg === null, msg);
}

export function validateBusinessAddressField(value: string): SingleFieldValidation {
  const msg = validateBusinessAddress(value);
  return single(msg === null, msg);
}

export function validateBusinessDescriptionHtmlField(html: string): SingleFieldValidation {
  const msg = validateBusinessDescriptionHtml(html);
  return single(msg === null, msg);
}

export function validateListingTitleField(value: string): SingleFieldValidation {
  const msg = validateListingTitle(value);
  return single(msg === null, msg);
}

export function validateHttpsListingImageUrlField(url: string): SingleFieldValidation {
  const msg = validateHttpsListingImageUrl(url);
  return single(msg === null, msg);
}

export function validateFlatListingPricingField(input: FlatListingPricingInput): SingleFieldValidation {
  const msg = validateFlatListingPricing(input);
  return single(msg === null, msg);
}

// ─── Composite validators ───────────────────────────────────────────────────

function firstErrors(record: Record<string, string | null>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(record)) {
    if (v) out[k] = v;
  }
  return out;
}

/**
 * Full validation for the “complete business profile” step (stub `businesses` row + profile fields).
 */
export function validateBusinessProfileOnboarding(input: BusinessProfileOnboardingInput): CompositeValidationResult {
  const usesWhatsApp = !input.noWhatsApp;
  const errors = firstErrors({
    businessName: validateBusinessName(input.businessName),
    ownerName: validateOwnerName(input.ownerName),
    email: validateBusinessEmail(input.email),
    phone: validateBusinessPhone(input.phone),
    whatsapp: usesWhatsApp
      ? validateBusinessWhatsAppRequired(input.whatsapp)
      : validateWhatsAppNumber(input.whatsapp),
    address: validateBusinessAddress(input.address),
    whatsappOptIn:
      usesWhatsApp && input.requireWhatsAppOptIn && !input.whatsappMarketingOptIn
        ? 'Please agree to receive WhatsApp tips so we can help you set up your listing.'
        : null,
  });
  return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * Full validation for a new listing submission (title, description, image, pricing by category).
 */
export function validateListingSubmissionOnboarding(
  input: ListingSubmissionOnboardingInput,
): CompositeValidationResult {
  const errors: Record<string, string> = {};

  const titleErr = validateListingTitle(input.title);
  if (titleErr) errors.title = titleErr;

  const descErr = validateBusinessDescriptionHtml(input.descriptionHtml);
  if (descErr) errors.description = descErr;

  const imgErr = validateListingMainImageUrl(input.mainImageUrl);
  if (imgErr) errors.photos = imgErr;

  const tiered = categoryUsesTieredPricing(input.category);
  if (tiered) {
    const tiers = input.pricingTiers ?? [];
    const { data, error } = validatePricingTiersForSubmit(tiers);
    if (error) {
      errors.pricing = error;
    } else if (!data || !Array.isArray(data) || data.length === 0) {
      errors.pricing =
        'Add at least one priced guest type (for example Adults). Children, infants, and discounts are optional.';
    }
  } else {
    const flat = input.flatPricing;
    if (!flat) {
      errors.pricing = 'Enter pricing for this listing.';
    } else {
      const pErr = validateFlatListingPricing(flat);
      if (pErr) errors.pricing = pErr;
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * First validation message in a stable field order (useful for a single toast or screen reader).
 */
export function firstCompositeErrorMessage(
  result: CompositeValidationResult,
  fieldOrder: string[],
): string | null {
  if (result.valid) return null;
  for (const key of fieldOrder) {
    const msg = result.errors[key];
    if (msg) return msg;
  }
  const keys = Object.keys(result.errors);
  return keys.length ? result.errors[keys[0]]! : null;
}

/** Default field order for profile validation messages. */
export const BUSINESS_PROFILE_VALIDATION_FIELD_ORDER = [
  'businessName',
  'ownerName',
  'email',
  'phone',
  'whatsapp',
  'whatsappOptIn',
  'address',
] as const;

/** Default field order for listing validation messages. */
export const LISTING_SUBMISSION_VALIDATION_FIELD_ORDER = [
  'title',
  'description',
  'photos',
  'pricing',
] as const;

/** First invalid listing field key in `LISTING_SUBMISSION_VALIDATION_FIELD_ORDER`. */
export function firstListingValidationErrorKey(
  errors: Record<string, string>,
): (typeof LISTING_SUBMISSION_VALIDATION_FIELD_ORDER)[number] | null {
  for (const key of LISTING_SUBMISSION_VALIDATION_FIELD_ORDER) {
    if (errors[key]) return key;
  }
  return null;
}

/** French copy for shared English pricing / tier messages (`pricingTiers` + flat listing rules). */
export function localizeListingPricingErrorFr(en: string): string {
  const map: Record<string, string> = {
    'Enter your standard price in VT (must be greater than 0).':
      'Indiquez votre prix standard en VT (supérieur à 0).',
    'Discount must be between 1% and 99%.': 'La remise doit être entre 1% et 99%.',
    'Enter a valid StikmNek / promotional price.': 'Entrez un prix promotionnel valide.',
    'With a discount set, the StikmNek price must be less than your standard price.':
      'Avec une remise, le prix StikmNek doit être inférieur au prix standard.',
    'Listed price must be positive and not greater than your standard price.':
      'Prix invalide : le prix affiché doit être positif et ne pas dépasser le prix standard.',
    'Add at least one priced guest type (for example Adults). Children, infants, and discounts are optional.':
      'Ajoutez au moins un tarif (par ex. Adultes). Enfants, bébés et remises sont optionnels.',
    'Enter pricing for this listing.': 'Indiquez les tarifs pour cette annonce.',
    'Each pricing tier needs a label.': 'Chaque palier de prix doit avoir un libellé.',
    'Each tier needs a standard price greater than 0.':
      'Chaque palier doit avoir un prix standard supérieur à 0.',
    'Each tier needs a listed price greater than 0.':
      'Chaque palier doit avoir un prix affiché supérieur à 0.',
    'Listed / pass price cannot be higher than the standard price for each tier.':
      'Le prix affiché / pass ne peut pas être supérieur au prix standard pour chaque palier.',
    'Max pax must be greater than or equal to min pax for each tier.':
      'Le nombre max. de pers. doit être supérieur ou égal au min. pour chaque palier.',
  };
  return map[en] ?? en;
}

/**
 * Maps `validateListingSubmissionOnboarding` failures to inline field errors + a single toast line.
 * Used by `BusinessListingForm` and the dashboard resubmit form so copy stays aligned.
 */
export function localizedListingSubmitValidationFeedback(
  errors: Record<string, string>,
  descriptionHtml: string,
  language: string,
): {
  fieldErrors: { title?: string; description?: string; photos?: string; pricing?: string };
  toastMessage: string;
} {
  const key = firstListingValidationErrorKey(errors);
  const plainLen = plainTextFromHtml(descriptionHtml).length;
  const overDescMax = plainLen > BUSINESS_DESCRIPTION_PLAIN_TEXT_MAX;

  if (key === 'title') {
    const msg =
      language === 'en'
        ? 'Please enter a title for this deal or listing.'
        : language === 'fr'
          ? 'Veuillez indiquer un titre pour cette offre.'
          : 'Putem wan foto mo wet bifo uplodem i finis.';
    return {
      fieldErrors: { title: errors.title ?? msg },
      toastMessage: errors.title ?? msg,
    };
  }
  if (key === 'description') {
    const msg = overDescMax
      ? language === 'en'
        ? `Description must be ${BUSINESS_DESCRIPTION_PLAIN_TEXT_MAX} characters or fewer (plain text).`
        : language === 'fr'
          ? `La description doit comporter au plus ${BUSINESS_DESCRIPTION_PLAIN_TEXT_MAX} caractères (texte brut).`
          : `Description mas long ${BUSINESS_DESCRIPTION_PLAIN_TEXT_MAX} karakta.`
      : language === 'en'
        ? 'Please add a description with real detail (not only empty formatting).'
        : language === 'fr'
          ? 'Veuillez ajouter une description avec du contenu réel.'
          : 'Narawan';
    return { fieldErrors: { description: msg }, toastMessage: msg };
  }
  if (key === 'photos') {
    const msg =
      language === 'en'
        ? 'Add at least one photo and wait for upload to finish (a valid image URL is required).'
        : language === 'fr'
          ? 'Ajoutez au moins une photo et attendez la fin du téléchargement.'
          : 'Putem wan foto mo wet bifo uplodem i finis.';
    return { fieldErrors: { photos: msg }, toastMessage: msg };
  }
  if (key === 'pricing') {
    const en = errors.pricing ?? '';
    const msg = language === 'fr' ? localizeListingPricingErrorFr(en) : en;
    return { fieldErrors: { pricing: msg }, toastMessage: msg };
  }

  const fallback = Object.values(errors)[0] || '';
  return { fieldErrors: {}, toastMessage: fallback };
}

/** Same cap as `businessDescriptionHtml` — re-exported for forms that only import this module. */
export { BUSINESS_DESCRIPTION_PLAIN_TEXT_MAX } from '@/lib/businessDescriptionHtml';
