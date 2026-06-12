/**
 * How listing prices and pass redemptions are interpreted by category.
 * Tours/activities: tiered per person. Shopping: per item. Transportation: per trip/day.
 * Others: flat per person.
 */

export type PricingBasis = 'per_person' | 'per_unit' | 'tiered';

export function isShoppingCategory(category: string): boolean {
  return (category || '').toLowerCase() === 'shopping';
}

export function isTransportationCategory(category: string): boolean {
  const c = (category || '').toLowerCase();
  return c === 'transportation' || c === 'transport';
}

export function categoryUsesPerUnitPricing(category: string): boolean {
  return isShoppingCategory(category) || isTransportationCategory(category);
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

/** Hint under flat price fields on business listing forms. */
export function perUnitPriceHint(
  category: string,
  language: 'en' | 'fr' | 'bi' = 'en',
): string {
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
