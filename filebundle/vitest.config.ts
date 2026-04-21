import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve("./src"),
      "cloudflare:workers": path.resolve(
        "./tests/helpers/cloudflare-workers-mock.ts",
      ),
    },
  },
});
