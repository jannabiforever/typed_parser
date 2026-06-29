/**
 * typed_parser — a PEG parser-combinator library that runs entirely in the
 * TypeScript type system. A parser is a *type*, and "running" it is type
 * instantiation: `Parse<Grammar, Input>` checks the string-literal type `Input`
 * against `Grammar` and yields the resulting AST as a type.
 *
 *     type Result = Parse<Arithmetic, "1 + 2 * 3">;
 *     //   ^? { op: "+"; left: 1; right: { op: "*"; left: 2; right: 3 } }
 *
 * The build is strictly bottom-up (see CLAUDE.md):
 *
 *   0. type-level utilities — string/tuple helpers + the higher-kinded `Apply`.
 *   1. core protocol        — `Success` / `Failure`.
 *   2. primitives           — `Lit` `CharIn` `AnyChar` `EOF`.
 *   3. composites           — `Seq` `Or` `Many` `Many1` `Opt` `Not` `And` `Map`.
 *   4. named/recursive rules — the `Rule` indirection.
 *   5. string PEG surface    — `Peg` / `ParsePeg` (a metaparser in the core combinators).
 *   6. limits & DX           — `Explain`, `IsSuccess` / `IsFailure`; tail-recursive eval.
 *   7. validation target     — `Arithmetic`.
 *
 * A combinator is an inert *description* (a tagged interface); the `Run`
 * interpreter walks a description against the remaining input. Combinators
 * compose by threading the `rest` of one `Success` into the next, and `Failure`
 * short-circuits. Because state lives in type parameters and is never mutated,
 * backtracking (`Or`, lookahead) is free: the input is simply re-used.
 */

/* ============================================================================
 * Layer 0 — type-level utilities
 *
 * The type system has no loops, mutation, or arithmetic, so: repetition is
 * recursion, state is a type parameter, and counting is tuple length. Everything
 * else rests on these helpers.
 * ========================================================================== */

/**
 * Higher-kinded "function" encoding. A type-level function is an interface that
 * `extends TypeFn` and redefines `output` in terms of `this["input"]`. `Apply`
 * supplies an argument by intersecting a fresh `input` and reading `output` back
 * — `this` then resolves to the intersection, so `this["input"]` is the argument.
 */
export interface TypeFn {
  readonly input: unknown;
  readonly output: unknown;
}
export type Apply<F extends TypeFn, X> = (F & { readonly input: X })["output"];

/** Concatenate a tuple of strings into a single string. */
type Join<T extends readonly unknown[]> = T extends readonly [
  infer H extends string,
  ...infer R extends readonly unknown[],
]
  ? `${H}${Join<R>}`
  : "";

/** Parse a numeric string-literal into its numeric-literal type (`"42"` → `42`). */
type ToNum<S extends string> = S extends `${infer N extends number}` ? N : never;

/** Strict string-literal equality — used to halt zero-width `Many` loops. */
type StrEq<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/* ============================================================================
 * Layer 1 — core protocol
 *
 * A parse step maps the remaining input to a tagged result: `Success` carries
 * the produced value plus the unconsumed `rest`; `Failure` carries a reason and
 * the position (here, the remaining input) at which it occurred.
 * ========================================================================== */

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

/* ============================================================================
 * Combinator descriptions — the public type surface
 *
 * Each combinator is an inert, tagged interface (`_p` is the discriminant). They
 * carry no logic; `Run` interprets them. Because every tag is unique, the order
 * of the dispatch clauses in `Run` is irrelevant.
 * ========================================================================== */

/* Layer 2 — primitives */

/** Match the exact string `S`; succeeds with value `S`. */
export interface Lit<S extends string> {
  readonly _p: "Lit";
  readonly s: S;
}
/** Match a single character contained in `S`; succeeds with that character. */
export interface CharIn<S extends string> {
  readonly _p: "CharIn";
  readonly s: S;
}
/** Match any single character; succeeds with the consumed character. */
export interface AnyChar {
  readonly _p: "AnyChar";
}
/** Match only at end of input; succeeds with `null`, consuming nothing. */
export interface EOF {
  readonly _p: "EOF";
}

/* Layer 3 — composites */

/** Run parsers in order; accumulate their values into a tuple. */
export interface Seq<Ps extends readonly unknown[]> {
  readonly _p: "Seq";
  readonly ps: Ps;
}
/** PEG ordered choice — the first alternative that matches wins. */
export interface Or<Ps extends readonly unknown[]> {
  readonly _p: "Or";
  readonly ps: Ps;
}
/** Zero or more (greedy); yields a (possibly empty) tuple. */
export interface Many<P> {
  readonly _p: "Many";
  readonly p: P;
}
/** One or more; yields a non-empty tuple, fails on zero matches. */
export interface Many1<P> {
  readonly _p: "Many1";
  readonly p: P;
}
/** Optional; yields the value, or `null` when absent. */
export interface Opt<P> {
  readonly _p: "Opt";
  readonly p: P;
}
/** Negative lookahead; consumes nothing, yields `null`, fails if `P` would match. */
export interface Not<P> {
  readonly _p: "Not";
  readonly p: P;
}
/** Positive lookahead; consumes nothing, yields `null`, fails if `P` would not match. */
export interface And<P> {
  readonly _p: "And";
  readonly p: P;
}
/** Rewrite a parse result into an AST node via the type-level function `F`. */
export interface Map<P, F extends TypeFn> {
  readonly _p: "Map";
  readonly p: P;
  readonly f: F;
}

/* Layer 4 — named / recursive rules */

/**
 * A named rule: an interface whose `rule` member holds its definition. Interface
 * members resolve lazily, so rules may reference one another — and themselves —
 * freely. This is what makes recursive grammars (`expr → term → factor → expr`)
 * expressible without tripping TypeScript's circular-alias check. PEG forbids
 * *left* recursion; encode it as repetition (`Many`) instead.
 */
export interface Rule<Def> {
  readonly _p: "Rule";
  readonly rule: Def;
}

/* ============================================================================
 * The interpreter — `Run<Parser, Input>`
 *
 * Dispatches on the description's `_p` tag (matched structurally via `infer`).
 * Returns a `Success` or a `Failure`. Each `RunX` helper is written
 * tail-recursively where it recurses, to stay under the instantiation ceiling.
 * ========================================================================== */

type Run<P, In extends string> =
  P extends Rule<infer R>
    ? Run<R, In>
    : P extends Lit<infer S>
      ? RunLit<S, In>
      : P extends CharIn<infer S>
        ? RunCharIn<S, In>
        : P extends AnyChar
          ? RunAnyChar<In>
          : P extends EOF
            ? RunEOF<In>
            : P extends Seq<infer Ps>
              ? RunSeq<Ps, In>
              : P extends Or<infer Ps>
                ? RunOr<Ps, In>
                : P extends Many1<infer Q>
                  ? RunMany1<Q, In>
                  : P extends Many<infer Q>
                    ? RunMany<Q, In>
                    : P extends Opt<infer Q>
                      ? RunOpt<Q, In>
                      : P extends Not<infer Q>
                        ? RunNot<Q, In>
                        : P extends And<infer Q>
                          ? RunAnd<Q, In>
                          : P extends Map<infer Q, infer F extends TypeFn>
                            ? RunMap<Q, F, In>
                            : Failure<"unknown parser", In>;

/* --- primitives --- */

type RunLit<S extends string, In extends string> = In extends `${S}${infer Rest}`
  ? Success<S, Rest>
  : Failure<`expected "${S}"`, In>;

type RunCharIn<S extends string, In extends string> = In extends `${infer C}${infer Rest}`
  ? S extends `${string}${C}${string}`
    ? Success<C, Rest>
    : Failure<`expected one of "${S}"`, In>
  : Failure<`expected one of "${S}"`, In>;

type RunAnyChar<In extends string> = In extends `${infer C}${infer Rest}`
  ? Success<C, Rest>
  : Failure<"expected any character", In>;

type RunEOF<In extends string> = In extends ""
  ? Success<null, "">
  : Failure<"expected end of input", In>;

/* --- composites --- */

type RunSeq<Ps, In extends string, Acc extends readonly unknown[] = []> = Ps extends readonly [
  infer Head,
  ...infer Tail,
]
  ? Run<Head, In> extends infer R
    ? R extends Success<infer V, infer Rest extends string>
      ? RunSeq<Tail, Rest, [...Acc, V]>
      : R // Failure short-circuits
    : never
  : Success<Acc, In>;

type RunOr<Ps, In extends string> = Ps extends readonly [infer Head, ...infer Tail]
  ? Run<Head, In> extends infer R
    ? R extends Success<unknown, string>
      ? R // first match wins
      : RunOr<Tail, In> // backtrack: try the next alternative on the same input
    : never
  : Failure<"no alternative matched", In>;

type RunMany<P, In extends string, Acc extends readonly unknown[] = []> =
  Run<P, In> extends Success<infer V, infer Rest extends string>
    ? StrEq<Rest, In> extends true
      ? Success<Acc, In> // zero-width match — halt rather than loop forever
      : RunMany<P, Rest, [...Acc, V]>
    : Success<Acc, In>; // first failure ends the repetition (never fails)

type RunMany1<P, In extends string> =
  Run<P, In> extends infer R
    ? R extends Success<infer V, infer Rest extends string>
      ? RunMany<P, Rest> extends Success<
          infer Vs extends readonly unknown[],
          infer Rest2 extends string
        >
        ? Success<[V, ...Vs], Rest2>
        : never // RunMany always succeeds; unreachable
      : R // the required first match failed
    : never;

type RunOpt<P, In extends string> =
  Run<P, In> extends infer R
    ? R extends Success<unknown, string>
      ? R
      : Success<null, In> // absent — yield null, consume nothing
    : never;

type RunNot<P, In extends string> =
  Run<P, In> extends Success<unknown, string>
    ? Failure<"negative lookahead matched", In>
    : Success<null, In>;

type RunAnd<P, In extends string> =
  Run<P, In> extends Success<unknown, string>
    ? Success<null, In>
    : Failure<"positive lookahead failed", In>;

type RunMap<P, F extends TypeFn, In extends string> =
  Run<P, In> extends infer R
    ? R extends Success<infer V, infer Rest extends string>
      ? Success<Apply<F, V>, Rest>
      : R
    : never;

/* ============================================================================
 * Entry point — `Parse<Grammar, Input>`
 *
 * Runs `Grammar`, then requires the *whole* input to be consumed: leftover input
 * is a failure. On success the value is unwrapped; on failure the `Failure` is
 * returned (the suite's `IsErr` detects it).
 * ========================================================================== */

export type Parse<Grammar, Input extends string> =
  Run<Grammar, Input> extends infer R
    ? R extends Success<infer V, infer Rest extends string>
      ? Rest extends ""
        ? V
        : Failure<"unexpected trailing input", Rest>
      : R
    : never;

/* ============================================================================
 * Layer 7 — validation target: the arithmetic grammar
 *
 * Standard PEG precedence ladder (left recursion encoded as repetition):
 *
 *     expr   = term   (("+" | "-") term)*      -- additive, left-associative
 *     term   = factor (("*" | "/") factor)*    -- multiplicative, left-associative
 *     factor = number | "(" expr ")"
 *     number = digit+                          -- collapses to a numeric literal
 *
 * Every token skips leading whitespace (`Tok`). Binary levels fold their
 * `(op, operand)*` tail left into `{ op; left; right }` nodes; a level with no
 * operators yields its bare operand, so a lone number parses to that number.
 * ========================================================================== */

/* --- tokens (whitespace-skipping) --- */

/** Project element 1 of a tuple (drops the leading-whitespace slot in `Tok`). */
interface Second extends TypeFn {
  readonly output: this["input"] extends readonly [unknown, infer B, ...unknown[]] ? B : never;
}

type WS = Many<CharIn<" \t\n\r">>;

/** Wrap a parser so it first skips leading whitespace, yielding only its value. */
type Tok<P> = Map<Seq<[WS, P]>, Second>;

type Digit = CharIn<"0123456789">;

/** Join a tuple of digit characters and read it back as a numeric literal. */
interface DigitsToNum extends TypeFn {
  readonly output: this["input"] extends infer Ds extends readonly string[]
    ? ToNum<Join<Ds>>
    : never;
}

type Num = Tok<Map<Many1<Digit>, DigitsToNum>>;
type LParen = Tok<Lit<"(">>;
type RParen = Tok<Lit<")">>;
type AddOp = Tok<CharIn<"+-">>;
type MulOp = Tok<CharIn<"*/">>;

/* --- AST builders --- */

/** Left-fold a `[first, [op, operand][]]` shape into nested binary nodes. */
interface FoldBinary extends TypeFn {
  readonly output: this["input"] extends readonly [
    infer First,
    infer Pairs extends readonly unknown[],
  ]
    ? FoldBinaryImpl<First, Pairs>
    : never;
}
type FoldBinaryImpl<Acc, Pairs extends readonly unknown[]> = Pairs extends readonly [
  readonly [infer Op, infer Right],
  ...infer Rest extends readonly unknown[],
]
  ? FoldBinaryImpl<{ op: Op; left: Acc; right: Right }, Rest>
  : Acc;

/** Extract the inner expression from a `["(", expr, ")"]` match. */
interface ParenInner extends TypeFn {
  readonly output: this["input"] extends readonly [unknown, infer E, unknown] ? E : never;
}

/* --- rules (mutually recursive via the `Rule` indirection) --- */

type Paren = Map<Seq<[LParen, ExprRule, RParen]>, ParenInner>;

type FactorRule = Rule<Or<[Num, Paren]>>;
type TermRule = Rule<Map<Seq<[FactorRule, Many<Seq<[MulOp, FactorRule]>>]>, FoldBinary>>;
type ExprRule = Rule<Map<Seq<[TermRule, Many<Seq<[AddOp, TermRule]>>]>, FoldBinary>>;

/** Arithmetic with precedence, left-associativity, and parentheses. */
export type Arithmetic = ExprRule;

/* ============================================================================
 * Layer 5 — string PEG surface
 *
 * A *metaparser*, written in the core combinators above, that compiles PEG
 * expression text into a combinator tree:
 *
 *     Expr    = Seq ("/" Seq)*          -- ordered choice
 *     Seq     = Unary+                  -- juxtaposition
 *     Unary   = ("!" | "&")? Primary ("*" | "+" | "?")?
 *     Primary = Literal | Class | "." | "(" Expr ")"
 *     Literal = "'" (!"'" .)* "'"       -- 'abc'  ->  Lit<"abc">
 *     Class   = "[" (!"]" .)* "]"       -- [abc]  ->  CharIn<"abc">
 *
 * This grammar is itself built from `Seq`/`Or`/`Many`/`Map`, and its `Map`
 * functions emit the matching combinator descriptions. So `Peg<Src>` runs the
 * metaparser over `Src` to yield a parser, and `Parse` (or `ParsePeg`) then runs
 * that parser over real input. Char classes are explicit sets (no `a-z` ranges)
 * and there are no named-rule references yet — both are natural extensions.
 * ========================================================================== */

/* --- result builders (each emits a combinator description) --- */

/** Project element 0 of a tuple. */
interface First extends TypeFn {
  readonly output: this["input"] extends readonly [infer A, ...unknown[]] ? A : never;
}

/** Concatenate the second element of every `[_, char]` pair into one string. */
type JoinSeconds<Pairs extends readonly unknown[]> = Pairs extends readonly [
  readonly [unknown, infer C extends string],
  ...infer Rest extends readonly unknown[],
]
  ? `${C}${JoinSeconds<Rest>}`
  : "";

/** `["'", [_, char][], "'"]` -> `Lit<"chars">`. */
interface MkLit extends TypeFn {
  readonly output: this["input"] extends readonly [
    unknown,
    infer Cs extends readonly unknown[],
    unknown,
  ]
    ? Lit<JoinSeconds<Cs>>
    : never;
}

/** `["[", [_, char][], "]"]` -> `CharIn<"chars">`. */
interface MkClass extends TypeFn {
  readonly output: this["input"] extends readonly [
    unknown,
    infer Cs extends readonly unknown[],
    unknown,
  ]
    ? CharIn<JoinSeconds<Cs>>
    : never;
}

/** Any `"."` token -> `AnyChar` (the matched character is discarded). */
interface MkAny extends TypeFn {
  readonly output: AnyChar;
}

/** Wrap a parser in its postfix repetition operator, if any. */
type Postfix<P, Op> = Op extends "*"
  ? Many<P>
  : Op extends "+"
    ? Many1<P>
    : Op extends "?"
      ? Opt<P>
      : P;

/** Wrap a parser in its prefix lookahead operator, if any. */
type Prefix<Op, P> = Op extends "!" ? Not<P> : Op extends "&" ? And<P> : P;

/** `[pre, primary, post]` -> the primary wrapped by its (optional) operators. */
interface MkUnary extends TypeFn {
  readonly output: this["input"] extends readonly [infer Pre, infer P, infer Post]
    ? Prefix<Pre, Postfix<P, Post>>
    : never;
}

/** A one-element sequence collapses to its element; otherwise wrap in `Seq`. */
interface MkSeq extends TypeFn {
  readonly output: this["input"] extends readonly [infer Only]
    ? Only
    : this["input"] extends infer Items extends readonly unknown[]
      ? Seq<Items>
      : never;
}

/** Collect the second element of every `["/", seq]` pair. */
type CollectSeconds<Pairs extends readonly unknown[]> = Pairs extends readonly [
  readonly [unknown, infer S],
  ...infer Rest extends readonly unknown[],
]
  ? [S, ...CollectSeconds<Rest>]
  : [];

/** No alternatives collapses to the head; otherwise wrap in `Or`. */
interface MkOr extends TypeFn {
  readonly output: this["input"] extends readonly [
    infer Head,
    infer Rest extends readonly unknown[],
  ]
    ? Rest extends readonly []
      ? Head
      : Or<[Head, ...CollectSeconds<Rest>]>
    : never;
}

/* --- the metagrammar (mutually recursive: Primary -> Group -> Expr) --- */

type PegLiteral = Map<Seq<[Tok<Lit<"'">>, Many<Seq<[Not<Lit<"'">>, AnyChar]>>, Lit<"'">]>, MkLit>;
type PegClass = Map<Seq<[Tok<Lit<"[">>, Many<Seq<[Not<Lit<"]">>, AnyChar]>>, Lit<"]">]>, MkClass>;
type PegDot = Map<Tok<Lit<".">>, MkAny>;
type PegGroup = Map<Seq<[Tok<Lit<"(">>, PegExpr, Tok<Lit<")">>]>, ParenInner>;
type PegPrimary = Or<[PegLiteral, PegClass, PegDot, PegGroup]>;
type PegUnary = Map<Seq<[Opt<Tok<CharIn<"!&">>>, PegPrimary, Opt<Tok<CharIn<"*+?">>>]>, MkUnary>;
type PegSeq = Map<Many1<PegUnary>, MkSeq>;
type PegExpr = Map<Seq<[PegSeq, Many<Seq<[Tok<Lit<"/">>, PegSeq]>>]>, MkOr>;

/** Whole source: one expression followed by optional trailing whitespace. */
type PegProgram = Map<Seq<[PegExpr, WS]>, First>;

/** Compile PEG expression text into a combinator tree (or a `Failure`). */
export type Peg<Src extends string> = Parse<PegProgram, Src>;

/** Compile `Src` into a parser and immediately run it over `Input`. */
export type ParsePeg<Src extends string, Input extends string> = Parse<Peg<Src>, Input>;

/* ============================================================================
 * Layer 6 — limits & developer experience
 *
 * `Parse` returns either an unwrapped success value or a `Failure`; these
 * helpers classify and render that result. On limits: every repetition/sequence
 * helper recurses in tail position and `Many` halts on a zero-width match, so
 * realistic inputs stay under TypeScript's instantiation ceiling.
 * ========================================================================== */

/** True when a `Parse` result landed on the `Failure` arm. */
export type IsFailure<R> = [R] extends [Failure] ? true : false;

/** True when a `Parse` result is a success value rather than a `Failure`. */
export type IsSuccess<R> = [R] extends [Failure] ? false : true;

type FormatPos<Pos> = Pos extends ""
  ? "end of input"
  : Pos extends string
    ? `"${Pos}"`
    : "unknown position";

/** Render a `Failure` as a readable message; pass a success value through unchanged. */
export type Explain<R> = [R] extends [Failure<infer Reason, infer Pos>]
  ? `parse error: ${Reason & string} (at ${FormatPos<Pos>})`
  : R;
