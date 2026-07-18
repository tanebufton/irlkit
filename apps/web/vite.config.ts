import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev, proxy API + live-status WebSocket to the local api service so the SPA
// works the same as it does behind Caddy in production.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:3000", changeOrigin: true },
      "/ws": { target: "ws://localhost:3000", ws: true },
    },
  },
  build: { outDir: "dist" },
});
