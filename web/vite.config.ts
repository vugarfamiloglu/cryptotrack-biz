import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 6810,
    proxy: {
      "/api": { target: "http://localhost:6800", changeOrigin: true },
    },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
