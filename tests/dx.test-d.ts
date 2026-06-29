/**
 * Layer 6 — developer experience.
 *
 * Conventions asserted here:
 *   - `Explain` turns a `Failure` into a readable `parse error: …` string and
 *     passes a success value through unchanged.
 *   - `IsSuccess` / `IsFailure` classify a `Parse` result.
 *   - primitive failures carry a useful reason (the expected token) and the
 *     remaining input as their position.
 */

import { describe, expectTypeOf, test } from "vitest";

import type { Parse, Lit, Seq, Explain, IsSuccess, IsFailure } from "../src/index";

describe("Explain — render a result", () => {
  test("formats a failure's reason and position", () => {
    expectTypeOf<
      Explain<Parse<Lit<"foo">, "bar">>
    >().toEqualTypeOf<`parse error: expected "foo" (at "bar")`>();
  });
  test("reports end-of-input position", () => {
    expectTypeOf<
      Explain<Parse<Seq<[Lit<"a">, Lit<"b">]>, "a">>
    >().toEqualTypeOf<`parse error: expected "b" (at end of input)`>();
  });
  test("passes a successful value through unchanged", () => {
    expectTypeOf<Explain<Parse<Lit<"foo">, "foo">>>().toEqualTypeOf<"foo">();
  });
});

describe("IsSuccess / IsFailure — classify a result", () => {
  test("a failure", () => {
    expectTypeOf<IsFailure<Parse<Lit<"a">, "b">>>().toEqualTypeOf<true>();
    expectTypeOf<IsSuccess<Parse<Lit<"a">, "b">>>().toEqualTypeOf<false>();
  });
  test("a success", () => {
    expectTypeOf<IsFailure<Parse<Lit<"a">, "a">>>().toEqualTypeOf<false>();
    expectTypeOf<IsSuccess<Parse<Lit<"a">, "a">>>().toEqualTypeOf<true>();
  });
});
