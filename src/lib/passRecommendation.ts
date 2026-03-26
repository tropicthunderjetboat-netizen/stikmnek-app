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

  // A) Cheapest exact fit (no share needed): covers both people and days.
  const exactNoShare = sorted.find((p) => p.basePeople >= totalPeople && p.baseDays >= totalDays) ?? null;

  // B) Cheapest exact fit (with share): covers both people and days after share bonus.
  const exactWithShare = sorted.find((p) => peopleAfterShare(p) >= totalPeople && daysAfterShare(p) >= totalDays) ?? null;

  // C) Best-effort: always recommend something even if nothing covers both.
  // We do this in a deterministic order that prefers cheap + people coverage, then days coverage.
  const peopleNoShare = sorted.find((p) => p.basePeople >= totalPeople) ?? null;
  const peopleWithShare = sorted.find((p) => peopleAfterShare(p) >= totalPeople) ?? null;
  const daysNoShare = sorted.find((p) => p.baseDays >= totalDays) ?? null;
  const daysWithShare = sorted.find((p) => daysAfterShare(p) >= totalDays) ?? null;

  const hasAnyPeopleCoverage =
    sorted.some((p) => p.basePeople >= totalPeople) || sorted.some((p) => peopleAfterShare(p) >= totalPeople);
  const hasAnyDaysCoverage =
    sorted.some((p) => p.baseDays >= totalDays) || sorted.some((p) => daysAfterShare(p) >= totalDays);

  let recommended: PassProductConfig =
    exactNoShare ??
    exactWithShare ??
    // If this trip doesn't fit in ANY product even with sharing, prefer the
    // biggest duration/coverage (so you minimize repeat purchases).
    (!hasAnyPeopleCoverage && !hasAnyDaysCoverage
      ? [...sorted].sort((a, b) => {
          const aDays = daysAfterShare(a);
          const bDays = daysAfterShare(b);
          if (bDays !== aDays) return bDays - aDays;

          const aPeople = peopleAfterShare(a);
          const bPeople = peopleAfterShare(b);
          if (bPeople !== aPeople) return bPeople - aPeople;

          return (a.priceAUD ?? 0) - (b.priceAUD ?? 0);
        })[0]
      : // Otherwise: prefer covering the group size (cheapest)…
        peopleNoShare ??
        peopleWithShare ??
        // …then prefer covering the trip duration (cheapest)…
        daysNoShare ??
        daysWithShare ??
        // …and finally fall back to the cheapest product.
        sorted[0]);

  const usesShareBonus =
    recommended === exactWithShare ||
    recommended === peopleWithShare ||
    recommended === daysWithShare ||
    // If we didn't pick an exact no-share fit and the chosen pass only works best with share, enable share guidance.
    (!exactNoShare && (peopleAfterShare(recommended) > recommended.basePeople || daysAfterShare(recommended) > recommended.baseDays));

  const mode: 'exact-no-share' | 'exact-with-share' | 'best-effort' =
    recommended === exactNoShare ? 'exact-no-share' : recommended === exactWithShare ? 'exact-with-share' : 'best-effort';

  const title = displayPassTitle(recommended, language);
  const bonusPeople = recommended.shareBonus?.extraPeople || 0;
  const bonusDays = recommended.shareBonus?.extraDays || 0;

  const recPeopleCap = usesShareBonus ? peopleAfterShare(recommended) : recommended.basePeople;
  const recDaysCap = usesShareBonus ? daysAfterShare(recommended) : recommended.baseDays;
  const peopleShortBy = Math.max(0, totalPeople - recPeopleCap);
  const daysShortBy = Math.max(0, totalDays - recDaysCap);

  const passesNeededForDays = recDaysCap > 0 ? Math.ceil(totalDays / recDaysCap) : 1;

  const basePeopleCap = recommended.basePeople;
  const sharePeopleCap = peopleAfterShare(recommended);
  const baseDaysCap = recommended.baseDays;
  const shareDaysCap = daysAfterShare(recommended);

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
    mode === 'best-effort'
      ? (
        language === 'fr'
          ? `${daysShortBy > 0 ? ` Note : ce pass couvre ${usesShareBonus ? shareDaysCap : baseDaysCap} jour${(usesShareBonus ? shareDaysCap : baseDaysCap) > 1 ? 's' : ''} (${baseDaysCap} sans partage${usesShareBonus && shareDaysCap > baseDaysCap ? `, +${shareDaysCap - baseDaysCap} avec partage` : ''}). Pour ${totalDays} jours, il vous faudra au moins ${passesNeededForDays} pass (ou choisissez un pass plus long).` : ''}${peopleShortBy > 0 ? ` Note : ce pass couvre jusqu’à ${usesShareBonus ? sharePeopleCap : basePeopleCap} personne${(usesShareBonus ? sharePeopleCap : basePeopleCap) > 1 ? 's' : ''} (${basePeopleCap} sans partage${usesShareBonus && sharePeopleCap > basePeopleCap ? `, +${sharePeopleCap - basePeopleCap} avec partage` : ''}). Pour ${totalPeople}, choisissez un pass supérieur ou achetez un pass supplémentaire.` : ''}`
          : language === 'bi'
            ? `${daysShortBy > 0 ? ` Notis: pas ia i kavrem ${usesShareBonus ? shareDaysCap : baseDaysCap} dei (${baseDaysCap} bifo serem${usesShareBonus && shareDaysCap > baseDaysCap ? `, mo +${shareDaysCap - baseDaysCap} taem yu serem` : ''}). Blong ${totalDays} dei, yu nidim aot at least ${passesNeededForDays} pas (o tekem longfala pas).` : ''}${peopleShortBy > 0 ? ` Notis: pas ia i kavrem kasem ${usesShareBonus ? sharePeopleCap : basePeopleCap} man (${basePeopleCap} bifo serem${usesShareBonus && sharePeopleCap > basePeopleCap ? `, mo +${sharePeopleCap - basePeopleCap} taem yu serem` : ''}). Blong ${totalPeople}, tekem bigwan moa o baem wan moa.` : ''}`
            : `${daysShortBy > 0 ? ` Note: this pass covers ${usesShareBonus ? shareDaysCap : baseDaysCap} day${(usesShareBonus ? shareDaysCap : baseDaysCap) > 1 ? 's' : ''} (${baseDaysCap} without share${usesShareBonus && shareDaysCap > baseDaysCap ? `, +${shareDaysCap - baseDaysCap} with share` : ''}). For ${totalDays} days, you’ll need at least ${passesNeededForDays} pass${passesNeededForDays > 1 ? 'es' : ''} (or choose a longer pass).` : ''}${peopleShortBy > 0 ? ` Note: this pass covers up to ${usesShareBonus ? sharePeopleCap : basePeopleCap} people (${basePeopleCap} without share${usesShareBonus && sharePeopleCap > basePeopleCap ? `, +${sharePeopleCap - basePeopleCap} with share` : ''}). For ${totalPeople}, upgrade or buy an additional pass.` : ''}`
      ).trim()
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

