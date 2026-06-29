# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`typed_parser` is a parser generator that runs **entirely in the TypeScript type system**. There is no runtime: a parser _is_ a generic type, and "running" it means instantiating that type. `tsc` does the parsing while it type-checks. The deliverable is `.d.ts`-style type code, not executable code — a string literal type goes in, a fully-typed AST comes out at compile time.

```ts
type Result = Parse<Arithmetic, "1 + 2 * 3">;
//   ^? { op: "+"; left: 1; right: { op: "*"; left: 2; right: 3 } }
```

## Current state

Tooling is scaffolded (`package.json`, `tsconfig.json`, ESLint, Prettier). The public type surface is **stubbed but not implemented**: `src/index.ts` declares every combinator plus the `Parse` entry point, but their bodies resolve to `Unimplemented` (a unique-symbol placeholder). Real work starts at layer 0 (see build order below).

A type-level **test suite already exists** under `tests/`, derived from the README, and is **red on purpose** — it is the spec to implement against. `pnpm test` currently reports the unimplemented behavioural assertions as `TS2344` errors; the protocol-layer tests (`tests/protocol.test-d.ts`) already pass. Each combinator's expected result shape is documented in the header comment of its test file — those comments are the authoritative conventions (e.g. `Opt` yields `null` when absent; `Parse` requires the whole input to be consumed).

Stack: TypeScript (type-only library, nothing is emitted — `tsc` runs purely as the checker), ESLint 10 (flat config, type-aware via typescript-eslint), Prettier. Node ≥ 20.

## Commands

This repo uses **pnpm** (pinned via `packageManager` in `package.json`). Run after `pnpm install`:

| Command              | What it does                                                                                                                                                                                                                            |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm run typecheck` | `tsc --noEmit` — the real "build". This is what proves the types work.                                                                                                                                                                  |
| `pnpm test`          | Alias for `typecheck`. "Tests" are **type-level assertions** (e.g. `type _ = Expect<Equal<Parse<G, "...">, Expected>>`) that fail by producing a type error — there is no runtime test runner. A failing typecheck _is_ a failing test. |
| `pnpm run lint`      | ESLint over the repo. `pnpm run lint:fix` to autofix.                                                                                                                                                                                   |
| `pnpm run format`    | Prettier write. `pnpm run format:check` to verify without writing.                                                                                                                                                                      |
| `pnpm run check`     | `format:check` + `lint` + `typecheck` — run this before committing.                                                                                                                                                                     |

There is no single-test runner. To check one grammar/utility in isolation, add assertions to a `.ts` file under `tests/` and run `pnpm run typecheck` — `tsc` checks the whole project at once. Write each assertion as an **exported** alias — `export type _name = Expect<Equal<Actual, Expected>>` — because `noUnusedLocals` flags unused _non-exported_ aliases (so an unexported assertion errors even when it passes). A failing assertion surfaces as `TS2344` ("Type 'false' does not satisfy the constraint 'true'") on that line. The `Expect` / `Equal` / `IsErr` helpers live in `tests/harness.ts`.

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

0. Type-level utilities — string/char/tuple helpers, tuple-length counters (the no-arithmetic workaround). Everything rests on this.
1. Core types & protocol — `State` / `Success` / `Failure`.
2. Primitive combinators.
3. Composite combinators (`Many` is the critical, must-be-tail-recursive piece).
4. Recursive & named rules.
5. String PEG surface _(optional, much later)_ — a metaparser written in the core combinators that turns grammar text like `"expr = term ('+' term)*"` into a combinator tree. Sits on top of a stable core; does not replace it.
6. Limits & DX — depth management, surfacing `Failure` as readable messages, type-level unit tests.
7. Validation targets — arithmetic (precedence/associativity), a Supabase-style mini `SELECT`, a JSON subset.

**MVP = layers 0→4 plus a working arithmetic parser.** Prove the core that way before `SELECT` or the string PEG surface.
