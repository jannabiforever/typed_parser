import { defineConfig } from "vitest/config";

/**
 * This is a type-only library — there is no runtime to exercise. The "tests" are
 * type-level assertions written with `expectTypeOf`, so we run Vitest purely in
 * typecheck mode: `tsc` (driven by Vitest) is the test runner, and a failing
 * assertion surfaces as a type error attributed to a named test.
 */
export default defineConfig({
  test: {
    typecheck: {
      enabled: true,
      include: ["tests/**/*.test-d.ts"],
      tsconfig: "./tsconfig.json",
    },
    // No runtime test files exist; everything is a type test handled above.
    include: [],
    passWithNoTests: true,
  },
});
