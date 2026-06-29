/**
 * Layer 2 — primitive combinators.
 *
 * Conventions asserted here (the spec these tests pin down):
 *   - `Lit<S>`    succeeds with value `S`.
 *   - `CharIn<S>` succeeds with the single matched character.
 *   - `AnyChar`   succeeds with the single consumed character.
 *   - `EOF`       succeeds with value `null` at end of input; consumes nothing.
 *   - `Parse` requires the WHOLE input to be consumed; leftover input is a failure.
 */

import { describe, expectTypeOf, test } from "vitest";

import type { Lit, CharIn, AnyChar, EOF, Parse } from "../src/index";
import type { IsErr } from "./harness";

describe("Lit — exact string match", () => {
  test("succeeds on an exact match", () => {
    expectTypeOf<Parse<Lit<"foo">, "foo">>().toEqualTypeOf<"foo">();
  });
  test("fails on a mismatch", () => {
    expectTypeOf<IsErr<Parse<Lit<"foo">, "bar">>>().toEqualTypeOf<true>();
  });
  test("fails when input is left unconsumed", () => {
    // "bar" left unconsumed
    expectTypeOf<IsErr<Parse<Lit<"foo">, "foobar">>>().toEqualTypeOf<true>();
  });
});

describe("CharIn — one character drawn from the set", () => {
  test("succeeds with the matched character", () => {
    expectTypeOf<Parse<CharIn<"abc">, "b">>().toEqualTypeOf<"b">();
  });
  test("fails on a character outside the set", () => {
    expectTypeOf<IsErr<Parse<CharIn<"abc">, "d">>>().toEqualTypeOf<true>();
  });
});

describe("AnyChar — exactly one character of anything", () => {
  test("succeeds on a single character", () => {
    expectTypeOf<Parse<AnyChar, "x">>().toEqualTypeOf<"x">();
  });
  test("fails on empty input", () => {
    expectTypeOf<IsErr<Parse<AnyChar, "">>>().toEqualTypeOf<true>();
  });
});

describe("EOF — matches only the empty remainder", () => {
  test("succeeds with null at end of input", () => {
    expectTypeOf<Parse<EOF, "">>().toEqualTypeOf<null>();
  });
  test("fails when input remains", () => {
    expectTypeOf<IsErr<Parse<EOF, "x">>>().toEqualTypeOf<true>();
  });
});
