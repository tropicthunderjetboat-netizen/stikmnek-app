/** Tourist must hold a live pass (type + id) before WhatsApp / call / email unlock. */
export function hasActiveTouristPass(
  user: { pass?: unknown; passId?: string | null } | null | undefined,
): boolean {
  return Boolean(user?.pass && user?.passId);
}

type ProfileGate = {
  name?: string | null;
  full_name?: string | null;
  display_name?: string | null;
  whatsapp_number?: string | null;
  phone?: string | null;
  expected_arrival_date?: string | null;
  num_adults?: number | null;
} | null | undefined;

/** Required before checkout / FIRST25 claim: identity, WhatsApp, trip start, party size. */
export function isTouristReadyForPassCheckout(p: ProfileGate): boolean {
  if (!p) return false;
  const name = Boolean((p.name || p.full_name || p.display_name || '').trim());
  const whatsapp = Boolean((p.whatsapp_number || p.phone || '').trim());
  const arrival = Boolean(p.expected_arrival_date);
  const party = (p.num_adults ?? 0) >= 1;
  return name && whatsapp && arrival && party;
}
