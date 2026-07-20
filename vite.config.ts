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

/** Skip modulepreload for heavy admin/editor/map chunks on the tourist entry HTML. */
function shouldPreloadDep(dep: string): boolean {
  const base = dep.split("/").pop() || dep;
  if (base.includes("vendor-recharts")) return false;
  if (base.includes("vendor-quill")) return false;
  if (base.includes("vendor-maps")) return false;
  return true;
}

// https://vitejs.dev/config/
export default defineConfig(async ({ mode }) => {
  const analyze = mode === "analyze" || process.env.ANALYZE === "true";
  const plugins = [react()];
  if (analyze) {
    const { visualizer } = await import("rollup-plugin-visualizer");
    plugins.push(
      visualizer({
        filename: "artifacts/perf/bundle-visualizer.html",
        gzipSize: true,
        brotliSize: true,
        template: "treemap",
        open: false,
      }),
    );
  }

  // Vite may still list async-chunk CSS in index.html; strip map/editor CSS so
  // tourists don't pay for Leaflet/Quill styles on first paint.
  plugins.push({
    name: "strip-heavy-async-css-from-html",
    transformIndexHtml(html) {
      return html
        .replace(/<link rel="stylesheet"[^>]*vendor-maps[^>]*>\s*/gi, "")
        .replace(/<link rel="stylesheet"[^>]*vendor-quill[^>]*>\s*/gi, "");
    },
  });

  return {
    server: {
      host: "::",
      port: 8080,
    },
    plugins,
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      chunkSizeWarningLimit: 600,
      modulePreload: {
        resolveDependencies: (_filename, deps) => deps.filter(shouldPreloadDep),
      },
      rollupOptions: {
        output: {
          manualChunks,
        },
      },
    },
  };
});
