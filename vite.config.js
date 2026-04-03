import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import sri from "vite-plugin-subresource-integrity";

export default defineConfig({
  plugins: [react(), sri()],
  build: {
    outDir: "dist",
  },
});
