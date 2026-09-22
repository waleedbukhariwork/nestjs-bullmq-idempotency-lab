import { fileURLToPath } from "node:url";
import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

const fromRoot = (path: string) =>
  fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [swc.vite()],
  resolve: {
    alias: {
      "@lab/config": fromRoot("./libs/config/src/index.ts"),
      "@lab/contracts": fromRoot("./libs/contracts/src/index.ts"),
      "@lab/credits": fromRoot("./libs/credits/src/index.ts"),
      "@lab/database": fromRoot("./libs/database/src/index.ts"),
      "@lab/observability": fromRoot("./libs/observability/src/index.ts"),
      "@lab/queue": fromRoot("./libs/queue/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["libs/**/*.spec.ts"],
  },
});
