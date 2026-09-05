import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/city/",
  plugins: [react()],
  build: { sourcemap: true },
});
