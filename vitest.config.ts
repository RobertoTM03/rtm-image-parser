import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    testTimeout: 20000,
    // Integration tests share one real Postgres instance and truncate
    // shared tables between cases; running test files in parallel causes
    // cross-file races (one file's TRUNCATE wiping another's fixtures).
    fileParallelism: false,
  },
});
