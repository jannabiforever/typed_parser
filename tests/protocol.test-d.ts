/**
 * Layer 1 — the core protocol (`Success` / `Failure`).
 *
 * These shapes are defined in `src/index.ts`, so this file is expected to be
 * GREEN already. It also pins the discriminant the rest of the suite relies on
 * via `IsErr`.
 */

import { describe, expectTypeOf, test } from "vitest";

import type { Success, Failure } from "../src/index";
import type { IsErr } from "./harness";

describe("Success", () => {
  test("carries the produced value plus the remaining (unconsumed) input", () => {
    expectTypeOf<Success<"a", "bc">["_tag"]>().toEqualTypeOf<"Success">();
    expectTypeOf<Success<"a", "bc">["value"]>().toEqualTypeOf<"a">();
    expectTypeOf<Success<"a", "bc">["rest"]>().toEqualTypeOf<"bc">();
  });
});

describe("Failure", () => {
  test("carries a reason and the position at which it occurred", () => {
    expectTypeOf<Failure<"nope", 0>["_tag"]>().toEqualTypeOf<"Failure">();
    expectTypeOf<Failure<"nope", 0>["reason"]>().toEqualTypeOf<"nope">();
  });
});

describe("IsErr", () => {
  test("discriminates the two arms (used throughout the suite for failure cases)", () => {
    expectTypeOf<IsErr<Failure<"nope", 0>>>().toEqualTypeOf<true>();
    expectTypeOf<IsErr<Success<"a", "">>>().toEqualTypeOf<false>();
  });
});
