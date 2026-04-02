/**
 * Trip guidance: explains base vs Share Bonus limits from profile dates & party size.
 * (Filename is legacy; there is no pass “recommendation” here.)
 */
import type { UserProfile } from '@/contexts/AppContext';
import type { PassProductConfig, PassProductId } from '@/data/pricing';
import { inclusiveCalendarDaysBetween } from '@/lib/passValidity';

/**
 * Explains base vs Share Bonus limits for the user’s trip — no product recommendations or prices.
 */
export interface PassTripGuidance {
  guidanceText: string;
  totalPeople: number;
  totalDays: number;
}

function clampInt(n: unknown, fallback: number): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(0, Math.floor(x));
}

type CapacityMode = 'base' | 'share';

function peopleAfterShare(p: PassProductConfig): number {
  return p.shareBonus?.totalPeopleAfterShare ?? (p.basePeople + (p.shareBonus?.extraPeople || 0));
}

function daysAfterShare(p: PassProductConfig): number {
  return p.shareBonus?.totalDaysAfterShare ?? (p.baseDays + (p.shareBonus?.extraDays || 0));
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

function coversTrip(
  pass: PassProductConfig,
  mode: CapacityMode,
  totalPeople: number,
  totalDays: number,
): boolean {
  const { people, days } = capsForMode(pass, mode);
  return totalPeople <= people && totalDays <= days;
}

function buildGuidanceText(
  language: 'en' | 'fr' | 'bi',
  totalPeople: number,
  totalDays: number,
  passProducts: PassProductConfig[],
): string {
  const canCoverWithoutShare = passProducts.some((p) => coversTrip(p, 'base', totalPeople, totalDays));
  const canCoverWithShare = passProducts.some((p) => coversTrip(p, 'share', totalPeople, totalDays));
  const anyShareOnly = passProducts.some(
    (p) => !coversTrip(p, 'base', totalPeople, totalDays) && coversTrip(p, 'share', totalPeople, totalDays),
  );
  const somePassHasFewerBaseDaysThanTrip = passProducts.some(
    (p) => coversTrip(p, 'share', totalPeople, totalDays) && capsForMode(p, 'base').days < totalDays,
  );

  const paragraphs: string[] = [];

  if (language === 'fr') {
    paragraphs.push(
      `Vous prévoyez ${totalPeople} personne${totalPeople > 1 ? 's' : ''} et ${totalDays} jour${totalDays > 1 ? 's' : ''} de réductions. Chaque pass indique combien de personnes et combien de jours de réduction sont inclus avant tout partage. Le bonus de partage n’ajoute des places et/ou des jours qu’après l’achat, lorsque vous utilisez « Partager l’app » — vérifiez les chiffres sur chaque carte.`,
    );
  } else if (language === 'bi') {
    paragraphs.push(
      `Yu planem ${totalPeople} man mo ${totalDays} dei blong diskount. Evri pas i soem hamas pipol mo hamas dei i stap insaed bifo yu serem. Bonus afta serem i adem moa pipol mo/oba moa dei afta yu bai, taem yu serem app — lukluk long namba long evri kaed.`,
    );
  } else {
    paragraphs.push(
      `You’re planning for ${totalPeople} ${totalPeople === 1 ? 'person' : 'people'} and ${totalDays} calendar day${totalDays > 1 ? 's' : ''} of discounts. Each pass shows how many people and how many discount days are included before you share anything. Share Bonus only adds extra people and/or days after you buy and use Share the app—check each card for the exact numbers.`,
    );
  }

  if (!canCoverWithShare) {
    if (language === 'fr') {
      paragraphs.push(
        `Pour ce nombre de personnes et cette durée, un seul pass proposé ici peut ne pas suffire. Contactez le support pour les très grands groupes ou les longs séjours, ou envisagez plusieurs pass si c’est possible.`,
      );
    } else if (language === 'bi') {
      paragraphs.push(
        `Long olgeta man mo taem olsem, wan pas long app i no save kavrem evri samting. Askem support o tingbaot moa wan pas.`,
      );
    } else {
      paragraphs.push(
        `For this party size and trip length, one pass offered here may not cover everything. Contact support for very large groups or long stays, or plan multiple passes if that works for you.`,
      );
    }
    return paragraphs.join('\n\n');
  }

  if (anyShareOnly && !canCoverWithoutShare) {
    if (language === 'fr') {
      paragraphs.push(
        `Pour votre groupe et vos dates, tout pass qui couvre l’ensemble du séjour dépend du bonus de partage : prévoyez de partager l’app juste après l’achat.`,
      );
    } else if (language === 'bi') {
      paragraphs.push(
        `Blong grup mo det blong yu, evri pas we i stret long hol trip i nidim bonus afta serem — serem app afta yu bai.`,
      );
    } else {
      paragraphs.push(
        `For your party and dates, any pass that covers the full trip relies on Share Bonus—plan to share the app right after you purchase.`,
      );
    }
  } else if (canCoverWithoutShare && anyShareOnly) {
    if (language === 'fr') {
      paragraphs.push(
        `Certaines combinaisons peuvent déjà tenir dans les limites « incluses » d’au moins un pass ; d’autres ne donnent toute la durée ou toute la capacité qu’après le partage. Comparez la ligne de base et le bonus sur chaque carte.`,
      );
    } else if (language === 'bi') {
      paragraphs.push(
        `Sam pas i save stret long base lim long wan pas; narafala i nidim serem bifo i stret. Kompem base mo bonus long evri kaed.`,
      );
    } else {
      paragraphs.push(
        `Some options already fit your whole trip within the included limits on at least one pass; others only reach your full head count or full dates after Share Bonus. Compare the base row and the bonus on each card.`,
      );
    }
  } else if (canCoverWithoutShare) {
    if (language === 'fr') {
      paragraphs.push(
        `Votre groupe et vos dates peuvent tenir dans les limites incluses d’au moins un pass : le bonus de partage peut rester optionnel pour couvrir tout le séjour. Vérifiez tout de même chaque carte.`,
      );
    } else if (language === 'bi') {
      paragraphs.push(
        `Grup mo det blong yu i save long insaed long wan pas we i no nidim serem. Hemi stret, taswe yu ridim evri kaed.`,
      );
    } else {
      paragraphs.push(
        `Your group and dates can fit within the included limits on at least one pass, so Share Bonus might not be required to cover the whole trip—still read each card to be sure.`,
      );
    }
  }

  if (somePassHasFewerBaseDaysThanTrip) {
    if (language === 'fr') {
      paragraphs.push(
        `Attention : plusieurs passes n’affichent pas autant de jours de réduction « inclus » que la durée totale de votre voyage. Si la durée incluse est plus courte que votre séjour, ce sont les jours supplémentaires du bonus de partage qui comblent l’écart — pas le forfait de base seul.`,
      );
    } else if (language === 'bi') {
      paragraphs.push(
        `Sam pas i gat les base dei long diskount long trip blong yu. Sapos base dei i liklik long ful taem blong yu, bonus afta serem i mas kavrem ol narafala dei — no base wan.`,
      );
    } else {
      paragraphs.push(
        `Watch for passes whose included discount days are shorter than your full trip. If the included day count is below your trip length, the extra days come from Share Bonus—not from the base package alone.`,
      );
    }
  }

  return paragraphs.join('\n\n');
}

/**
 * Guidance on base limits vs Share Bonus for the user’s profile dates and party size.
 * Does not recommend a specific pass or show prices.
 */
export function getPassTripGuidance(
  userProfile: UserProfile,
  passProducts: PassProductConfig[],
  opts?: { language?: 'en' | 'fr' | 'bi' },
): PassTripGuidance | null {
  const language = opts?.language ?? 'en';
  if (!userProfile || !passProducts || passProducts.length === 0) return null;

  const adults = clampInt(userProfile.num_adults, 1);
  const children = clampInt(userProfile.num_children, 0);
  const infants = clampInt(userProfile.num_infants, 0);
  const totalPeople = Math.max(1, adults + children + infants);

  const arrival = String((userProfile as { expected_arrival_date?: string }).expected_arrival_date ?? '').slice(0, 10);
  const departure = String((userProfile as { expected_departure_date?: string }).expected_departure_date ?? '').slice(0, 10);
  const totalDays =
    arrival && departure ? inclusiveCalendarDaysBetween(arrival, departure) ?? 1 : 1;

  return {
    guidanceText: buildGuidanceText(language, totalPeople, totalDays, passProducts),
    totalPeople,
    totalDays,
  };
}

// ─── Party-size “Recommended” badge (adults + children only; infants excluded) ───

function clampPartyCount(n: unknown): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.floor(x));
}

/**
 * Smallest pass tier we steer groups toward by headcount (adults + children).
 * Infants are not counted toward party size here.
 */
export function recommendedPassForPartySize(adults: unknown, children: unknown): PassProductId {
  const a = clampPartyCount(adults);
  const c = clampPartyCount(children);
  const n = Math.max(1, a + c);
  if (n <= 4) return 'family_explorer';
  if (n <= 6) return 'extended_group_adventure';
  if (n <= 8) return 'ultimate_crew_experience';
  return 'mega_group_experience';
}

function addCalendarDaysIso(isoDate: string, deltaDays: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const [y, m, d] = isoDate.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d, 12, 0, 0, 0);
  const next = new Date(t + deltaDays * 86400000);
  return next.toISOString().slice(0, 10);
}

function formatIsoDateShort(iso: string, language: 'en' | 'fr' | 'bi'): string {
  const d = new Date(iso + 'T12:00:00.000Z');
  if (Number.isNaN(d.getTime())) return iso;
  const loc = language === 'fr' ? 'fr-FR' : 'en-AU';
  return d.toLocaleDateString(loc, { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * When the tourist’s stay is longer than this pass’s base discount days, explain expiry vs Share Bonus.
 * Uses arrival as an illustrative “first discount day” so we can show example end dates.
 */
export function buildPassStayMismatchMessage(
  arrival: string,
  departure: string,
  passBaseDays: number,
  passFullDays: number,
  shareExtraDays: number,
  language: 'en' | 'fr' | 'bi',
): string | null {
  const a = String(arrival).slice(0, 10);
  const dep = String(departure).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(dep)) return null;

  const tripDays = inclusiveCalendarDaysBetween(a, dep);
  if (tripDays == null || tripDays <= passBaseDays) return null;

  const baseDays = Math.max(1, passBaseDays);
  const fullDays = Math.max(baseDays, passFullDays);
  const endBaseIso = addCalendarDaysIso(a, baseDays - 1);
  const endShareIso = addCalendarDaysIso(a, fullDays - 1);
  if (!endBaseIso || !endShareIso) return null;

  const arrivalFmt = formatIsoDateShort(a, language);
  const endBaseFmt = formatIsoDateShort(endBaseIso, language);
  const endShareFmt = formatIsoDateShort(endShareIso, language);
  const exceedsShareWindow = tripDays > fullDays;

  if (language === 'fr') {
    const parts: string[] = [
      `Votre séjour compte ${tripDays} jour${tripDays > 1 ? 's' : ''}, alors que ce pass inclut ${baseDays} jour${baseDays > 1 ? 's' : ''} de réductions avant le bonus de partage — pas toute la durée sur place.`,
      `Si vous commencez à utiliser les réductions le ${arrivalFmt}, la période « incluse » se termine le ${endBaseFmt}. Après cette date, le pass n’est plus valable pour les offres, même si vous êtes encore au Vanuatu. Vous choisissez quels jours utiliser ; beaucoup de voyageurs prennent des jours sans activités.`,
    ];
    if (shareExtraDays > 0) {
      parts.push(
        `Avec le bonus de partage (après achat, en partageant l’app), ce pass monte à ${fullDays} jour${fullDays > 1 ? 's' : ''} de réductions, jusqu’au ${endShareFmt}.`,
      );
    } else {
      parts.push(
        `Le bonus de partage sur ce pass ajoute surtout de la capacité (personnes), pas de jours supplémentaires.`,
      );
    }
    if (exceedsShareWindow) {
      parts.push(
        `Votre séjour dépasse même cette durée étendue : un seul pass ne couvrira pas chaque jour en réductions.`,
      );
    }
    return parts.join(' ');
  }

  if (language === 'bi') {
    const parts: string[] = [
      `Trip blong yu i gat ${tripDays} dei, be pas ia i gat ${baseDays} dei blong diskount bifo bonus afta serem — no long evri dei long aelan.`,
      `Sapos yu stat yusum diskount long ${arrivalFmt}, taem « insaed » i finis long ${endBaseFmt}. Afta det, pas i finis blong ol dils, maski yu stap yet long Vanuatu. Yu save josem wanwan dei we yu laik; fulap taem ol man i tek rest dei.`,
    ];
    if (shareExtraDays > 0) {
      parts.push(
        `Wetem bonus afta serem (afta bai, serem app), pas i kasem ${fullDays} dei blong diskount, kasem ${endShareFmt}.`,
      );
    } else {
      parts.push(`Bonus afta serem long pas ia i adem moa pipol, no moa dei.`);
    }
    if (exceedsShareWindow) {
      parts.push(`Trip blong yu i lonmoa tu long hem : wan pas bambae no kavrem evri dei long diskount.`);
    }
    return parts.join(' ');
  }

  const parts: string[] = [
    `Your travel dates span ${tripDays} days, but this pass includes ${baseDays} discount day${baseDays > 1 ? 's' : ''} before Share Bonus—not your whole time on island.`,
    `If you start using discounts on ${arrivalFmt}, the included period ends ${endBaseFmt}. After that, the pass is expired for deals, even if you’re still in Vanuatu. You choose which days to use; many guests take rest days and skip redemptions.`,
  ];
  if (shareExtraDays > 0) {
    parts.push(
      `With Share Bonus (after purchase, share the app), this pass reaches ${fullDays} discount day${fullDays > 1 ? 's' : ''}, through ${endShareFmt}.`,
    );
  } else {
    parts.push(`Share Bonus on this pass adds capacity (people), not extra discount days.`);
  }
  if (exceedsShareWindow) {
    parts.push(`Your stay is still longer than that—even with Share Bonus, one pass won’t cover every day with discounts.`);
  }
  return parts.join(' ');
}
