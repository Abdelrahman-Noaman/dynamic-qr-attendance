import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    // The shared geolocation module lives in ../frontend so the student page and
    // this dashboard use one implementation; allow the dev server to read it.
    host: true,
    allowedHosts: true,
    fs: {
      allow: [path.resolve(__dirname), path.resolve(__dirname, "..")],
    },
  },
  preview: { host: true, allowedHosts: true },
});
