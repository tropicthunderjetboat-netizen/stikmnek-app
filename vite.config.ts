import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

function manualChunks(id: string): string | undefined {
  if (!id.includes("node_modules")) return;

  // Large / rarely-used-on-first-paint deps — stable chunk names improve HTTP cache.
  if (id.includes("react-quill") || id.includes("node_modules/quill")) return "vendor-quill";
  if (id.includes("recharts")) return "vendor-recharts";
  if (id.includes("leaflet") || id.includes("react-leaflet")) return "vendor-maps";
  if (id.includes("@supabase")) return "vendor-supabase";
  if (id.includes("@tanstack/react-query")) return "vendor-query";
  if (id.includes("@radix-ui")) return "vendor-radix";
  if (id.includes("lucide-react")) return "vendor-icons";
  if (
    id.includes("react-router") ||
    id.includes("node_modules/react/") ||
    id.includes("node_modules/react-dom/") ||
    id.includes("node_modules/scheduler/")
  ) {
    return "vendor-react";
  }
}

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react()
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
}));
