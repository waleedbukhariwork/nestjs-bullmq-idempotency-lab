import baseConfig from "./vitest.config.mts";
import { defineConfig, mergeConfig } from "vitest/config";

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      fileParallelism: false,
      hookTimeout: 30_000,
      include: ["test/integration/**/*.integration-spec.ts"],
      testTimeout: 30_000,
    },
  }),
);
