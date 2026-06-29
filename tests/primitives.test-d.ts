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

import type { Lit, CharIn, AnyChar, EOF, Parse } from "../src/index";
import type { Equal, Expect, IsErr } from "./harness";

/* Lit — exact string match. */
export type _lit_ok = Expect<Equal<Parse<Lit<"foo">, "foo">, "foo">>;
export type _lit_mismatch = Expect<IsErr<Parse<Lit<"foo">, "bar">>>;
export type _lit_leftover = Expect<IsErr<Parse<Lit<"foo">, "foobar">>>; // "bar" left unconsumed

/* CharIn — one character drawn from the set. */
export type _charin_ok = Expect<Equal<Parse<CharIn<"abc">, "b">, "b">>;
export type _charin_miss = Expect<IsErr<Parse<CharIn<"abc">, "d">>>;

/* AnyChar — exactly one character of anything. */
export type _anychar_ok = Expect<Equal<Parse<AnyChar, "x">, "x">>;
export type _anychar_empty = Expect<IsErr<Parse<AnyChar, "">>>;

/* EOF — matches only the empty remainder. */
export type _eof_ok = Expect<Equal<Parse<EOF, "">, null>>;
export type _eof_remaining = Expect<IsErr<Parse<EOF, "x">>>;
