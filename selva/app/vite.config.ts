import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  base: "./",
  publicDir: "public",
  server: {
    port: 5365,
    host: "127.0.0.1",
  },
  build: {
    outDir: "../build",
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 2000,
  },
  define: {
    __ASSET_VER__: JSON.stringify("solo-1"),
  },
});
