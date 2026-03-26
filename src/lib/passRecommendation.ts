import type { UserProfile } from '@/contexts/AppContext';
import type { PassProductConfig } from '@/data/pricing';

export interface PassRecommendation {
  recommendedPass: PassProductConfig;
  recommendedPassType: PassProductConfig['type'];
  totalPeople: number;
  totalDays: number;
  usesShareBonus: boolean;
  recommendationText: string;
}

function clampInt(n: unknown, fallback: number): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(0, Math.floor(x));
}

function diffDaysInclusive(arrivalYYYYMMDD: string, departureYYYYMMDD: string): number {
  // Interpret as local dates; inclusive day count. Example: Mar 1 → Mar 7 = 7 days.
  const a = new Date(arrivalYYYYMMDD + 'T00:00:00');
  const d = new Date(departureYYYYMMDD + 'T00:00:00');
  const ms = d.getTime() - a.getTime();
  if (!Number.isFinite(ms)) return 1;
  const daysBetween = Math.round(ms / (1000 * 60 * 60 * 24));
  return Math.max(1, daysBetween + 1);
}

function displayPassTitle(p: PassProductConfig, lang: 'en' | 'fr' | 'bi'): string {
  return lang === 'fr' ? p.titleFr : lang === 'bi' ? p.titleBi : p.title;
}

function peopleAfterShare(p: PassProductConfig): number {
  return p.shareBonus?.totalPeopleAfterShare ?? (p.basePeople + (p.shareBonus?.extraPeople || 0));
}

function daysAfterShare(p: PassProductConfig): number {
  return p.shareBonus?.totalDaysAfterShare ?? (p.baseDays + (p.shareBonus?.extraDays || 0));
}

export function getPassRecommendation(
  userProfile: UserProfile,
  passProducts: PassProductConfig[],
  opts?: { language?: 'en' | 'fr' | 'bi' }
): PassRecommendation | null {
  const language = opts?.language ?? 'en';
  if (!userProfile || !passProducts || passProducts.length === 0) return null;

  const adults = clampInt(userProfile.num_adults, 1);
  const children = clampInt(userProfile.num_children, 0);
  const infants = clampInt(userProfile.num_infants, 0);
  const totalPeople = Math.max(1, adults + children + infants);

  const arrival = String((userProfile as any).expected_arrival_date ?? '').slice(0, 10);
  const departure = String((userProfile as any).expected_departure_date ?? '').slice(0, 10);
  const totalDays = arrival && departure ? diffDaysInclusive(arrival, departure) : 1;

  // Sort by price ascending so we naturally pick the cheapest option within each priority band.
  const sorted = [...passProducts].sort((a, b) => (a.priceAUD ?? 0) - (b.priceAUD ?? 0));

  // A) Cheapest exact fit (no share needed)
  const exactNoShare = sorted.find((p) => p.basePeople >= totalPeople && p.baseDays >= totalDays) ?? null;

  // B) Cheapest exact fit (with share bonus)
  const exactWithShare = sorted.find((p) => peopleAfterShare(p) >= totalPeople && daysAfterShare(p) >= totalDays) ?? null;

  let recommended: PassProductConfig;
  let usesShareBonus = false;
  let mode: 'exact-no-share' | 'exact-with-share' | 'best-effort' = 'best-effort';

  if (exactNoShare) {
    recommended = exactNoShare;
    usesShareBonus = false;
    mode = 'exact-no-share';
  } else if (exactWithShare) {
    recommended = exactWithShare;
    usesShareBonus = true;
    mode = 'exact-with-share';
  } else {
    // C) Best effort upsell: pick the cheapest pass that gets *closest* when share is applied,
    // preferring to satisfy people first, then days, then overall deficit, then price.
    recommended = [...sorted].sort((a, b) => {
      const aPeopleOk = peopleAfterShare(a) >= totalPeople ? 0 : 1;
      const bPeopleOk = peopleAfterShare(b) >= totalPeople ? 0 : 1;
      if (aPeopleOk !== bPeopleOk) return aPeopleOk - bPeopleOk; // prefer people-covered

      const aDaysOk = daysAfterShare(a) >= totalDays ? 0 : 1;
      const bDaysOk = daysAfterShare(b) >= totalDays ? 0 : 1;
      if (aDaysOk !== bDaysOk) return aDaysOk - bDaysOk; // then days-covered

      const aPeopleDef = Math.max(0, totalPeople - peopleAfterShare(a));
      const bPeopleDef = Math.max(0, totalPeople - peopleAfterShare(b));
      if (aPeopleDef !== bPeopleDef) return aPeopleDef - bPeopleDef;

      const aDaysDef = Math.max(0, totalDays - daysAfterShare(a));
      const bDaysDef = Math.max(0, totalDays - daysAfterShare(b));
      if (aDaysDef !== bDaysDef) return aDaysDef - bDaysDef;

      return (a.priceAUD ?? 0) - (b.priceAUD ?? 0);
    })[0];
    usesShareBonus = true;
    mode = 'best-effort';
  }

  const title = displayPassTitle(recommended, language);
  const bonusPeople = recommended.shareBonus?.extraPeople || 0;
  const bonusDays = recommended.shareBonus?.extraDays || 0;

  const recPeopleCap = usesShareBonus ? peopleAfterShare(recommended) : recommended.basePeople;
  const recDaysCap = usesShareBonus ? daysAfterShare(recommended) : recommended.baseDays;
  const peopleShortBy = Math.max(0, totalPeople - recPeopleCap);
  const daysShortBy = Math.max(0, totalDays - recDaysCap);

  const baseLine =
    language === 'fr'
      ? `Pour votre groupe de ${totalPeople} personne${totalPeople > 1 ? 's' : ''} pour ${totalDays} jour${totalDays > 1 ? 's' : ''}, nous recommandons le ${title}.`
      : language === 'bi'
        ? `Blong grup blong yu (${totalPeople} man) blong ${totalDays} dei, mifala i rekomendem ${title}.`
        : `For your party of ${totalPeople} for ${totalDays} day${totalDays > 1 ? 's' : ''}, we recommend the ${title}.`;

  const shareLine = usesShareBonus
    ? (
      language === 'fr'
        ? ` Conseil : partagez l’app pour débloquer ${bonusPeople > 0 ? `+${bonusPeople} personne${bonusPeople > 1 ? 's' : ''}` : ''}${bonusPeople > 0 && bonusDays > 0 ? ' et ' : ''}${bonusDays > 0 ? `+${bonusDays} jour` : ''} gratuitement.`
        : language === 'bi'
          ? ` Tip: serem app blong anlokem ${bonusPeople > 0 ? `+${bonusPeople} man` : ''}${bonusPeople > 0 && bonusDays > 0 ? ' mo ' : ''}${bonusDays > 0 ? `+${bonusDays} dei` : ''} fri.`
          : ` Tip: share the app to unlock ${bonusPeople > 0 ? `+${bonusPeople} people` : ''}${bonusPeople > 0 && bonusDays > 0 ? ' and ' : ''}${bonusDays > 0 ? `+${bonusDays} day` : ''} free.`
    )
    : '';

  const bestEffortLine =
    mode === 'best-effort' && (peopleShortBy > 0 || daysShortBy > 0)
      ? (
        language === 'fr'
          ? ` Note : cette option ne couvre pas entièrement votre voyage (${peopleShortBy > 0 ? `il manque ${peopleShortBy} personne${peopleShortBy > 1 ? 's' : ''}` : ''}${peopleShortBy > 0 && daysShortBy > 0 ? ' et ' : ''}${daysShortBy > 0 ? `il manque ${daysShortBy} jour${daysShortBy > 1 ? 's' : ''}` : ''}). Vous pouvez acheter plusieurs pass ou choisir un pass supérieur.`
          : language === 'bi'
            ? ` Notis: hemia i no kavrem ful trip blong yu (${peopleShortBy > 0 ? `${peopleShortBy} man moa i nid` : ''}${peopleShortBy > 0 && daysShortBy > 0 ? ' mo ' : ''}${daysShortBy > 0 ? `${daysShortBy} dei moa i nid` : ''}). Yu save baem plante pas o tekem bigwan moa.`
            : ` Note: this option won’t fully cover your trip (${peopleShortBy > 0 ? `${peopleShortBy} more people needed` : ''}${peopleShortBy > 0 && daysShortBy > 0 ? ' and ' : ''}${daysShortBy > 0 ? `${daysShortBy} more day${daysShortBy > 1 ? 's' : ''} needed` : ''}). You can buy multiple passes or upgrade.`
      )
      : '';

  return {
    recommendedPass: recommended,
    recommendedPassType: recommended.type,
    totalPeople,
    totalDays,
    usesShareBonus,
    recommendationText: (baseLine + shareLine + bestEffortLine).trim(),
  };
}

