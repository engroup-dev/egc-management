import fs from "fs";
import path from "path";
import { defineConfig } from "vite";

const pkg = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "package.json"), "utf8"),
) as { version: string };

// https://vitejs.dev/config
export default defineConfig({
  define: {
    // Used as the on-disk query cache buster: each release starts from a
    // clean cache instead of hydrating data shaped for the previous one.
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
