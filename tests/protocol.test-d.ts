/**
 * Layer 1 — the core protocol (`Success` / `Failure`).
 *
 * These shapes are defined in `src/index.ts`, so this file is expected to be
 * GREEN already. It also pins the discriminant the rest of the suite relies on
 * via `IsErr`.
 */

import type { Success, Failure } from "../src/index";
import type { Equal, Expect, IsErr } from "./harness";

/* A Success carries the produced value plus the remaining (unconsumed) input. */
export type _success_tag = Expect<Equal<Success<"a", "bc">["_tag"], "Success">>;
export type _success_value = Expect<Equal<Success<"a", "bc">["value"], "a">>;
export type _success_rest = Expect<Equal<Success<"a", "bc">["rest"], "bc">>;

/* A Failure carries a reason and the position at which it occurred. */
export type _failure_tag = Expect<Equal<Failure<"nope", 0>["_tag"], "Failure">>;
export type _failure_reason = Expect<Equal<Failure<"nope", 0>["reason"], "nope">>;

/* IsErr discriminates the two arms (used throughout the suite for failure cases). */
export type _iserr_failure = Expect<IsErr<Failure<"nope", 0>>>;
export type _iserr_success = Expect<Equal<IsErr<Success<"a", "">>, false>>;
