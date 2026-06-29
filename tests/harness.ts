/**
 * Type-level test helpers.
 *
 * Assertions themselves are written with Vitest's `expectTypeOf<Actual>()
 * .toEqualTypeOf<Expected>()` (run in `--typecheck` mode). What remains here is
 * the one domain-specific predicate that Vitest can't express directly: deciding
 * whether a `Parse` result landed on the `Failure` arm.
 */

import type { Failure } from "../src/index";

/**
 * True when a `Parse` result is a `Failure` rather than an unwrapped success
 * value. The tuple wrappers stop union distribution and pin `never`, so failure
 * cases assert as `expectTypeOf<IsErr<...>>().toEqualTypeOf<true>()`.
 */
export type IsErr<T> = [T] extends [Failure] ? true : false;
