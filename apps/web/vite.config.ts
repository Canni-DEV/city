import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "/city/",
  plugins: [react()],
  resolve: {
    dedupe: ["three"],
    alias: [
      {
        find: /^@city\/core$/,
        replacement: fileURLToPath(new URL("../../packages/core/src/index.ts", import.meta.url)),
      },
      {
        find: /^@city\/assets$/,
        replacement: fileURLToPath(new URL("../../packages/assets/src/index.ts", import.meta.url)),
      },
      {
        find: /^@city\/ui$/,
        replacement: fileURLToPath(new URL("../../packages/ui/src/index.ts", import.meta.url)),
      },
      {
        find: /^@city\/ui\/styles\.css$/,
        replacement: fileURLToPath(new URL("../../packages/ui/src/styles.css", import.meta.url)),
      },
    ],
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
  build: { sourcemap: true },
});
