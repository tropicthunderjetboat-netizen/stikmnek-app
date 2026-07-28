/**
 * Star averages for display. Super Star tips are stored as rating 6 / has_super_star —
 * they must not inflate the 1–5 star average.
 */
export function averageStarRating(
  reviews: Array<{ rating?: number | null; has_super_star?: boolean | null }>,
): number | null {
  const samples = reviews
    .filter((r) => !r.has_super_star)
    .map((r) => Number(r.rating))
    .filter((n) => Number.isFinite(n) && n > 0)
    .map((n) => Math.min(5, n));
  if (samples.length === 0) return null;
  return samples.reduce((sum, n) => sum + n, 0) / samples.length;
}
