/**
 * How listing prices and pass redemptions are interpreted by category.
 * Tours/activities: tiered per person. Shopping: per item/unit. Others: flat per person.
 */

export type PricingBasis = 'per_person' | 'per_unit' | 'tiered';

export function categoryUsesPerUnitPricing(category: string): boolean {
  return (category || '').toLowerCase() === 'shopping';
}

export function pricingBasisForCategory(category: string): PricingBasis {
  const c = (category || '').toLowerCase();
  if (c === 'tours' || c === 'activities') return 'tiered';
  if (c === 'shopping') return 'per_unit';
  return 'per_person';
}

export function unitLabelForCategory(
  category: string,
  language: 'en' | 'fr' | 'bi' = 'en',
): { singular: string; plural: string } {
  if (categoryUsesPerUnitPricing(category)) {
    if (language === 'fr') return { singular: 'article', plural: 'articles' };
    if (language === 'bi') return { singular: 'item', plural: 'item' };
    return { singular: 'item', plural: 'items' };
  }
  if (language === 'fr') return { singular: 'personne', plural: 'personnes' };
  if (language === 'bi') return { singular: 'man', plural: 'man' };
  return { singular: 'person', plural: 'people' };
}
