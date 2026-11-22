import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrations = await readD1Migrations("migrations");
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            OPENROUTER_API_KEY: "test-openrouter",
            GOOGLE_PLACES_KEY: "test-places",
            SHEET_SECRET: "test-secret",
            TURNSTILE_SECRET: "test-turnstile",
          },
        },
      }),
    ],
    // The e2e files under test/e2e run with node --test, not Vitest.
    test: { include: ["test/*.test.ts"], setupFiles: ["./test/setup.ts"] },
  };
});
