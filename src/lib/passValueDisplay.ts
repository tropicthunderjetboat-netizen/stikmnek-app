/**
 * Rough VT equivalent for pass purchase (AUD) on tourist dashboard — illustrative only, not FX advice.
 */
export const APPROX_VTU_PER_AUD = 80;

export function approximateVatuFromAud(aud: number): number {
  if (!Number.isFinite(aud) || aud <= 0) return 0;
  return Math.round(aud * APPROX_VTU_PER_AUD);
}
