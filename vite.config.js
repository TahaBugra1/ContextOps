import { defineConfig } from "vite";
import { resolve } from "path";

/**
 * Chrome Extension Build Config
 * 
 * Only background.js and offscreen.js use npm imports (Orama, Transformers.js)
 * and need bundling. Content scripts (content.js, mainWorld.js) and UI scripts
 * (popup.js, options.js) are vanilla JS with no npm imports — they are copied
 * as-is by the post-build copy script.
 */
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: resolve(__dirname, "src/background.js"),
        offscreen: resolve(__dirname, "src/offscreen.js"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        format: "es",
      },
    },
    minify: false,
    sourcemap: false,
    target: "esnext",
  },
});
