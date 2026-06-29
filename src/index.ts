/**
 * typed_parser — public type surface.
 *
 * This is a SKELETON. The combinators and the `Parse` entry point are declared
 * here so the test suite (under `tests/`) has a stable contract to assert against,
 * but their bodies are not implemented yet — they resolve to `Unimplemented`, so
 * every behavioural assertion currently fails (the TDD "red" state). Implement the
 * types bottom-up (see the build order in CLAUDE.md) to turn the suite green.
 *
 * The result *shapes* each combinator is expected to produce are specified by the
 * tests, not here. See `tests/*.test-d.ts` for the authoritative conventions.
 */

/**
 * Placeholder for a not-yet-implemented type. A unique symbol so it is distinct
 * from every real result shape — any assertion against a real expectation fails
 * until the type is actually implemented.
 */
declare const _unimplemented: unique symbol;
export type Unimplemented<_Hint = unknown> = typeof _unimplemented;

/* ────────────────────────── Layer 1: core protocol ──────────────────────────
 * A parser maps a State (remaining input + position) to a Result: the tagged
 * union Success | Failure. These data shapes are defined (no logic), so the
 * protocol tests are green; everything built on top is still Unimplemented.
 */

export interface Success<Value, Rest extends string> {
  readonly _tag: "Success";
  readonly value: Value;
  readonly rest: Rest;
}

export interface Failure<Reason = unknown, Pos = unknown> {
  readonly _tag: "Failure";
  readonly reason: Reason;
  readonly pos: Pos;
}

/* ───────────────────── Layer 2: primitive combinators ─────────────────────── */

/** Match the exact string `S`. */
export type Lit<S extends string> = Unimplemented<S>;
/** Match a single character contained in `S`. */
export type CharIn<S extends string> = Unimplemented<S>;
/** Match any single character. */
export type AnyChar = Unimplemented;
/** Match only at end of input; consumes nothing. */
export type EOF = Unimplemented;

/* ───────────────────── Layer 3: composite combinators ─────────────────────── */

/** Run parsers in order; accumulate results into a tuple. */
export type Seq<Ps extends readonly unknown[]> = Unimplemented<Ps>;
/** PEG ordered choice — the first alternative that matches wins. */
export type Or<Ps extends readonly unknown[]> = Unimplemented<Ps>;
/** Zero or more (greedy). */
export type Many<P> = Unimplemented<P>;
/** One or more. */
export type Many1<P> = Unimplemented<P>;
/** Optional. */
export type Opt<P> = Unimplemented<P>;
/** Negative lookahead; consumes nothing. */
export type Not<P> = Unimplemented<P>;
/** Positive lookahead; consumes nothing. */
export type And<P> = Unimplemented<P>;
/** Rewrite a parse result into an AST node via the type-level function `F`. */
export type Map<P, F> = Unimplemented<[P, F]>;

/* ──────────────── Layer 4 + validation targets: entry & grammars ───────────── */

/** Run `Grammar` against `Input`; yields the AST value, or a `Failure`. */
export type Parse<Grammar, Input extends string> = Unimplemented<[Grammar, Input]>;

/** Example grammar: arithmetic with precedence, associativity, and parentheses. */
export type Arithmetic = Unimplemented;
