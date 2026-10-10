import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  resolve: { tsconfigPaths: true },
  build: {
    rolldownOptions: {
      output: {
        // Libraries (React, the UI kit, Dexie) change only when dependencies are updated, our own
        // code on every release. Keeping them in separate files lets returning visitors re-download
        // just the small app file: the hashed assets are cached for a year (see public/_headers).
        codeSplitting: { groups: [{ name: "vendor", test: /node_modules/ }] },
      },
    },
  },
});
