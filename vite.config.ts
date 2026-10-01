import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { powerApps } from "@microsoft/power-apps-vite/plugin"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), powerApps()],
  resolve: {
    alias: {
      // write-excel-file's public entry zips with fflate's async `zip`, which runs on Web Workers;
      // the code app's CSP blocks workers (worker-src 'none'), so the export never finished. This
      // module also exports `generateXlsxFileSync` (zipSync, no worker), which the package's exports
      // map doesn't expose. Declared in src/env.d.ts; used by src/data/exportExcel.ts.
      "write-excel-file-sync": fileURLToPath(new URL("./node_modules/write-excel-file/modules/export/writeXlsxFileUniversal.js", import.meta.url)),
    },
  },
});
