import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "evals/held-out/**/*.test.ts",
      "evals/learner-pilot/**/*.test.ts",
    ],
  },
});
