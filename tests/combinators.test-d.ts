/**
 * Layer 3 — composite combinators.
 *
 * Conventions asserted here:
 *   - `Seq`   yields a tuple of the children's values.
 *   - `Or`    yields the matched alternative's value (PEG: first match wins).
 *   - `Many`  yields a tuple (possibly empty); `Many1` requires at least one.
 *   - `Opt`   yields the value, or `null` when absent.
 *   - `Not`/`And` are lookahead: they consume nothing and yield `null` on success.
 *
 * `Map` is exercised end-to-end by the arithmetic suite, since how its type-level
 * function `F` is encoded is still an open design decision.
 */

import { describe, expectTypeOf, test } from "vitest";

import type {
  Lit,
  CharIn,
  AnyChar,
  Seq,
  Or,
  Many,
  Many1,
  Opt,
  Not,
  And,
  Parse,
} from "../src/index";
import type { IsErr } from "./harness";

describe("Seq — run in order, accumulate a tuple", () => {
  test("yields a tuple of the children's values", () => {
    expectTypeOf<Parse<Seq<[Lit<"a">, Lit<"b">]>, "ab">>().toEqualTypeOf<["a", "b"]>();
  });
  test("accumulates heterogeneous child values", () => {
    expectTypeOf<Parse<Seq<[Lit<"a">, CharIn<"xy">]>, "ay">>().toEqualTypeOf<["a", "y"]>();
  });
  test("fails when a later child does not match", () => {
    expectTypeOf<IsErr<Parse<Seq<[Lit<"a">, Lit<"b">]>, "ax">>>().toEqualTypeOf<true>();
  });
});

describe("Or — PEG ordered choice", () => {
  test("takes the first alternative", () => {
    expectTypeOf<Parse<Or<[Lit<"a">, Lit<"b">]>, "a">>().toEqualTypeOf<"a">();
  });
  test("falls through to a later alternative", () => {
    expectTypeOf<Parse<Or<[Lit<"a">, Lit<"b">]>, "b">>().toEqualTypeOf<"b">();
  });
  test("fails when no alternative matches", () => {
    expectTypeOf<IsErr<Parse<Or<[Lit<"a">, Lit<"b">]>, "c">>>().toEqualTypeOf<true>();
  });
  test("order matters: the longer alternative must come first to be preferred", () => {
    expectTypeOf<Parse<Or<[Lit<"ab">, Lit<"a">]>, "ab">>().toEqualTypeOf<"ab">();
  });
  test("the greedy trap: 'a' wins first, leaving 'b' — and Parse demands full consumption", () => {
    expectTypeOf<IsErr<Parse<Or<[Lit<"a">, Lit<"ab">]>, "ab">>>().toEqualTypeOf<true>();
  });
});

describe("Many — zero or more", () => {
  test("yields the empty tuple on zero matches", () => {
    expectTypeOf<Parse<Many<Lit<"a">>, "">>().toEqualTypeOf<[]>();
  });
  test("accumulates each match", () => {
    expectTypeOf<Parse<Many<Lit<"a">>, "aaa">>().toEqualTypeOf<["a", "a", "a"]>();
  });
});

describe("Many1 — one or more", () => {
  test("fails on zero matches", () => {
    expectTypeOf<IsErr<Parse<Many1<Lit<"a">>, "">>>().toEqualTypeOf<true>();
  });
  test("succeeds on a single match", () => {
    expectTypeOf<Parse<Many1<Lit<"a">>, "a">>().toEqualTypeOf<["a"]>();
  });
});

describe("Opt — optional; null when absent", () => {
  test("yields the value when present", () => {
    expectTypeOf<Parse<Opt<Lit<"a">>, "a">>().toEqualTypeOf<"a">();
  });
  test("yields null when absent", () => {
    expectTypeOf<Parse<Opt<Lit<"a">>, "">>().toEqualTypeOf<null>();
  });
});

describe("Not — negative lookahead: consume nothing, value null, fail if P would match", () => {
  test("succeeds (null) when P would not match", () => {
    expectTypeOf<Parse<Seq<[Not<Lit<"a">>, AnyChar]>, "b">>().toEqualTypeOf<[null, "b"]>();
  });
  test("fails when P would match", () => {
    expectTypeOf<IsErr<Parse<Seq<[Not<Lit<"a">>, AnyChar]>, "a">>>().toEqualTypeOf<true>();
  });
});

describe("And — positive lookahead: consume nothing, value null, fail if P would not match", () => {
  test("succeeds (null) when P would match", () => {
    expectTypeOf<Parse<Seq<[And<Lit<"a">>, Lit<"a">]>, "a">>().toEqualTypeOf<[null, "a"]>();
  });
  test("fails when P would not match", () => {
    expectTypeOf<IsErr<Parse<Seq<[And<Lit<"a">>, Lit<"a">]>, "b">>>().toEqualTypeOf<true>();
  });
});
