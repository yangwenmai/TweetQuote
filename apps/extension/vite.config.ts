import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@tweetquote/config": path.resolve(__dirname, "../../packages/config/src"),
      "@tweetquote/domain": path.resolve(__dirname, "../../packages/domain/src"),
      "@tweetquote/editor-core": path.resolve(__dirname, "../../packages/editor-core/src"),
      "@tweetquote/render-core": path.resolve(__dirname, "../../packages/render-core/src"),
      "@tweetquote/sdk": path.resolve(__dirname, "../../packages/sdk/src"),
      "@tweetquote/ui": path.resolve(__dirname, "../../packages/ui/src"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        panel: path.resolve(__dirname, "panel.html"),
        content: path.resolve(__dirname, "src/content/index.ts"),
        background: path.resolve(__dirname, "src/background/index.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
});
