/**
 * How listing prices and pass redemptions are interpreted by category.
 * Tours/activities: tiered per person. Shopping: per item. Transportation: per trip/day.
 * Accommodation: per stay/booking (total price, not per guest). Dining/spa: per person.
 */

export type PricingBasis = 'per_person' | 'per_unit' | 'tiered';

export function isShoppingCategory(category: string): boolean {
  return (category || '').toLowerCase() === 'shopping';
}

export function isTransportationCategory(category: string): boolean {
  const c = (category || '').toLowerCase();
  return c === 'transportation' || c === 'transport';
}

export function isAccommodationCategory(category: string): boolean {
  return (category || '').toLowerCase() === 'accommodation';
}

export function categoryUsesPerUnitPricing(category: string): boolean {
  return (
    isShoppingCategory(category) ||
    isTransportationCategory(category) ||
    isAccommodationCategory(category)
  );
}

export function pricingBasisForCategory(category: string): PricingBasis {
  const c = (category || '').toLowerCase();
  if (c === 'tours' || c === 'activities') return 'tiered';
  if (categoryUsesPerUnitPricing(c)) return 'per_unit';
  return 'per_person';
}

export function unitLabelForCategory(
  category: string,
  language: 'en' | 'fr' | 'bi' = 'en',
): { singular: string; plural: string } {
  if (isAccommodationCategory(category)) {
    if (language === 'fr') return { singular: 'séjour', plural: 'séjours' };
    if (language === 'bi') return { singular: 'stei', plural: 'stei' };
    return { singular: 'stay', plural: 'stays' };
  }
  if (isShoppingCategory(category)) {
    if (language === 'fr') return { singular: 'article', plural: 'articles' };
    if (language === 'bi') return { singular: 'item', plural: 'item' };
    return { singular: 'item', plural: 'items' };
  }
  if (isTransportationCategory(category)) {
    if (language === 'fr') return { singular: 'trajet/jour', plural: 'trajets/jours' };
    if (language === 'bi') return { singular: 'trip/dei', plural: 'trip/dei' };
    return { singular: 'trip/day', plural: 'trips/days' };
  }
  if (language === 'fr') return { singular: 'personne', plural: 'personnes' };
  if (language === 'bi') return { singular: 'man', plural: 'man' };
  return { singular: 'person', plural: 'people' };
}

/** Short suffix shown next to prices on listing cards (e.g. "per stay"). */
export function shortPriceUnitSuffix(
  category: string,
  language: 'en' | 'fr' | 'bi' = 'en',
): string {
  if (isAccommodationCategory(category)) {
    if (language === 'fr') return 'par séjour';
    if (language === 'bi') return 'long wan stei';
    return 'per stay';
  }
  if (isTransportationCategory(category)) {
    if (language === 'fr') return 'par trajet/jour';
    if (language === 'bi') return 'long trip/dei';
    return 'per trip/day';
  }
  if (isShoppingCategory(category)) {
    if (language === 'fr') return 'par article';
    if (language === 'bi') return 'long wan item';
    return 'per item';
  }
  if (language === 'fr') return 'par personne';
  if (language === 'bi') return 'long wan man';
  return 'per person';
}

/** Hint under flat price fields on business listing forms. */
export function perUnitPriceHint(
  category: string,
  language: 'en' | 'fr' | 'bi' = 'en',
): string {
  if (isAccommodationCategory(category)) {
    if (language === 'fr') {
      return 'Prix total pour ce séjour (VT) — ex. 3 nuits pour jusqu’à 4 personnes, pas par personne';
    }
    if (language === 'bi') {
      return 'Total praes blong stei (VT) — olsem 3 naet, kasem 4 man, no long wan man';
    }
    return 'Total price for this stay (VT) — e.g. 3 nights for up to 4 guests, not per person';
  }
  if (isTransportationCategory(category)) {
    if (language === 'fr') {
      return 'Prix normal par trajet, transfert ou jour de location (VT)';
    }
    if (language === 'bi') {
      return 'Stanad praes long wan trip, transfer o dei blong rent (VT)';
    }
    return 'Regular price per trip, transfer, or rental day (VT)';
  }
  if (isShoppingCategory(category)) {
    if (language === 'fr') return 'Prix normal par article en Vatu';
    if (language === 'bi') return 'Stanad praes long wan item (VT)';
    return 'Regular price per item in Vatu';
  }
  if (language === 'fr') return 'Prix normal par personne en Vatu';
  if (language === 'bi') return 'Stanad praes long wan man (VT)';
  return 'Regular price per person in Vatu';
}
