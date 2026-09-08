import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist",
    lib: {
      entry: {
        index: "src/procedural-character/index.ts",
        physics: "src/procedural-character/physics.ts",
      },
      formats: ["es"],
    },
    rollupOptions: {
      external: (id) => id === "three" || id.startsWith("three/") || id.startsWith("@dimforge/"),
    },
    minify: false,
  },
});
