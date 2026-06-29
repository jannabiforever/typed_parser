/**
 * Layer 5 — the string PEG surface.
 *
 * `Peg<Src>` compiles PEG expression text into a combinator tree; `ParsePeg<Src,
 * Input>` compiles and then runs it. Conventions asserted here:
 *   - `'abc'` -> `Lit<"abc">`; `[abc]` -> `CharIn<"abc">`; `.` -> `AnyChar`.
 *   - juxtaposition -> `Seq`; `/` -> `Or`; `* + ?` -> `Many` / `Many1` / `Opt`;
 *     `! &` -> `Not` / `And`; `( )` groups.
 *   - a single child is NOT wrapped (no one-element `Seq`/`Or`).
 */

import { describe, expectTypeOf, test } from "vitest";

import type {
  Peg,
  ParsePeg,
  Lit,
  CharIn,
  AnyChar,
  Seq,
  Or,
  Many,
  Many1,
  Opt,
  Not,
} from "../src/index";
import type { IsErr } from "./harness";

describe("Peg — compiling expression text into a combinator tree", () => {
  test("string literal -> Lit", () => {
    expectTypeOf<Peg<"'ab'">>().toEqualTypeOf<Lit<"ab">>();
  });
  test("char class -> CharIn", () => {
    expectTypeOf<Peg<"[abc]">>().toEqualTypeOf<CharIn<"abc">>();
  });
  test("dot -> AnyChar", () => {
    expectTypeOf<Peg<".">>().toEqualTypeOf<AnyChar>();
  });
  test("juxtaposition -> Seq", () => {
    expectTypeOf<Peg<"'a' 'b'">>().toEqualTypeOf<Seq<[Lit<"a">, Lit<"b">]>>();
  });
  test("slash -> Or", () => {
    expectTypeOf<Peg<"'a' / 'b'">>().toEqualTypeOf<Or<[Lit<"a">, Lit<"b">]>>();
  });
  test("postfix operators -> Many / Many1 / Opt", () => {
    expectTypeOf<Peg<"'a'*">>().toEqualTypeOf<Many<Lit<"a">>>();
    expectTypeOf<Peg<"'a'+">>().toEqualTypeOf<Many1<Lit<"a">>>();
    expectTypeOf<Peg<"'a'?">>().toEqualTypeOf<Opt<Lit<"a">>>();
  });
  test("prefix lookahead -> Not", () => {
    expectTypeOf<Peg<"!'a'">>().toEqualTypeOf<Not<Lit<"a">>>();
  });
  test("postfix binds tighter than juxtaposition", () => {
    expectTypeOf<Peg<"'a' 'b'*">>().toEqualTypeOf<Seq<[Lit<"a">, Many<Lit<"b">>]>>();
  });
  test("grouping overrides precedence", () => {
    expectTypeOf<Peg<"('a' / 'b')*">>().toEqualTypeOf<Many<Or<[Lit<"a">, Lit<"b">]>>>();
  });
});

describe("ParsePeg — compile then run, end to end", () => {
  test("repetition", () => {
    expectTypeOf<ParsePeg<"'a'*", "aaa">>().toEqualTypeOf<["a", "a", "a"]>();
  });
  test("ordered choice", () => {
    expectTypeOf<ParsePeg<"'a' / 'b'", "b">>().toEqualTypeOf<"b">();
  });
  test("grouped repetition", () => {
    expectTypeOf<ParsePeg<"('a' / 'b')+", "abba">>().toEqualTypeOf<["a", "b", "b", "a"]>();
  });
  test("sequence with negative lookahead", () => {
    expectTypeOf<ParsePeg<"!'a' .", "b">>().toEqualTypeOf<[null, "b"]>();
  });
  test("fails when input is left unconsumed", () => {
    expectTypeOf<IsErr<ParsePeg<"'a'", "ab">>>().toEqualTypeOf<true>();
  });
});
