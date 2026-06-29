# typed_parser

> A parser generator that runs entirely in the TypeScript type system.

Define a grammar with combinators, point it at a string _literal type_, and get back a fully-typed AST -- at compile time, with zero runtime code.

```ts
type Result = Parse<Arithmetic, "1 + 2 * 3">;
//   ^? { op: "+"; left: 1; right: { op: "*"; left: 2; right: 3 } }
```

The grammar above is itself just types. `tsc` does the parsing while it checks your code; nothing ships to the bundle.

## Why

The usual parser generator (yacc, ANTLR, peg.js) takes a grammar and emits _source code_ you run at runtime. `typed_parser` emits nothing -- the parser **is** a generic type, and "running" it means instantiating that type. The payoff is the same one Supabase gets: a string literal in your source can drive the static return type of a function, so the editor knows the shape of a query's result before you ever run it.

This is a different toolbox from a runtime parser:

- No loops -- every repetition is recursion.
- No mutable state -- parser state (remaining input, accumulated result, position) is carried in type parameters.
- No arithmetic -- counting (position, depth, repetitions) is done with tuple length.
- A hard recursion-depth ceiling -- `tsc` bails with _"type instantiation is excessively deep"_ if you aren't careful.

These constraints shape the entire design. The combinators are written tail-recursively from the start so they survive realistic inputs without blowing the depth limit.

## How it works

A parser is a type that maps a **state** to a **result**:

- State: the remaining input plus a position.
- Result: a tagged union -- `Success<Value, Rest>` or `Failure<Reason, Pos>`.

Primitive combinators match a single literal or character. Composite combinators glue parsers together: `Seq` runs them in order and accumulates a tuple, `Or` is PEG-style ordered choice (first success wins; backtracking is free because the input state is never mutated), `Many` repeats. `Map` rewrites a parse result into an AST node. Named rules let grammars reference each other recursively (`expr` -> `term` -> `factor` -> `expr`).

You assemble a grammar by hand from these combinators today. A human-readable string PEG syntax (`"expr = term ('+' term)*"`) is planned as an optional surface layer -- but that requires parsing the grammar string itself at the type level, so it sits on top of a stable core rather than replacing it.

## Combinators

| Combinator                      | Meaning                                    |
| ------------------------------- | ------------------------------------------ |
| `Lit<S>`                        | match an exact string                      |
| `CharIn<S>` / `AnyChar` / `EOF` | character-level primitives                 |
| `Seq<[P1, P2, ...]>`            | sequence; accumulates results into a tuple |
| `Or<[P1, P2, ...]>`             | ordered choice (first match wins)          |
| `Many<P>` / `Many1<P>`          | zero-or-more / one-or-more                 |
| `Opt<P>`                        | optional                                   |
| `Not<P>` / `And<P>`             | negative / positive lookahead              |
| `Map<P, F>`                     | transform a parse result into an AST node  |

## Status

Early / experimental. The roadmap is built strictly bottom-up -- each layer depends on the one below it:

0. **Type-level utilities** -- string/char/tuple helpers, tuple-length counters (the numeric workaround). The foundation; everything else collapses without it.
1. **Core types & protocol** -- the `State` / `Success` / `Failure` contract every combinator shares.
2. **Primitive combinators** -- `Lit`, `CharIn`, `AnyChar`, `EOF`.
3. **Composite combinators** -- `Seq`, `Or`, `Many`, `Opt`, `Not`, `Map`. The engine's heart; `Many` is the make-or-break piece and must be tail-recursive.
4. **Recursive & named rules** -- mutual recursion, left-recursion policy (PEG forbids it).
5. **String PEG surface** _(optional)_ -- a metaparser, written in the core combinators, that turns grammar text into a combinator tree. Bootstrap; comes much later.
6. **Limits & DX** -- depth management, surfacing `Failure` as readable messages, type-level unit tests.
7. **Validation targets** -- arithmetic expressions (precedence, associativity), a Supabase-style mini `SELECT`, a JSON subset.

The MVP is **0 -> 4 plus a working arithmetic parser**. Once the core is proven that way, `SELECT` follows, and the string PEG surface is layered on last.

## Caveats

This is a type-system stress test as much as a library. Expect to think about recursion depth, to debug with type-level assertions rather than a debugger, and to keep inputs modest -- type-level parsing trades runtime cost for compile-time cost, and `tsc` will let you know when you've asked for too much.

## License

MIT
