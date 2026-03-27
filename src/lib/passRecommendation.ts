import type { UserProfile } from '@/contexts/AppContext';
import type { PassProductConfig } from '@/data/pricing';

export interface PassRecommendation {
  recommendedPass: PassProductConfig;
  recommendedPassType: PassProductConfig['type'];
  totalPeople: number;
  totalDays: number;
  /** True when the winning estimate assumes Share Bonus capacity (post-purchase share). */
  usesShareBonus: boolean;
  recommendationText: string;
  /** Passes needed for the winning option (same pass purchased N times). */
  totalPassesNeeded: number;
  /** totalPassesNeeded * priceAUD for the winning option. */
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

/** When party size exceeds this multiple of the cheapest pass's max people (after share), prefer higher-capacity passes within the cost premium band. */
const SIGNIFICANT_PEOPLE_EXCESS_FACTOR = 1.5;

/** Max total cost vs absolute-cheapest option when prioritizing fewer / higher-capacity passes (e.g. 1.2 = up to 20% more). */
const SIMPLICITY_COST_PREMIUM_MAX = 1.2;

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

/**
 * Cost-optimized recommendation: for each pass type, estimate total AUD to cover
 * party size and trip length using max(people passes, day passes), for both base
 * and post–share-bonus capacity. Pick the lowest totalEstimatedCostAUD, except
 * when the party is large relative to the cheapest pass’s post-share capacity —
 * then prefer the highest post-share people capacity among options costing at
 * most ~20% more than the cheapest.
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

  candidates.sort((a, b) => {
    if (a.totalEstimatedCostAUD !== b.totalEstimatedCostAUD) {
      return a.totalEstimatedCostAUD - b.totalEstimatedCostAUD;
    }
    if (a.totalPassesNeeded !== b.totalPassesNeeded) {
      return a.totalPassesNeeded - b.totalPassesNeeded;
    }
    return (a.pass.priceAUD ?? 0) - (b.pass.priceAUD ?? 0);
  });

  const cheapestOpt = candidates[0];
  const cheapestCost = cheapestOpt.totalEstimatedCostAUD;
  const capCheapestAfterShare = peopleAfterShare(cheapestOpt.pass);
  const significantPeopleExcess =
    totalPeople > SIGNIFICANT_PEOPLE_EXCESS_FACTOR * capCheapestAfterShare;

  const affordable = candidates.filter(
    (c) => c.totalEstimatedCostAUD <= cheapestCost * SIMPLICITY_COST_PREMIUM_MAX,
  );

  const bySimplicity = [...affordable].sort((a, b) => {
    const pa = peopleAfterShare(a.pass);
    const pb = peopleAfterShare(b.pass);
    if (pb !== pa) return pb - pa;
    if (a.totalEstimatedCostAUD !== b.totalEstimatedCostAUD) {
      return a.totalEstimatedCostAUD - b.totalEstimatedCostAUD;
    }
    if (a.totalPassesNeeded !== b.totalPassesNeeded) {
      return a.totalPassesNeeded - b.totalPassesNeeded;
    }
    return (a.pass.priceAUD ?? 0) - (b.pass.priceAUD ?? 0);
  });

  const simplicityOpt = bySimplicity[0] ?? cheapestOpt;
  const winner = significantPeopleExcess ? simplicityOpt : cheapestOpt;

  const pickDiffersFromAbsoluteCheapest =
    winner.pass !== cheapestOpt.pass ||
    winner.mode !== cheapestOpt.mode ||
    winner.totalEstimatedCostAUD !== cheapestOpt.totalEstimatedCostAUD;

  const showSimplifyMessage = significantPeopleExcess && pickDiffersFromAbsoluteCheapest;
  const paidPremiumVsCheapest = winner.totalEstimatedCostAUD > cheapestCost;

  const recommended = winner.pass;
  const usesShareBonus = winner.mode === 'share';
  const title = displayPassTitle(recommended, language);

  const shareAddsPeople = peopleAfterShare(recommended) > recommended.basePeople;
  const shareAddsDays = daysAfterShare(recommended) > recommended.baseDays;
  const partyFitsBasePeople = totalPeople <= recommended.basePeople;

  let shareTip = '';
  if (usesShareBonus) {
    if (shareAddsPeople && shareAddsDays && !partyFitsBasePeople) {
      shareTip =
        paidPremiumVsCheapest
          ? language === 'fr'
            ? ` Astuce : après l’achat, partagez l’app une fois pour appliquer le bonus (jusqu’à ${peopleAfterShare(recommended)} personnes et ${daysAfterShare(recommended)} jours) — utilisé dans cette estimation pour faciliter la gestion du groupe.`
            : language === 'bi'
              ? ` Tip: bifo baem i finis, serem app wan taem blong bonus (kasem ${peopleAfterShare(recommended)} man mo ${daysAfterShare(recommended)} dei) — long estimate ia blong helpem grup.`
              : ` Tip: after purchase, share the app once to apply the Share Bonus (up to ${peopleAfterShare(recommended)} people and ${daysAfterShare(recommended)} days) — used in this estimate to simplify group coverage.`
          : language === 'fr'
            ? ` Astuce : après l’achat, partagez l’app une fois pour appliquer le bonus (jusqu’à ${peopleAfterShare(recommended)} personnes et ${daysAfterShare(recommended)} jours) — c’est ce qui rend cette option la moins chère.`
            : language === 'bi'
              ? ` Tip: bifo baem i finis, serem app wan taem blong bonus (kasem ${peopleAfterShare(recommended)} man mo ${daysAfterShare(recommended)} dei) — hemia i mekem opsen i smol long mani.`
              : ` Tip: after purchase, share the app once to apply the Share Bonus (up to ${peopleAfterShare(recommended)} people and ${daysAfterShare(recommended)} days) — that’s what makes this the cheapest option.`;
    } else if (shareAddsDays && (!shareAddsPeople || partyFitsBasePeople)) {
      shareTip =
        language === 'fr'
          ? ` Astuce : après l’achat, partagez l’app pour obtenir le jour supplémentaire utilisé dans cette estimation.`
          : language === 'bi'
            ? ` Tip: bifo baem i finis, serem app blong kasem ekstra dei long estimate ia.`
            : ` Tip: after purchase, share the app to unlock the extra day used in this estimate.`;
    } else if (shareAddsPeople && !partyFitsBasePeople) {
      shareTip =
        language === 'fr'
          ? ` Astuce : après l’achat, partagez l’app pour débloquer les places supplémentaires utilisées dans cette estimation.`
          : language === 'bi'
            ? ` Tip: bifo baem i finis, serem app blong kasem ekstra man long estimate ia.`
            : ` Tip: after purchase, share the app to unlock the extra people capacity used in this estimate.`;
    } else {
      shareTip =
        language === 'fr'
          ? ` Astuce : après l’achat, partagez l’app pour appliquer le bonus de partage utilisé dans cette estimation.`
          : language === 'bi'
            ? ` Tip: bifo baem i finis, serem app blong bonus long estimate ia.`
            : ` Tip: after purchase, share the app to apply the Share Bonus used in this estimate.`;
    }
  }

  const costFmt = winner.totalEstimatedCostAUD.toFixed(0);
  const mathExplain =
    language === 'fr'
      ? ` (estimation : max(${winner.passesForPeople} pass pour ${totalPeople} personne${totalPeople > 1 ? 's' : ''} ÷ ${winner.peoplePerPass}, ${winner.passesForDays} pour ${totalDays} jour${totalDays > 1 ? 's' : ''} ÷ ${winner.daysPerPass}) → ${winner.totalPassesNeeded} × A$${(recommended.priceAUD ?? 0).toFixed(0)} ≈ A$${costFmt}).`
      : language === 'bi'
        ? ` (estimet: ${winner.totalPassesNeeded} pas × A$${(recommended.priceAUD ?? 0).toFixed(0)} ≈ A$${costFmt}).`
        : ` (estimate: you need max(${winner.passesForPeople} for people, ${winner.passesForDays} for days) = ${winner.totalPassesNeeded} pass${winner.totalPassesNeeded > 1 ? 'es' : ''} × A$${(recommended.priceAUD ?? 0).toFixed(0)} ≈ A$${costFmt} total).`;

  const multiNote =
    winner.totalPassesNeeded > 1
      ? language === 'fr'
        ? ` Remarque : vous devrez acheter ce pass ${winner.totalPassesNeeded} fois pour couvrir tout le voyage.${mathExplain}`
        : language === 'bi'
          ? ` Notis: yu bae baem pas ia ${winner.totalPassesNeeded} taem blong kavrem ful trip.${mathExplain}`
          : ` Note: You will need to purchase this pass ${winner.totalPassesNeeded} times to cover your whole trip.${mathExplain}`
      : mathExplain.trimStart();

  const simplifyLine =
    showSimplifyMessage
      ? language === 'fr'
        ? ` Cela simplifie la gestion de votre groupe.`
        : language === 'bi'
          ? ` Hemia i mekem i isi blong manejem grup blong yu.`
          : ` This simplifies managing your group.`
      : '';

  const baseLine =
    showSimplifyMessage
      ? language === 'fr'
        ? `Pour ${totalPeople} personne${totalPeople > 1 ? 's' : ''} et ${totalDays} jour${totalDays > 1 ? 's' : ''}, nous recommandons le ${title}${usesShareBonus ? ' (capacité avec bonus de partage dans cette estimation)' : ''}.${simplifyLine}`
        : language === 'bi'
          ? `Blong ${totalPeople} man mo ${totalDays} dei, mifala i rekomendem ${title}${usesShareBonus ? ' (wetem bonus taem yu serem long estimate ia)' : ''}.${simplifyLine}`
          : `For your party of ${totalPeople} for ${totalDays} day${totalDays > 1 ? 's' : ''}, we recommend the ${title}${usesShareBonus ? ' (using Share Bonus capacity in this estimate)' : ''}.${simplifyLine}`
      : language === 'fr'
        ? `Pour ${totalPeople} personne${totalPeople > 1 ? 's' : ''} et ${totalDays} jour${totalDays > 1 ? 's' : ''}, l’option la moins chère est le ${title}${usesShareBonus ? ' (capacité avec bonus de partage)' : ''}.`
        : language === 'bi'
          ? `Blong ${totalPeople} man mo ${totalDays} dei, opsen i smol long mani hem ${title}${usesShareBonus ? ' (wetem bonus taem yu serem)' : ''}.`
          : `For your party of ${totalPeople} for ${totalDays} day${totalDays > 1 ? 's' : ''}, the cheapest option is the ${title}${usesShareBonus ? ' (using Share Bonus capacity in this estimate)' : ''}.`;

  return {
    recommendedPass: recommended,
    recommendedPassType: recommended.type,
    totalPeople,
    totalDays,
    usesShareBonus,
    totalPassesNeeded: winner.totalPassesNeeded,
    totalEstimatedCostAUD: winner.totalEstimatedCostAUD,
    recommendationText: (baseLine + multiNote + shareTip).trim(),
  };
}
