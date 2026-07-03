/** PayPal JS SDK — card-first for tourists who pay by debit/credit without a PayPal account. */
export function paypalButtonsSdkUrl(clientId: string): string {
  return (
    `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}` +
    '&currency=AUD&intent=capture&components=buttons' +
    '&enable-funding=card' +
    '&disable-funding=paylater,venmo'
  );
}

export type PayPalSdkNamespace = {
  Buttons: (cfg: Record<string, unknown>) => PayPalButtonsInstance & { isEligible: () => boolean };
  FUNDING?: { CARD?: string; PAYPAL?: string };
};

/** Load PayPal JS SDK with Smart Buttons (AUD capture). */
export function loadPayPalButtonsSdk(clientId: string): Promise<void> {
  const winButtons = () => (window as unknown as { paypal?: { Buttons?: unknown } }).paypal?.Buttons;

  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-stikmnek-paypal-sdk]') as HTMLScriptElement | null;
    if (existing && !existing.src.includes('components=buttons')) {
      existing.remove();
      try {
        delete (window as unknown as { paypal?: unknown }).paypal;
      } catch {
        /* ignore */
      }
    }

    if (winButtons()) {
      resolve();
      return;
    }

    const markReady = () => {
      if (winButtons()) resolve();
      else reject(new Error('PayPal SDK loaded but Buttons is not available'));
    };

    const existingReload = document.querySelector('script[data-stikmnek-paypal-sdk]') as HTMLScriptElement | null;
    if (existingReload) {
      if (winButtons()) {
        resolve();
        return;
      }
      existingReload.addEventListener('load', markReady);
      existingReload.addEventListener('error', () => reject(new Error('PayPal SDK failed to load')));
      return;
    }

    const s = document.createElement('script');
    s.src = paypalButtonsSdkUrl(clientId);
    s.async = true;
    s.dataset.stikmnekPaypalSdk = '1';
    s.onload = () => markReady();
    s.onerror = () => reject(new Error('PayPal SDK failed to load'));
    document.head.appendChild(s);
  });
}

export type PayPalButtonsInstance = {
  render: (selector: HTMLElement | string) => Promise<void>;
  close?: () => void;
};

export function getPayPalClientId(): string {
  return String(import.meta.env.VITE_PAYPAL_CLIENT_ID ?? '').trim();
}

/** Prefer debit/credit card (no PayPal account); fall back to PayPal wallet only if card is ineligible. */
export type PayPalCheckoutButtonTargets = {
  card: HTMLElement;
  wallet: HTMLElement;
};

/** Render debit/credit card (black) and PayPal wallet (gold) when each is eligible. */
export async function renderPayPalCheckoutButtons(
  paypal: PayPalSdkNamespace,
  buttonConfig: Record<string, unknown>,
  targets: PayPalCheckoutButtonTargets,
): Promise<{ card: boolean; wallet: boolean }> {
  targets.card.innerHTML = '';
  targets.wallet.innerHTML = '';

  const result = { card: false, wallet: false };

  const cardFunding = paypal.FUNDING?.CARD ?? 'card';
  const cardButtons = paypal.Buttons({
    ...buttonConfig,
    fundingSource: cardFunding,
    style: { layout: 'vertical', shape: 'rect', label: 'pay', color: 'black' },
  });
  if (cardButtons.isEligible()) {
    await cardButtons.render(targets.card);
    result.card = true;
  }

  const walletFunding = paypal.FUNDING?.PAYPAL ?? 'paypal';
  const walletButtons = paypal.Buttons({
    ...buttonConfig,
    fundingSource: walletFunding,
    style: { layout: 'vertical', shape: 'rect', label: 'paypal', color: 'gold' },
  });
  if (walletButtons.isEligible()) {
    await walletButtons.render(targets.wallet);
    result.wallet = true;
  }

  if (!result.card && !result.wallet) {
    throw new Error(
      'Payment buttons are not available on this PayPal account. Enable Advanced Credit and Debit Card Payments and “PayPal account optional” in PayPal → Account Settings.',
    );
  }

  return result;
}

/** @deprecated Use renderPayPalCheckoutButtons */
export async function renderGuestCardFirstButtons(
  paypal: PayPalSdkNamespace,
  buttonConfig: Record<string, unknown>,
  container: HTMLElement,
): Promise<'card' | 'wallet'> {
  const cardSlot = document.createElement('div');
  const walletSlot = document.createElement('div');
  container.appendChild(cardSlot);
  container.appendChild(walletSlot);
  const { card, wallet } = await renderPayPalCheckoutButtons(paypal, buttonConfig, {
    card: cardSlot,
    wallet: walletSlot,
  });
  if (card) return 'card';
  if (wallet) return 'wallet';
  throw new Error('No payment buttons available');
}
