import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts", "tests/integration/**/*.test.tsx"],
    environment: "happy-dom",
    setupFiles: ["./tests/setup.ts"],
    globals: true
  },
  resolve: {
    alias: {
      "@shared": `${root}/shared/src`,
      "@client": `${root}/client/src`,
      "@server": `${root}/server/src`
    }
  }
});
