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
    s.src =
      `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}` +
      '&currency=AUD&intent=capture&components=buttons';
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
