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
import type { Equal, Expect, IsErr } from "./harness";

/* Seq — run in order, accumulate a tuple. */
export type _seq_ok = Expect<Equal<Parse<Seq<[Lit<"a">, Lit<"b">]>, "ab">, ["a", "b"]>>;
export type _seq_hetero = Expect<Equal<Parse<Seq<[Lit<"a">, CharIn<"xy">]>, "ay">, ["a", "y"]>>;
export type _seq_partial = Expect<IsErr<Parse<Seq<[Lit<"a">, Lit<"b">]>, "ax">>>;

/* Or — PEG ordered choice. */
export type _or_first = Expect<Equal<Parse<Or<[Lit<"a">, Lit<"b">]>, "a">, "a">>;
export type _or_second = Expect<Equal<Parse<Or<[Lit<"a">, Lit<"b">]>, "b">, "b">>;
export type _or_none = Expect<IsErr<Parse<Or<[Lit<"a">, Lit<"b">]>, "c">>>;
// Order matters: the longer alternative must come first to be preferred.
export type _or_ordered = Expect<Equal<Parse<Or<[Lit<"ab">, Lit<"a">]>, "ab">, "ab">>;
// The greedy trap: "a" wins first, leaving "b" — and Parse demands full consumption.
export type _or_greedy_trap = Expect<IsErr<Parse<Or<[Lit<"a">, Lit<"ab">]>, "ab">>>;

/* Many — zero or more. */
export type _many_zero = Expect<Equal<Parse<Many<Lit<"a">>, "">, []>>;
export type _many_some = Expect<Equal<Parse<Many<Lit<"a">>, "aaa">, ["a", "a", "a"]>>;

/* Many1 — one or more. */
export type _many1_empty = Expect<IsErr<Parse<Many1<Lit<"a">>, "">>>;
export type _many1_one = Expect<Equal<Parse<Many1<Lit<"a">>, "a">, ["a"]>>;

/* Opt — optional; null when absent. */
export type _opt_present = Expect<Equal<Parse<Opt<Lit<"a">>, "a">, "a">>;
export type _opt_absent = Expect<Equal<Parse<Opt<Lit<"a">>, "">, null>>;

/* Not — negative lookahead: consume nothing, value null, fail if P would match. */
export type _not_ok = Expect<Equal<Parse<Seq<[Not<Lit<"a">>, AnyChar]>, "b">, [null, "b"]>>;
export type _not_fail = Expect<IsErr<Parse<Seq<[Not<Lit<"a">>, AnyChar]>, "a">>>;

/* And — positive lookahead: consume nothing, value null, fail if P would not match. */
export type _and_ok = Expect<Equal<Parse<Seq<[And<Lit<"a">>, Lit<"a">]>, "a">, [null, "a"]>>;
export type _and_fail = Expect<IsErr<Parse<Seq<[And<Lit<"a">>, Lit<"a">]>, "b">>>;
