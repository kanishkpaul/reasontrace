import { defineConfig } from "vitest/config";

const node = (name: string, include: string) => ({
  extends: true,
  test: { name, include: [include], setupFiles: ["test/noNetwork.ts"] },
});

export default defineConfig({
  test: {
    projects: [
      node("packages", "packages/**/src/**/*.test.ts"),
      node("server", "apps/server/src/**/*.test.ts"),
      "apps/web",
      { test: { name: "scripts", include: ["scripts/**/*.test.ts"] } },
    ],
  },
});
