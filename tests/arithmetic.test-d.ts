/**
 * Validation target — the arithmetic grammar (the README's flagship example).
 *
 * This is the end-to-end proof of the MVP (layers 0→4): named/recursive rules,
 * `Map` rewriting matches into AST nodes, number literals, whitespace handling,
 * operator precedence, associativity, and parentheses.
 *
 * AST shape (per the README): numbers are numeric literal types; binary
 * operations are `{ op; left; right }`.
 */

import type { Arithmetic, Parse } from "../src/index";
import type { Equal, Expect } from "./harness";

/* The exact example from the README. */
export type _readme = Expect<
  Equal<Parse<Arithmetic, "1 + 2 * 3">, { op: "+"; left: 1; right: { op: "*"; left: 2; right: 3 } }>
>;

/* A bare number is a whole expression — and multi-digit literals collapse to one number. */
export type _atom = Expect<Equal<Parse<Arithmetic, "42">, 42>>;

/* Precedence: `*` binds tighter than `+`. */
export type _precedence = Expect<
  Equal<Parse<Arithmetic, "2 * 3 + 1">, { op: "+"; left: { op: "*"; left: 2; right: 3 }; right: 1 }>
>;

/* Associativity: `+` is left-associative. */
export type _assoc_left = Expect<
  Equal<Parse<Arithmetic, "1 + 2 + 3">, { op: "+"; left: { op: "+"; left: 1; right: 2 }; right: 3 }>
>;

/* Parentheses override precedence. */
export type _parens = Expect<
  Equal<
    Parse<Arithmetic, "(1 + 2) * 3">,
    { op: "*"; left: { op: "+"; left: 1; right: 2 }; right: 3 }
  >
>;
