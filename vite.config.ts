import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist" },
  server: {
    // In local dev there is no Pages Function, so /api is proxied straight to
    // the SSH tunnel that already fronts the test node on port 51500.
    proxy: {
      "/api/rpc": {
        target: "http://127.0.0.1:5174",
        changeOrigin: true,
      },
    },
  },
});
