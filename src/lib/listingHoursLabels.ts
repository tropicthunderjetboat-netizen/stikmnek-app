import { isTourOrActivityCategory } from '@/lib/businessOfferingMap';

type Lang = 'en' | 'fr' | 'bi';

export function listingHoursFieldCopy(
  category: unknown,
  language: Lang | string,
  opts?: { isPerListing?: boolean },
): { label: string; hint: string; placeholder: string } {
  const tour = isTourOrActivityCategory(category);
  const perListing = opts?.isPerListing ?? tour;
  const lang: Lang = language === 'fr' ? 'fr' : language === 'bi' ? 'bi' : 'en';

  if (tour || perListing) {
    if (lang === 'fr') {
      return {
        label: 'Horaires / départs',
        hint: 'Jours et heures pour ce tour ou cette activité uniquement (ex. mar & jeu 10h ou 13h30).',
        placeholder: 'ex. Mar & jeu 10h00 ou 13h30',
      };
    }
    if (lang === 'bi') {
      return {
        label: 'Taem / lego',
        hint: 'Dei mo taem blong dispela listing nomo (e.g. Tuisde mo Tosde 10am o 1:30pm).',
        placeholder: 'e.g. Tuisde mo Tosde 10:00 o 1:30pm',
      };
    }
    return {
      label: 'Schedule / departure times',
      hint: 'Days and times for this tour or activity only (e.g. Tue & Thu 10:00 AM or 1:30 PM).',
      placeholder: 'e.g. Tue & Thu 10:00 AM or 1:30 PM',
    };
  }

  if (lang === 'fr') {
    return {
      label: 'Heures d’ouverture',
      hint: 'Horaires de ce commerce ou de ce listing.',
      placeholder: 'ex. 9h00 - 17h00',
    };
  }
  if (lang === 'bi') {
    return {
      label: 'Taem wok',
      hint: 'Taem blong dispela listing.',
      placeholder: 'e.g. 9:00 AM - 5:00 PM',
    };
  }
  return {
    label: 'Operating hours',
    hint: 'Hours for this listing. Use business-wide hours on your profile if all listings share the same times.',
    placeholder: 'e.g. 9:00 AM - 5:00 PM',
  };
}
