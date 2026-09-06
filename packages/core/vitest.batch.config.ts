import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.batch.test.ts"],
  },
});
