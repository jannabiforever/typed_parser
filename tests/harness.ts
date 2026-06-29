/**
 * Type-level test harness.
 *
 * There is no runtime test runner — assertions are types, and `tsc --noEmit`
 * (`npm test`) is the runner. An assertion "fails" by producing a type error.
 *
 * Convention: write each assertion as an underscore-prefixed alias so ESLint's
 * `no-unused-vars` leaves it alone, e.g. `type _foo = Expect<Equal<A, B>>`.
 */

import type { Failure } from "../src/index";

/**
 * Strict, invariant type equality (the type-challenges / dtslint idiom). Unlike
 * a mutual-`extends` check, this distinguishes `any`, `never`, and unions from
 * their look-alikes — essential when asserting exact parser results.
 */
export type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

/** Compiles only when `T` is exactly `true`; otherwise tsc errors on the constraint. */
export type Expect<T extends true> = T;

/** Compiles only when `T` is exactly `false`. */
export type ExpectNot<T extends false> = T;

/** True when a `Parse` result is a `Failure` rather than an unwrapped success value. */
export type IsErr<T> = [T] extends [Failure] ? true : false;
