import type { UserProfile } from '@/contexts/AppContext';
import type { PassProductConfig } from '@/data/pricing';

export interface PassRecommendation {
  recommendedPass: PassProductConfig;
  recommendedPassType: PassProductConfig['type'];
  totalPeople: number;
  totalDays: number;
  /** True when the estimate assumes Share Bonus capacity (post-purchase share). */
  usesShareBonus: boolean;
  recommendationText: string;
  /** Always 1 — the app supports one pass purchase per flow; see recommendationText when the trip exceeds one pass. */
  totalPassesNeeded: number;
  /** Price of one recommended pass (AUD). */
  totalEstimatedCostAUD: number;
}

function clampInt(n: unknown, fallback: number): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(0, Math.floor(x));
}

function diffDaysInclusive(arrivalYYYYMMDD: string, departureYYYYMMDD: string): number {
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

type CapacityMode = 'base' | 'share';

interface CostOption {
  pass: PassProductConfig;
  mode: CapacityMode;
  peoplePerPass: number;
  daysPerPass: number;
  passesForPeople: number;
  passesForDays: number;
  totalPassesNeeded: number;
  totalEstimatedCostAUD: number;
}

function computeCostOption(
  pass: PassProductConfig,
  mode: CapacityMode,
  totalPeople: number,
  totalDays: number,
): CostOption {
  const peoplePerPass = mode === 'share' ? peopleAfterShare(pass) : pass.basePeople;
  const daysPerPass = mode === 'share' ? daysAfterShare(pass) : pass.baseDays;
  const safePeople = Math.max(1, peoplePerPass);
  const safeDays = Math.max(1, daysPerPass);
  const passesForPeople = Math.ceil(totalPeople / safePeople);
  const passesForDays = Math.ceil(totalDays / safeDays);
  const totalPassesNeeded = Math.max(passesForPeople, passesForDays);
  const price = pass.priceAUD ?? 0;
  const totalEstimatedCostAUD = totalPassesNeeded * price;
  return {
    pass,
    mode,
    peoplePerPass: safePeople,
    daysPerPass: safeDays,
    passesForPeople,
    passesForDays,
    totalPassesNeeded,
    totalEstimatedCostAUD,
  };
}

/** Pass with the highest post-share people capacity (then days), for “best single pass” when one purchase cannot cover the whole trip. */
function getHighestCapacityPass(passProducts: PassProductConfig[]): PassProductConfig {
  return passProducts.reduce((best, p) => {
    const pa = peopleAfterShare(p);
    const pb = peopleAfterShare(best);
    if (pa > pb) return p;
    if (pa < pb) return best;
    const da = daysAfterShare(p);
    const db = daysAfterShare(best);
    return da >= db ? p : best;
  });
}

/**
 * Recommends **one** pass purchase that matches app constraints (no multi-instance checkout).
 * If the trip cannot be covered by a single pass (any product, base or share), recommends the
 * highest-capacity pass and directs users to support for larger groups.
 */
export function getPassRecommendation(
  userProfile: UserProfile,
  passProducts: PassProductConfig[],
  opts?: { language?: 'en' | 'fr' | 'bi' },
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

  const candidates: CostOption[] = [];
  for (const p of passProducts) {
    candidates.push(computeCostOption(p, 'base', totalPeople, totalDays));
    candidates.push(computeCostOption(p, 'share', totalPeople, totalDays));
  }

  const singlePassOptions = candidates.filter((c) => c.totalPassesNeeded === 1);

  singlePassOptions.sort((a, b) => {
    const priceA = a.pass.priceAUD ?? 0;
    const priceB = b.pass.priceAUD ?? 0;
    if (priceA !== priceB) return priceA - priceB;
    if (a.mode !== b.mode) return a.mode === 'base' ? -1 : 1;
    return 0;
  });

  const maxPass = getHighestCapacityPass(passProducts);
  const maxP = peopleAfterShare(maxPass);
  const maxD = daysAfterShare(maxPass);

  if (singlePassOptions.length === 0) {
    const recommended = maxPass;
    const title = displayPassTitle(recommended, language);
    const price = recommended.priceAUD ?? 0;
    const priceStr = price.toFixed(0);

    const body =
      language === 'fr'
        ? `Pour votre groupe de ${totalPeople} personne${totalPeople > 1 ? 's' : ''} pour ${totalDays} jour${totalDays > 1 ? 's' : ''}, nous recommandons le ${title} : une fois l’achat effectué, le bonus de partage porte la capacité jusqu’à ${maxP} personnes et ${maxD} jour${maxD > 1 ? 's' : ''}. Votre voyage dépasse ce qu’un seul pass peut couvrir dans l’app. Pour les grands groupes, contactez le support pour un devis personnalisé, ou envisagez un pass supplémentaire lorsque votre pass actuel est complet. Prix d’un pass : environ A$${priceStr}.`
        : language === 'bi'
          ? `Blong grup blong yu (${totalPeople} man) blong ${totalDays} dei, mifala i rekomendem ${title}: taem yu baem finis, bonus taem yu serem i kasem kasem ${maxP} man mo ${maxD} dei. Trip blong yu i bigwan mo wan pas long app ia. Blong bigwan grup, askem support o tingbaot wan moa pas taem pas blong yu i ful. Wan pas ~A$${priceStr}.`
          : `For your party of ${totalPeople} for ${totalDays} day${totalDays > 1 ? 's' : ''}, we recommend the ${title}. After purchase, sharing the app unlocks up to ${maxP} people and ${maxD} day${maxD > 1 ? 's' : ''} on that pass. Your trip is larger than one pass can cover in the app. For larger groups, please contact support for a custom quote, or consider purchasing an additional pass once your current pass is full. One pass is about A$${priceStr}.`;

    return {
      recommendedPass: recommended,
      recommendedPassType: recommended.type,
      totalPeople,
      totalDays,
      usesShareBonus: true,
      totalPassesNeeded: 1,
      totalEstimatedCostAUD: price,
      recommendationText: body.trim(),
    };
  }

  const winner = singlePassOptions[0];
  const recommended = winner.pass;
  const usesShareBonus = winner.mode === 'share';
  const title = displayPassTitle(recommended, language);
  const price = recommended.priceAUD ?? 0;
  const priceStr = price.toFixed(0);

  const baseForRecommended = computeCostOption(recommended, 'base', totalPeople, totalDays);
  const shareBonusHelpsMeetTrip =
    usesShareBonus && baseForRecommended.totalPassesNeeded > 1;

  let shareTip = '';
  if (shareBonusHelpsMeetTrip) {
    shareTip =
      language === 'fr'
        ? ` Astuce : après l’achat, partagez l’app pour activer jusqu’à ${peopleAfterShare(recommended)} personnes et ${daysAfterShare(recommended)} jours — nécessaire pour couvrir votre voyage avec ce pass.`
        : language === 'bi'
          ? ` Tip: bifo baem i finis, serem app blong kasem kasem ${peopleAfterShare(recommended)} man mo ${daysAfterShare(recommended)} dei — hemia i nidim blong trip blong yu wetem pas ia.`
          : ` Tip: After purchase, share the app to unlock up to ${peopleAfterShare(recommended)} people and ${daysAfterShare(recommended)} days — needed to cover your trip with this pass.`;
  }

  const baseLine =
    language === 'fr'
      ? `Pour ${totalPeople} personne${totalPeople > 1 ? 's' : ''} et ${totalDays} jour${totalDays > 1 ? 's' : ''}, nous recommandons le ${title} — un seul achat couvre votre voyage (environ A$${priceStr}).`
      : language === 'bi'
        ? `Blong ${totalPeople} man mo ${totalDays} dei, mifala i rekomendem ${title} — wan pas i kavrem trip blong yu (klosap A$${priceStr}).`
        : `For your party of ${totalPeople} for ${totalDays} day${totalDays > 1 ? 's' : ''}, we recommend the ${title} — one purchase covers your trip (about A$${priceStr}).`;

  return {
    recommendedPass: recommended,
    recommendedPassType: recommended.type,
    totalPeople,
    totalDays,
    usesShareBonus,
    totalPassesNeeded: 1,
    totalEstimatedCostAUD: price,
    recommendationText: (baseLine + shareTip).trim(),
  };
}
