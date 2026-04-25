import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "coverage", "cypress/videos", "cypress/screenshots"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-unused-vars": "off",
      /**
       * Prevent accidental eager loading of heavy libraries.
       *
       * Allowed import sites (via overrides below):
       * - Recharts: `src/components/DashboardAnalytics.tsx`, `src/components/AdminPurchaseOverview.tsx`
       * - Leaflet: `src/components/MapView.tsx`, `src/components/BusinessDetailMap.tsx`, `src/components/LocationMapPicker.tsx`
       * - Quill: `src/components/BusinessDescriptionEditor.tsx`
       *
       * Everywhere else, lazy-load the screen/component and/or prefetch via `src/lib/heavyChunks.ts`.
       */
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "recharts",
              message:
                "Avoid importing 'recharts' in app shells/shared modules. Keep charts behind React.lazy(). Use DashboardAnalytics/AdminPurchaseOverview, or lazy-load a chart component.",
            },
            {
              name: "leaflet",
              message:
                "Avoid importing 'leaflet' outside map-only components. Keep maps behind React.lazy() (MapView/BusinessDetailMap/LocationMapPicker).",
            },
            {
              name: "react-leaflet",
              message:
                "Avoid importing 'react-leaflet' outside map-only components. Keep maps behind React.lazy() (MapView/BusinessDetailMap/LocationMapPicker).",
            },
            {
              name: "react-leaflet-cluster",
              message:
                "Avoid importing 'react-leaflet-cluster' outside MapView. Keep clustering behind the lazy MapView chunk.",
            },
            {
              name: "react-quill",
              message:
                "Avoid importing 'react-quill' outside BusinessDescriptionEditor. Use LazyBusinessDescriptionEditor to keep Quill out of initial bundles.",
            },
          ],
        },
      ],
    },
  }
  ,
  // ── Allowed heavy import sites (narrow, explicit) ─────────────────────────
  {
    files: ["src/components/DashboardAnalytics.tsx", "src/components/AdminPurchaseOverview.tsx"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  {
    files: [
      "src/components/MapView.tsx",
      "src/components/BusinessDetailMap.tsx",
      "src/components/LocationMapPicker.tsx",
    ],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  {
    files: ["src/components/BusinessDescriptionEditor.tsx"],
    rules: {
      "no-restricted-imports": "off",
    },
  }
);
