/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** PayPal app client ID for in-page Card Fields (public). Must match Edge `PAYPAL_MODE` (sandbox vs live). */
  readonly VITE_PAYPAL_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
