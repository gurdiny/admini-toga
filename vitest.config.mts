import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": `${import.meta.dirname}/src`,
      // server-only lanza fuera de React Server Components; en pruebas no aplica.
      "server-only": `${import.meta.dirname}/src/test/server-only-stub.ts`,
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    env: { APP_TIMEZONE: "America/Mexico_City" },
  },
});
