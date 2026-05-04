/**
 * When true, the dedicated Passes marketing page is skipped and the user goes
 * straight to checkout (cart is filled from profile in `purchasePass`).
 */
export function shouldOpenCheckoutInsteadOfPassesPage(
  user: { passId: string | null; type: string } | null | undefined,
): boolean {
  if (!user) return false;
  if (user.passId) return false;
  return user.type === 'tourist' || user.type === 'admin';
}
