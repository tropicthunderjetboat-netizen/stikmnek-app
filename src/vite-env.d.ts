/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** PayPal public client ID for Smart Buttons checkout. Must match Edge `PAYPAL_MODE` (sandbox vs live). */
  readonly VITE_PAYPAL_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
