// Creavia desktop: the studio's screens (../cloud/components) run here unchanged, inside the Creavia shell. Next.js
// pieces they import are swapped for small shims (src/shims), and every call to the studio's API goes through Rust
// (src/bridge), which holds the sign-in and talks to your Creavia Cloud. No CORS, and no key in the web view.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const cloud = path.resolve(here, "../cloud");
const shim = (f: string) => path.resolve(here, "src/shims", f);

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  resolve: {
    alias: [
      { find: /^@\/(.*)$/, replacement: `${cloud}/$1` },
      { find: /^next\/link$/, replacement: shim("next-link.tsx") },
      { find: /^next\/navigation$/, replacement: shim("next-navigation.ts") },
      { find: /^next\/dynamic$/, replacement: shim("next-dynamic.tsx") },
      { find: /^next$/, replacement: shim("next.ts") },
    ],
    dedupe: ["react", "react-dom"],
  },
  define: { "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV ?? "production"), "process.env": "{}" },
  server: { port: 1420, strictPort: true, fs: { allow: [here, cloud, path.resolve(here, "..")] } },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    target: "es2022",
    outDir: "dist",
    chunkSizeWarningLimit: 4000,
    sourcemap: false,
  },
});
