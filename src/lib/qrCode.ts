import { useEffect, useState } from 'react';

export type QrRenderOptions = {
  /** Pixel width/height of the square QR image. */
  size?: number;
  /** Hex without # or with — dark modules (default teal). */
  dark?: string;
  light?: string;
};

/**
 * Build a data-URL QR locally so pass tickets work offline / without api.qrserver.com.
 */
export async function buildQrDataUrl(
  payload: string,
  opts: QrRenderOptions = {},
): Promise<string> {
  const size = opts.size ?? 280;
  const dark = (opts.dark || '#0d9488').replace(/^#/, '#');
  const light = (opts.light || '#ffffff').replace(/^#/, '#');
  const QR = await import('qrcode');
  return QR.toDataURL(payload, {
    width: size,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark, light },
  });
}

/** React hook — returns null while generating or when payload is empty. */
export function useQrDataUrl(
  payload: string | null | undefined,
  opts: QrRenderOptions = {},
): string | null {
  const size = opts.size ?? 280;
  const dark = opts.dark ?? '#0d9488';
  const light = opts.light ?? '#ffffff';
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!payload) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    void buildQrDataUrl(payload, { size, dark, light })
      .then((dataUrl) => {
        if (!cancelled) setUrl(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [payload, size, dark, light]);

  return url;
}

/** Session flag: after purchase, Saved tab shows “message your trip” coaching. */
export const POST_PURCHASE_TRIP_FOCUS_KEY = 'stikmnek_post_purchase_trip_focus';

export function markPostPurchaseTripFocus(): void {
  try {
    sessionStorage.setItem(POST_PURCHASE_TRIP_FOCUS_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function consumePostPurchaseTripFocus(): boolean {
  try {
    const v = sessionStorage.getItem(POST_PURCHASE_TRIP_FOCUS_KEY);
    if (v !== '1') return false;
    sessionStorage.removeItem(POST_PURCHASE_TRIP_FOCUS_KEY);
    return true;
  } catch {
    return false;
  }
}

export function peekPostPurchaseTripFocus(): boolean {
  try {
    return sessionStorage.getItem(POST_PURCHASE_TRIP_FOCUS_KEY) === '1';
  } catch {
    return false;
  }
}
