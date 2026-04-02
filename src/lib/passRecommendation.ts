import type { UserProfile } from '@/contexts/AppContext';
import type { PassProductConfig, PassProductId } from '@/data/pricing';
import { inclusiveCalendarDaysBetween } from '@/lib/passValidity';

export interface PassRecommendation {
  recommendedPass: PassProductConfig;
  /** Same as `recommendedPass.id` — kept for UI comparison to pass config `type` field */
  recommendedPassType: PassProductId;
  totalPeople: number;
  totalDays: number;
  /** True when the winning option assumes Share Bonus capacity (post-purchase share). */
  usesShareBonus: boolean;
  recommendationText: string;
  /** Always 1 — the app supports one pass purchase per flow; see recommendationText when the trip exceeds one pass. */
  totalPassesNeeded: number;
  /** Price of one recommended pass (AUD). */
  totalEstimatedCostAUD: number;
  /**
   * Other feasible single-pass options (same trip, one purchase), for “also consider” copy.
   * Sorted for display: typically cheaper or no-share alternatives after the primary pick.
   */
  alternatives?: PassRecommendationAlternative[];
}

export interface PassRecommendationAlternative {
  passProductId: PassProductId;
  titleEn: string;
  titleFr: string;
  titleBi: string;
  priceAUD: number;
  mode: 'base' | 'share';
}

function clampInt(n: unknown, fallback: number): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(0, Math.floor(x));
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

interface FeasibleOption {
  pass: PassProductConfig;
  mode: CapacityMode;
  peopleCap: number;
  daysCap: number;
  price: number;
  /** (P/peopleCap)*(D/daysCap) — higher means less wasted capacity */
  utilization: number;
  /** Trip person-days per AUD — higher means better value */
  valueDensity: number;
}

function capsForMode(pass: PassProductConfig, mode: CapacityMode): { people: number; days: number } {
  if (mode === 'base') {
    return { people: Math.max(1, pass.basePeople), days: Math.max(1, pass.baseDays) };
  }
  return {
    people: Math.max(1, peopleAfterShare(pass)),
    days: Math.max(1, daysAfterShare(pass)),
  };
}

/** True if one pass in this mode covers the whole trip (people + calendar days). */
function coversTrip(
  pass: PassProductConfig,
  mode: CapacityMode,
  totalPeople: number,
  totalDays: number,
): boolean {
  const { people, days } = capsForMode(pass, mode);
  return totalPeople <= people && totalDays <= days;
}

function buildFeasibleOption(
  pass: PassProductConfig,
  mode: CapacityMode,
  totalPeople: number,
  totalDays: number,
): FeasibleOption | null {
  if (!coversTrip(pass, mode, totalPeople, totalDays)) return null;
  const { people: peopleCap, days: daysCap } = capsForMode(pass, mode);
  const utilization = (totalPeople / peopleCap) * (totalDays / daysCap);
  const personDays = totalPeople * totalDays;
  const price = pass.priceAUD ?? 0;
  const valueDensity = price > 0 ? personDays / price : 0;
  return { pass, mode, peopleCap, daysCap, price, utilization, valueDensity };
}

/**
 * Sort feasible single-pass options for a **logical** default, not “cheapest at any cost”.
 *
 * 1. Prefer **base** capacity (trip works without sharing) over **share** — clearer for guests.
 * 2. Prefer **higher value density** (person-days per dollar).
 * 3. Prefer **higher utilization** (tighter fit — avoids Mega for mid-size groups when a smaller pass fits).
 * 4. Prefer **lower price** as final tie-breaker.
 */
function compareFeasibleOptions(a: FeasibleOption, b: FeasibleOption): number {
  if (a.mode !== b.mode) return a.mode === 'base' ? -1 : 1;
  const vd = b.valueDensity - a.valueDensity;
  if (Math.abs(vd) > 1e-6) return vd > 0 ? 1 : -1;
  const u = b.utilization - a.utilization;
  if (Math.abs(u) > 1e-6) return u > 0 ? 1 : -1;
  return a.price - b.price;
}

/** Pass with the highest post-share people capacity (then days), for “one pass” overflow messaging. */
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

function formatAlternativesLine(
  alts: PassRecommendationAlternative[],
  lang: 'en' | 'fr' | 'bi',
): string {
  if (alts.length === 0) return '';
  const parts = alts.slice(0, 2).map((a) => {
    const t = lang === 'fr' ? a.titleFr : lang === 'bi' ? a.titleBi : a.titleEn;
    const modeNote =
      a.mode === 'share'
        ? lang === 'fr'
          ? ' (après partage)'
          : lang === 'bi'
            ? ' (afta serem)'
            : ' (after share)'
        : '';
    return `${t} ~A$${a.priceAUD.toFixed(0)}${modeNote}`;
  });
  if (lang === 'fr') {
    return ` Autres options possibles : ${parts.join(' · ')}.`;
  }
  if (lang === 'bi') {
    return ` Narafala joice: ${parts.join(' · ')}.`;
  }
  return ` Other options that fit your trip: ${parts.join(' · ')}.`;
}

/**
 * Recommends **one** pass purchase that matches app constraints (no multi-instance checkout).
 * If the trip cannot be covered by a single pass (any product, base or share), recommends the
 * highest-capacity pass and directs users to support for larger groups / longer stays.
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
  const totalDays =
    arrival && departure
      ? inclusiveCalendarDaysBetween(arrival, departure) ?? 1
      : 1;

  const feasible: FeasibleOption[] = [];
  for (const p of passProducts) {
    const baseOpt = buildFeasibleOption(p, 'base', totalPeople, totalDays);
    if (baseOpt) feasible.push(baseOpt);
    const shareOpt = buildFeasibleOption(p, 'share', totalPeople, totalDays);
    if (shareOpt) feasible.push(shareOpt);
  }

  const maxPass = getHighestCapacityPass(passProducts);
  const maxP = peopleAfterShare(maxPass);
  const maxD = daysAfterShare(maxPass);

  if (feasible.length === 0) {
    const recommended = maxPass;
    const title = displayPassTitle(recommended, language);
    const price = recommended.priceAUD ?? 0;
    const priceStr = price.toFixed(0);

    const body =
      language === 'fr'
        ? `Pour votre groupe de ${totalPeople} personne${totalPeople > 1 ? 's' : ''} pour ${totalDays} jour${totalDays > 1 ? 's' : ''}, aucun pass seul ne couvre tout le voyage dans l’app. Le ${title} offre le plus de marge après partage (jusqu’à ${maxP} personnes, ${maxD} jour${maxD > 1 ? 's' : ''}). Contactez le support pour un devis groupe, ou envisagez plusieurs pass si votre séjour le permet. À partir d’environ A$${priceStr}.`
        : language === 'bi'
          ? `Blong grup ${totalPeople} man mo ${totalDays} dei, no gat wan pas we i kavrem evriwan long app ia. ${title} i gat bigwan kapasiti afta yu serem (kasem ${maxP} man, ${maxD} dei). Askem support o tingbaot moa pas. Klosap A$${priceStr}.`
          : `For your party of ${totalPeople} over ${totalDays} day${totalDays > 1 ? 's' : ''}, no single pass covers the whole trip in the app. The ${title} has the largest capacity after sharing (up to ${maxP} people, ${maxD} day${maxD > 1 ? 's' : ''}). Contact support for a group quote, or plan multiple passes if that fits your stay. From about A$${priceStr}.`;

    return {
      recommendedPass: recommended,
      recommendedPassType: recommended.id,
      totalPeople,
      totalDays,
      usesShareBonus: true,
      totalPassesNeeded: 1,
      totalEstimatedCostAUD: price,
      recommendationText: body.trim(),
    };
  }

  feasible.sort(compareFeasibleOptions);
  const winner = feasible[0]!;
  const recommended = winner.pass;
  const usesShareBonus = winner.mode === 'share';
  const title = displayPassTitle(recommended, language);
  const price = recommended.priceAUD ?? 0;
  const priceStr = price.toFixed(0);

  const rest = feasible
    .filter(
      (o) =>
        !(o.pass.id === winner.pass.id && o.mode === winner.mode) &&
        (o.pass.id !== winner.pass.id || o.mode !== winner.mode),
    )
    .slice(0, 3);

  const alternatives: PassRecommendationAlternative[] = rest.map((o) => ({
    passProductId: o.pass.id,
    titleEn: o.pass.title,
    titleFr: o.pass.titleFr,
    titleBi: o.pass.titleBi,
    priceAUD: o.priceAUD ?? 0,
    mode: o.mode,
  }));

  // If we picked a share-mode option, no base-only pass covered the trip (base options sort first).
  const shareTip = usesShareBonus
    ? language === 'fr'
      ? ` Après l’achat, partagez l’app pour activer jusqu’à ${peopleAfterShare(recommended)} personnes et ${daysAfterShare(recommended)} jour${daysAfterShare(recommended) > 1 ? 's' : ''} sur ce pass.`
      : language === 'bi'
        ? ` Bifo trip i stret, serem app blong kasem kasem ${peopleAfterShare(recommended)} man mo ${daysAfterShare(recommended)} dei long pas ia.`
        : ` After purchase, share the app to unlock up to ${peopleAfterShare(recommended)} people and ${daysAfterShare(recommended)} day${daysAfterShare(recommended) > 1 ? 's' : ''} on this pass.`
    : '';

  const baseLine =
    language === 'fr'
      ? `Pour ${totalPeople} personne${totalPeople > 1 ? 's' : ''} et ${totalDays} jour${totalDays > 1 ? 's' : ''}, nous recommandons le ${title} — un seul achat couvre votre voyage (environ A$${priceStr}).`
      : language === 'bi'
        ? `Blong ${totalPeople} man mo ${totalDays} dei, mifala i rekomendem ${title} — wan pas i kavrem trip blong yu (klosap A$${priceStr}).`
        : `For your party of ${totalPeople} over ${totalDays} day${totalDays > 1 ? 's' : ''}, we recommend the ${title} — one purchase covers your trip (about A$${priceStr}).`;

  const altLine = formatAlternativesLine(alternatives, language);

  return {
    recommendedPass: recommended,
    recommendedPassType: recommended.id,
    totalPeople,
    totalDays,
    usesShareBonus,
    totalPassesNeeded: 1,
    totalEstimatedCostAUD: price,
    recommendationText: (baseLine + shareTip + altLine).trim(),
    alternatives: alternatives.length > 0 ? alternatives : undefined,
  };
}
