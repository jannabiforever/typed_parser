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

import { describe, expectTypeOf, test } from "vitest";

import type { Arithmetic, Parse } from "../src/index";

describe("Arithmetic", () => {
  test("the exact example from the README", () => {
    expectTypeOf<Parse<Arithmetic, "1 + 2 * 3">>().toEqualTypeOf<{
      op: "+";
      left: 1;
      right: { op: "*"; left: 2; right: 3 };
    }>();
  });

  test("a bare number is a whole expression — multi-digit literals collapse to one number", () => {
    expectTypeOf<Parse<Arithmetic, "42">>().toEqualTypeOf<42>();
  });

  test("precedence: '*' binds tighter than '+'", () => {
    expectTypeOf<Parse<Arithmetic, "2 * 3 + 1">>().toEqualTypeOf<{
      op: "+";
      left: { op: "*"; left: 2; right: 3 };
      right: 1;
    }>();
  });

  test("associativity: '+' is left-associative", () => {
    expectTypeOf<Parse<Arithmetic, "1 + 2 + 3">>().toEqualTypeOf<{
      op: "+";
      left: { op: "+"; left: 1; right: 2 };
      right: 3;
    }>();
  });

  test("parentheses override precedence", () => {
    expectTypeOf<Parse<Arithmetic, "(1 + 2) * 3">>().toEqualTypeOf<{
      op: "*";
      left: { op: "+"; left: 1; right: 2 };
      right: 3;
    }>();
  });
});
