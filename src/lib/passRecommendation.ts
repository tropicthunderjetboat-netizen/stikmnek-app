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

function diffDays(arrivalYYYYMMDD: string, departureYYYYMMDD: string): number {
  // Interpret as local dates; minimum 1 day.
  const a = new Date(arrivalYYYYMMDD + 'T00:00:00');
  const d = new Date(departureYYYYMMDD + 'T00:00:00');
  const ms = d.getTime() - a.getTime();
  if (!Number.isFinite(ms)) return 1;
  const days = Math.round(ms / (1000 * 60 * 60 * 24));
  return Math.max(1, days);
}

function displayPassTitle(p: PassProductConfig, lang: 'en' | 'fr' | 'bi'): string {
  return lang === 'fr' ? p.titleFr : lang === 'bi' ? p.titleBi : p.title;
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
  const totalDays = arrival && departure ? diffDays(arrival, departure) : 1;

  // Sort by price ascending so we naturally pick the cheapest that fits.
  const sorted = [...passProducts].sort((a, b) => (a.priceAUD ?? 0) - (b.priceAUD ?? 0));

  const fitsWithoutShare = (p: PassProductConfig) =>
    p.basePeople >= totalPeople && p.baseDays >= totalDays;

  const fitsWithShare = (p: PassProductConfig) => {
    const peopleAfter = p.shareBonus?.totalPeopleAfterShare ?? (p.basePeople + (p.shareBonus?.extraPeople || 0));
    const daysAfter = p.shareBonus?.totalDaysAfterShare ?? (p.baseDays + (p.shareBonus?.extraDays || 0));
    return peopleAfter >= totalPeople && daysAfter >= totalDays;
  };

  let recommended: PassProductConfig | null =
    sorted.find(fitsWithoutShare) ?? null;

  let usesShareBonus = false;
  if (!recommended) {
    const shareFit = sorted.find(fitsWithShare) ?? null;
    if (shareFit) {
      recommended = shareFit;
      usesShareBonus = true;
    }
  }

  // Still nothing fits even with share bonus — fall back to the biggest pass (by people then days).
  if (!recommended) {
    recommended = [...sorted].sort((a, b) => {
      const aPeople = a.shareBonus?.totalPeopleAfterShare ?? a.basePeople;
      const bPeople = b.shareBonus?.totalPeopleAfterShare ?? b.basePeople;
      if (bPeople !== aPeople) return bPeople - aPeople;
      const aDays = a.shareBonus?.totalDaysAfterShare ?? a.baseDays;
      const bDays = b.shareBonus?.totalDaysAfterShare ?? b.baseDays;
      return bDays - aDays;
    })[0];
    usesShareBonus = true;
  }

  const title = displayPassTitle(recommended, language);
  const bonusPeople = recommended.shareBonus?.extraPeople || 0;
  const bonusDays = recommended.shareBonus?.extraDays || 0;

  const baseLine =
    language === 'fr'
      ? `Pour votre groupe de ${totalPeople} personne${totalPeople > 1 ? 's' : ''} pour ${totalDays} jour${totalDays > 1 ? 's' : ''}, nous recommandons le ${title}.`
      : language === 'bi'
        ? `Blong grup blong yu (${totalPeople} man) blong ${totalDays} dei, mifala i rekomendem ${title}.`
        : `For your party of ${totalPeople} for ${totalDays} day${totalDays > 1 ? 's' : ''}, we recommend the ${title}.`;

  const shareLine = usesShareBonus
    ? (
      language === 'fr'
        ? ` Astuce : partagez l’app pour débloquer ${bonusPeople > 0 ? `+${bonusPeople} personne${bonusPeople > 1 ? 's' : ''}` : ''}${bonusPeople > 0 && bonusDays > 0 ? ' et ' : ''}${bonusDays > 0 ? `+${bonusDays} jour` : ''} gratuitement.`
        : language === 'bi'
          ? ` Tip: serem app blong anlokem ${bonusPeople > 0 ? `+${bonusPeople} man` : ''}${bonusPeople > 0 && bonusDays > 0 ? ' mo ' : ''}${bonusDays > 0 ? `+${bonusDays} dei` : ''} fri.`
          : ` Tip: share the app to unlock ${bonusPeople > 0 ? `+${bonusPeople} people` : ''}${bonusPeople > 0 && bonusDays > 0 ? ' and ' : ''}${bonusDays > 0 ? `+${bonusDays} day` : ''} free.`
    )
    : '';

  return {
    recommendedPass: recommended,
    recommendedPassType: recommended.type,
    totalPeople,
    totalDays,
    usesShareBonus,
    recommendationText: (baseLine + shareLine).trim(),
  };
}

