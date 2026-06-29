# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`typed_parser` is a parser generator that runs **entirely in the TypeScript type system**. There is no runtime: a parser _is_ a generic type, and "running" it means instantiating that type. `tsc` does the parsing while it type-checks. The deliverable is `.d.ts`-style type code, not executable code — a string literal type goes in, a fully-typed AST comes out at compile time.

```ts
type Result = Parse<Arithmetic, "1 + 2 * 3">;
//   ^? { op: "+"; left: 1; right: { op: "*"; left: 2; right: 3 } }
```

## Current state

The library is **implemented through layer 6, with the arithmetic validation target green** (see build order below). `src/index.ts` is a single type-only module:

- **Combinators are inert, tagged descriptions** (`interface Lit { _p: "Lit"; … }`, etc.), not logic. A central interpreter `Run<P, In>` dispatches on the `_p` tag against the remaining input and returns `Success<Value, Rest>` or `Failure<Reason, Pos>`. `Parse<Grammar, Input>` runs a grammar, requires the **whole** input to be consumed, and unwraps the value on success (otherwise returns the `Failure`).
- **`Map<P, F>`** rewrites a result through a higher-kinded type-level function: an interface that `extends TypeFn` and redefines `output` in terms of `this["input"]`, invoked via `Apply`.
- **Recursion** (`expr → term → factor → expr`) is plain recursive type aliases through the combinator interfaces; the `Rule<Def>` indirection is the named-rule mechanism. `Seq`/`Or`/`Many` and the fold helpers recurse in tail position, and `Many` halts on a zero-width match.
- **Layer 5** — `Peg<Src>` / `ParsePeg<Src, Input>`: a metaparser _written in the core combinators_ that compiles PEG **expression** text into a combinator tree. Char classes are explicit sets; named-rule references and `a-z` ranges are not done yet.
- **Layer 6** — `Explain<R>` renders a `Failure` as a readable string; `IsSuccess` / `IsFailure` classify a result.

The **test suite is green**: Vitest type tests (`*.test-d.ts`, `--typecheck` mode), 6 files / 54 assertions covering every layer. Each file's header comment documents the conventions it pins (e.g. `Opt` yields `null` when absent; `Parse` requires full consumption; a single PEG child is not wrapped). Run `pnpm test`.

Still open: the remaining layer-7 validation targets (a Supabase-style mini `SELECT`, a JSON subset) and a richer PEG surface (named-rule grammars, char ranges).

Stack: TypeScript (type-only library, nothing is emitted — `tsc` runs purely as the checker), ESLint 10 (flat config, type-aware via typescript-eslint), Prettier. Node ≥ 20.

## Commands

This repo uses **pnpm** (pinned via `packageManager` in `package.json`). Run after `pnpm install`:

| Command              | What it does                                                                                                                                                                                                                                               |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm run typecheck` | `tsc --noEmit` — the real "build". This is what proves the types work.                                                                                                                                                                                     |
| `pnpm test`          | `vitest run --typecheck` — runs the `*.test-d.ts` suite. "Tests" are **type-level assertions** (`expectTypeOf<Actual>().toEqualTypeOf<Expected>()`) that fail by producing a type error; there is no runtime to run. `pnpm run test:watch` for watch mode. |
| `pnpm run lint`      | ESLint over the repo. `pnpm run lint:fix` to autofix.                                                                                                                                                                                                      |
| `pnpm run format`    | Prettier write. `pnpm run format:check` to verify without writing.                                                                                                                                                                                         |
| `pnpm run check`     | `format:check` + `lint` + `typecheck` — run this before committing.                                                                                                                                                                                        |

To check one grammar/utility in isolation, add assertions to a `*.test-d.ts` file under `tests/` and run `pnpm test` (or `pnpm run test:watch` while iterating); `vitest --typecheck -t "<name>"` filters by test name. Wrap assertions in `describe`/`test` blocks and assert with `expectTypeOf<Actual>().toEqualTypeOf<Expected>()` — Vitest reports each as a named type test, and a mismatch surfaces as a `TypeCheckError` attributed to that line (no `noUnusedLocals` workaround needed). For failure cases, assert `expectTypeOf<IsErr<Parse<...>>>().toEqualTypeOf<true>()`; `IsErr` lives in `tests/harness.ts` (the public `IsFailure` / `IsSuccess` / `Explain` in `src/index.ts` are equivalent and exercised by `tests/dx.test-d.ts`). Config: `vitest.config.ts`.

## Navigating the code (codebase-memory MCP)

This repo is indexed into the `codebase-memory` knowledge graph. **Reach for the MCP first for structural questions, then fall back to Grep/Glob/Read.**

- **Project name** is the full path-derived slug, not `typed_parser`. In this worktree it is `Users-jungin-Documents-claude-worktree-typed_parser-romantic-lewin-4ddbda`; in the main checkout it differs. Don't hardcode it — resolve it once with `mcp__codebase-memory-mcp__list_projects` and pass that exact string as the `project` arg to every call.
- **Discovery protocol:**
  - `search_graph(query=..., name_pattern=..., label=...)` — find combinators/types/utilities by name or description. Use _instead of_ grep for definitions.
  - `get_code_snippet(qualified_name)` — read an exact symbol's source. Find the `qualified_name` via `search_graph` first.
  - `trace_path(function_name, mode=calls|data_flow)` — callers/callees and dependencies; impact analysis before a refactor.
  - `query_graph(cypher)` — multi-hop / aggregate queries when `search_graph` isn't enough.
  - `get_architecture(aspects=['all'])` — package/module map and detected clusters.
  - `search_code(pattern)` — graph-augmented grep (dedupes hits into containing symbols, ranks by importance) for text patterns.
  - Use plain Grep/Glob/Read for non-code files (config, README) and **always Read a file before editing it**.
- **Keep the index fresh.** After adding, moving, or renaming source files, re-run `mcp__codebase-memory-mcp__index_repository(repo_path=<worktree root>, mode='full')`, or scope impact with `detect_changes`.
- **Caveat for this project:** the graph models _runtime_ call/data-flow edges. The core of `typed_parser` is **type-level** — conditional types and generic instantiation are not "calls," so the graph will **not** trace how one type resolves into another. Use the MCP for what it's good at here: locating definitions, the file/module layout, and any runtime utilities or test harness. For the actual type-level logic, reading the `.ts` type definitions directly stays primary.

## Hard constraints (these shape every design decision)

The type system has no imperative tools, so the usual implementations don't translate. Internalize these before writing any combinator:

- **No loops → recursion.** Every repetition (`Many`, sequences) is recursive type instantiation.
- **No mutable state → type parameters.** Parser state (remaining input, accumulated result, position) is threaded through generic params, never mutated. This is also why backtracking is free: the input state is never destroyed, so `Or` just tries the next alternative.
- **No arithmetic → tuple length.** Counting (position, depth, repetition count) is done by building tuples and reading `["length"]`. There is no `+`.
- **Recursion-depth ceiling.** `tsc` aborts with _"type instantiation is excessively deep and possibly infinite"_ if recursion isn't bounded. **Write combinators tail-recursively from the start** — accumulate into a parameter and recurse in tail position rather than nesting. `Many` is the make-or-break case here; a naively-nested `Many` will blow the limit on realistic input.

## Core protocol

A parser is a type mapping a **state** to a **result**. Every combinator must speak this contract:

- **State** = remaining input + position.
- **Result** = a tagged union: `Success<Value, Rest>` or `Failure<Reason, Pos>`.

Combinators compose by passing the `Rest` of one success as the input state of the next. `Failure` short-circuits.

## Combinator layers

- **Primitives** match one literal/char: `Lit<S>`, `CharIn<S>`, `AnyChar`, `EOF`.
- **Composites** glue parsers: `Seq` (in order, accumulates a tuple), `Or` (PEG ordered choice — first success wins), `Many`/`Many1`, `Opt`, `Not`/`And` (negative/positive lookahead), `Map<P, F>` (rewrite a parse result into an AST node).
- **Named/recursive rules** let grammars reference each other (`expr → term → factor → expr`). This is **PEG**: left recursion is forbidden — encode it as repetition instead.

## Build order (strictly bottom-up)

Each layer depends on the one below; do not start a layer until the one beneath it is proven with type-level tests.

0. ✅ Type-level utilities — `Join`, `ToNum`, `StrEq`, plus the `TypeFn` / `Apply` HKT encoding (the no-arithmetic, no-loop workarounds).
1. ✅ Core types & protocol — `Success` / `Failure`. State is just the remaining string; `Failure.pos` carries it.
2. ✅ Primitive combinators — `Lit` `CharIn` `AnyChar` `EOF`.
3. ✅ Composite combinators — `Seq` `Or` `Many` `Many1` `Opt` `Not` `And` `Map`. `Many` is tail-recursive with a zero-width guard.
4. ✅ Recursive & named rules — recursive type aliases through the combinator interfaces + the `Rule` indirection.
5. ◐ String PEG surface — `Peg` / `ParsePeg` compile PEG **expression** text. _Done:_ literals, explicit char classes, `.`, sequence, `/`, `* + ?`, `! &`, groups. _Not done:_ named-rule grammars (`expr = term …`), `a-z` ranges.
6. ✅ Limits & DX — tail-recursive evaluation, `Explain` readable failures, `IsSuccess` / `IsFailure`, and the type-level unit tests.
7. ◐ Validation targets — ✅ arithmetic (precedence/associativity/parens). _Remaining:_ a Supabase-style mini `SELECT`, a JSON subset.

**MVP (layers 0→4 plus a working arithmetic parser) is complete**, as are layers 5–6. Next up is layer 7's remaining targets (`SELECT`, JSON) and/or extending the PEG surface to named-rule grammars.
