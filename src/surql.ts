/**
 * Type-level SurrealQL (surql) return-type inference — slices 0–4.
 *
 * Same shape as src/select.ts (schema + query string -> result type at compile
 * time), aimed at SurrealDB:
 *
 *   const db = connect<Schema>();
 *   const [people] = await db.query(
 *     "SELECT name, ->wrote->article.title AS titles FROM person"
 *   );
 *   //     ^? { name: string; titles: string[] }[]
 *
 * Covered:
 *   - slice 0: schema model (tables -> fields -> FieldType; edges with in/out).
 *   - slice 1: `SELECT <fields> FROM <table>` -> Row[]; `*`; field lists.
 *   - slice 2 (partial): `AS` aliasing (`name AS n`, and on graph paths).
 *   - slice 3: record links resolve to `RecordId<T>`, or the full target row
 *     when named in a `FETCH` clause.
 *   - slice 4: one-hop graph traversal `->edge->target[.field]` -> array
 *     (fanout), array-of-target or array-of-projected-field, with `AS`.
 *   - slice 5: multi-statement `a; b` -> a positional result tuple.
 *
 * Standalone — shares nothing with the PEG engine (./index.ts) or the PostgREST
 * slice (./select.ts). The small Trim/split/error-brand utilities are
 * intentionally duplicated rather than shared.
 * ponytail: extract a shared string module only if a third consumer appears.
 *
 * Deferred (each a known extension point):
 *   - `SELECT VALUE` scalar arrays, function returns, SCHEMALESS widening  [6]
 *   - nested FETCH paths (`FETCH a.b`), multi-hop / `<-` / `<->` graph
 *   - mixed-case keywords (only all-upper / all-lower today)
 *   - a `;` inside a string or object literal (naive statement split)
 */

// ---- schema model (slice 0) -------------------------------------------------

export type ScalarType = "string" | "number" | "bool" | "datetime" | "duration";

/** A field's declared type, mirroring `DEFINE FIELD ... TYPE ...`. */
export type FieldType =
  | ScalarType
  | { link: string } // record<other_table>
  | { array: FieldType }
  | { object: Record<string, FieldType> };

export interface SurqlTable {
  fields: Record<string, FieldType>;
}
/** A graph edge (`RELATE`): a table with `in`/`out` record links. */
export interface SurqlEdge {
  in: string;
  out: string;
}
export interface SurqlSchema {
  tables: Record<string, SurqlTable>;
  edges?: Record<string, SurqlEdge>;
}

/**
 * The stored value of an unfetched record link: the target record's id, branded
 * with its table so `FETCH` (below) can swap it for the full row.
 */
export type RecordId<Table extends string> = string & { readonly __recordTable: Table };

/** A branded, readable failure type (same pattern as select.ts). */
export type SurqlError<Message extends string> = { readonly __surqlError: Message };

// ---- field-type -> TS type --------------------------------------------------

type Scalar<F> = F extends "string"
  ? string
  : F extends "number"
    ? number
    : F extends "bool"
      ? boolean
      : F extends "datetime" | "duration"
        ? string
        : unknown;

/** Resolve a field type; `Fetched` says whether this field was FETCH'd. */
type ResolveField<Schema extends SurqlSchema, F, Fetched extends boolean> = F extends {
  link: infer L extends string;
}
  ? Fetched extends true
    ? FetchedRow<Schema, L>
    : RecordId<L>
  : F extends { array: infer E }
    ? ResolveField<Schema, E, Fetched>[]
    : F extends { object: infer O }
      ? { [K in keyof O]: ResolveField<Schema, O[K], false> }
      : Scalar<F>;

/** A fetched link expands to the target row, whose own links stay ids. */
type FetchedRow<Schema extends SurqlSchema, T extends string> = Prettify<
  ResolveRow<Schema, T, never>
>;

type TableFields<Schema extends SurqlSchema, T extends string> = T extends keyof Schema["tables"]
  ? Schema["tables"][T]["fields"]
  : Record<never, never>;

/** Every field of T, each resolved; a field named in `Fetched` is expanded. */
type ResolveRow<Schema extends SurqlSchema, T extends string, Fetched extends string> = {
  [K in keyof TableFields<Schema, T>]: ResolveField<
    Schema,
    TableFields<Schema, T>[K],
    K extends Fetched ? true : false
  >;
};

// ---- tiny type utilities ----------------------------------------------------

type Prettify<T> = { [K in keyof T]: T[K] } & {};
type Trim<S extends string> = S extends ` ${infer R}`
  ? Trim<R>
  : S extends `${infer L} `
    ? Trim<L>
    : S;
type StripSemi<S extends string> = S extends `${infer B};` ? Trim<B> : S;
type FirstWord<S extends string> = S extends `${infer W} ${string}` ? W : S;
type SplitNames<S extends string> = S extends `${infer H},${infer R}`
  ? Trim<H> | SplitNames<R>
  : Trim<S>;

// ---- parser -----------------------------------------------------------------

type StarNode = { kind: "star" };
type ColNode<N extends string> = { kind: "col"; name: N };
// A graph path `->edge->target`, with `proj` the `.field` projection ("" = none).
type GraphNode<E extends string, T extends string, P extends string> = {
  kind: "graph";
  edge: E;
  target: T;
  proj: P;
};
type AliasNode<A extends string, X> = { kind: "alias"; name: A; expr: X };

type SplitComma<
  S extends string,
  Cur extends string = "",
  Acc extends readonly string[] = [],
> = S extends `${infer H}${infer R}`
  ? H extends ","
    ? SplitComma<R, "", readonly [...Acc, Cur]>
    : SplitComma<R, `${Cur}${H}`, Acc>
  : readonly [...Acc, Cur];

type ParseGraph<Rest extends string> = Rest extends `${infer Edge}->${infer After}`
  ? After extends `${infer Target}.${infer Proj}`
    ? GraphNode<Trim<Edge>, Trim<Target>, Trim<Proj>>
    : GraphNode<Trim<Edge>, Trim<After>, "">
  : SurqlError<`could not parse graph path '->${Rest}'`>;

type ParseExpr<E extends string> = E extends "*"
  ? StarNode
  : E extends `->${infer Rest}`
    ? ParseGraph<Rest>
    : ColNode<E>;

type ParseField<F extends string> = F extends `${infer E} AS ${infer A}`
  ? AliasNode<Trim<A>, ParseExpr<Trim<E>>>
  : F extends `${infer E} as ${infer A}`
    ? AliasNode<Trim<A>, ParseExpr<Trim<E>>>
    : ParseExpr<F>;

// Map through a bare parameter to keep the mapping homomorphic (tuple -> tuple).
type ToNodes<Fs extends readonly string[]> = {
  [I in keyof Fs]: ParseField<Trim<Fs[I] & string>>;
};
type ParseFields<F extends string> = ToNodes<SplitComma<F>>;

// Statement head: fields before FROM, the table (first token after FROM), and
// the FETCH list (a union of field names, or never).
type FetchOf<Rest extends string> = Rest extends `${string} FETCH ${infer L}`
  ? SplitNames<L>
  : Rest extends `${string} fetch ${infer L}`
    ? SplitNames<L>
    : never;
type Located<F extends string, Rest extends string> = {
  fields: Trim<F>;
  table: Trim<FirstWord<Trim<Rest>>>;
  fetched: FetchOf<Trim<Rest>>;
};
type SelectStmt = { fields: string; table: string; fetched: string };
type MatchSelect<Q extends string> = Q extends `SELECT ${infer F} FROM ${infer Rest}`
  ? Located<F, Rest>
  : Q extends `select ${infer F} from ${infer Rest}`
    ? Located<F, Rest>
    : SurqlError<"could not parse: expected 'SELECT <fields> FROM <table>'">;

// ---- resolver: nodes + schema -> row type -----------------------------------

type EdgesOf<Schema extends SurqlSchema> = Schema extends {
  edges: infer E extends Record<string, SurqlEdge>;
}
  ? E
  : Record<never, never>;

type GraphKey<E extends string, T extends string, P extends string> = P extends ""
  ? `->${E}->${T}`
  : `->${E}->${T}.${P}`;

/** The value produced by traversing `Src ->Edge-> Target[.Proj]`. */
type GraphValue<
  Schema extends SurqlSchema,
  Src extends string,
  Edge extends string,
  Target extends string,
  Proj extends string,
> = Edge extends keyof EdgesOf<Schema>
  ? EdgesOf<Schema>[Edge] extends { in: infer In extends string; out: infer Out extends string }
    ? Src extends In
      ? Out extends Target
        ? Proj extends ""
          ? Prettify<ResolveRow<Schema, Target, never>>[] // whole target rows (fanout)
          : Proj extends keyof TableFields<Schema, Target>
            ? ResolveField<Schema, TableFields<Schema, Target>[Proj], false>[]
            : SurqlError<`field '${Proj}' does not exist on '${Target}'`>
        : SurqlError<`edge '${Edge}' does not point to '${Target}'`>
      : SurqlError<`edge '${Edge}' does not start from '${Src}'`>
    : SurqlError<`edge '${Edge}' is malformed`>
  : SurqlError<`edge '${Edge}' does not exist`>;

/** Resolve a single select expression (the thing an `AS` alias renames). */
type ExprValue<
  Schema extends SurqlSchema,
  T extends string,
  Expr,
  Fetched extends string,
> = Expr extends StarNode
  ? Prettify<ResolveRow<Schema, T, Fetched>>
  : Expr extends { kind: "col"; name: infer N extends string }
    ? N extends keyof TableFields<Schema, T>
      ? ResolveField<Schema, TableFields<Schema, T>[N], N extends Fetched ? true : false>
      : SurqlError<`field '${N}' does not exist on '${T}'`>
    : Expr extends {
          kind: "graph";
          edge: infer E extends string;
          target: infer Tgt extends string;
          proj: infer P extends string;
        }
      ? GraphValue<Schema, T, E, Tgt, P>
      : Expr extends SurqlError<infer M>
        ? SurqlError<M>
        : SurqlError<"unsupported select expression">;

/** One node's contribution to the row object. */
type Contribution<
  Schema extends SurqlSchema,
  T extends string,
  Node,
  Fetched extends string,
> = Node extends StarNode
  ? ResolveRow<Schema, T, Fetched>
  : Node extends { kind: "col"; name: infer N extends string }
    ? N extends keyof TableFields<Schema, T>
      ? {
          [K in N]: ResolveField<
            Schema,
            TableFields<Schema, T>[N],
            N extends Fetched ? true : false
          >;
        }
      : { [K in N]: SurqlError<`field '${N}' does not exist on '${T}'`> }
    : Node extends { kind: "alias"; name: infer A extends string; expr: infer X }
      ? { [K in A]: ExprValue<Schema, T, X, Fetched> }
      : Node extends {
            kind: "graph";
            edge: infer E extends string;
            target: infer Tgt extends string;
            proj: infer P extends string;
          }
        ? { [K in GraphKey<E, Tgt, P>]: GraphValue<Schema, T, E, Tgt, P> }
        : Node extends SurqlError<infer M>
          ? { [K in "__parseError"]: SurqlError<M> }
          : Record<never, never>;

type BuildRow<
  Schema extends SurqlSchema,
  T extends string,
  Nodes extends readonly unknown[],
  Fetched extends string,
> = Prettify<Intersect<Schema, T, Nodes, Fetched>>;
type Intersect<
  Schema extends SurqlSchema,
  T extends string,
  Nodes extends readonly unknown[],
  Fetched extends string,
> = Nodes extends readonly [infer Head, ...infer Tail]
  ? Contribution<Schema, T, Head, Fetched> & Intersect<Schema, T, Tail, Fetched>
  : Record<never, never>;

/** Infer one statement's result: an array of rows, or a `SurqlError`. */
export type InferStatement<Schema extends SurqlSchema, Q extends string> =
  MatchSelect<Trim<StripSemi<Trim<Q>>>> extends infer P
    ? P extends SelectStmt
      ? P["table"] extends keyof Schema["tables"]
        ? BuildRow<Schema, P["table"], ParseFields<P["fields"]>, P["fetched"]>[]
        : SurqlError<`table '${P["table"]}' does not exist`>
      : P // the SurqlError from MatchSelect
    : never;

// Split a query into its `;`-separated statements, dropping empties (so a
// trailing `;` adds nothing). ponytail: a naive top-level split — a `;` inside
// a string or object literal is not yet respected.
type PushNonEmpty<Acc extends readonly string[], S extends string> =
  Trim<S> extends "" ? Acc : readonly [...Acc, Trim<S>];
type SplitStatements<
  S extends string,
  Cur extends string = "",
  Acc extends readonly string[] = [],
> = S extends `${infer H}${infer R}`
  ? H extends ";"
    ? SplitStatements<R, "", PushNonEmpty<Acc, Cur>>
    : SplitStatements<R, `${Cur}${H}`, Acc>
  : PushNonEmpty<Acc, Cur>;

// Map through a bare parameter so the tuple shape is preserved; `-readonly`
// drops the modifier that the split accumulator carries, so callers get a
// plain mutable result tuple.
type InferStatements<Schema extends SurqlSchema, Stmts extends readonly string[]> = {
  -readonly [I in keyof Stmts]: InferStatement<Schema, Stmts[I] & string>;
};

/**
 * The result of `query(q)`: a tuple with one entry per statement, so
 * `const [a, b] = await db.query("…; …")` is typed positionally.
 */
export type QueryResult<Schema extends SurqlSchema, Q extends string> = InferStatements<
  Schema,
  SplitStatements<Trim<Q>>
>;

// ---- ergonomic client surface (type-only; nothing is emitted) ---------------

export interface Surreal<Schema extends SurqlSchema> {
  query<Q extends string>(surql: Q): Promise<QueryResult<Schema, Q>>;
}
export declare function connect<Schema extends SurqlSchema>(): Surreal<Schema>;
