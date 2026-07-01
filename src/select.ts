/**
 * Type-level PostgREST `select()` return-type inference.
 *
 * A minimal, bespoke slice modeled on supabase-js's postgrest-js
 * (`select-query-parser` + `result`): a `select` string literal plus a
 * `Database` schema type resolve, at compile time, to the exact row type that
 * `client.from(t).select(s)` would return.
 *
 *   type R = GetResult<DB, "users", "id, name, teams(name)">
 *   //   ^? { id: number; name: string; teams: { name: string } }
 *
 * Standalone — shares nothing with the PEG engine in ./index.ts.
 *
 * Supported: `*`, comma-separated columns, and nested embeds `rel(sub)` with
 * array-vs-object decided from the schema's `Relationships`. Unknown columns,
 * unknown tables, and unrelated embeds resolve to a branded `SelectQueryError`.
 * ponytail: `public` schema only; no rename (`a:b`), cast (`::t`), embed hints
 * (`!inner`), spread (`...`) or aggregates yet — add each as its own ParseField
 * arm when a target needs it.
 */

// ---- schema shape (a subset of supabase's generated `Database`) -------------

export interface GenericRelationship {
  foreignKeyName: string;
  columns: readonly string[];
  referencedRelation: string;
  referencedColumns: readonly string[];
}
export interface GenericTable {
  Row: Record<string, unknown>;
  Relationships: readonly GenericRelationship[];
}
export interface GenericDatabase {
  public: { Tables: Record<string, GenericTable> };
}

type Tables<DB extends GenericDatabase> = DB["public"]["Tables"];
type RowOfTable<DB extends GenericDatabase, T extends string> = T extends keyof Tables<DB>
  ? Tables<DB>[T]["Row"]
  : Record<never, never>;
type RelsOfTable<DB extends GenericDatabase, T extends string> = T extends keyof Tables<DB>
  ? Tables<DB>[T]["Relationships"]
  : readonly [];

// ---- tiny type utilities ----------------------------------------------------

type Prettify<T> = { [K in keyof T]: T[K] } & {};
type Trim<S extends string> = S extends ` ${infer R}`
  ? Trim<R>
  : S extends `${infer L} `
    ? Trim<L>
    : S;

// ---- parser: select string -> node tuple -----------------------------------

export type ColNode<N extends string> = { kind: "col"; name: N };
export type StarNode = { kind: "star" };
export type EmbedNode<N extends string, C extends readonly unknown[]> = {
  kind: "embed";
  name: N;
  children: C;
};

/**
 * Split a select string on top-level commas, honoring parenthesis depth so an
 * embed's inner commas (`teams(id, name)`) stay with the embed. Depth is a
 * tuple whose length is the nesting level (no arithmetic in the type system).
 */
type SplitFields<
  S extends string,
  Depth extends readonly unknown[] = [],
  Cur extends string = "",
  Acc extends readonly string[] = [],
> = S extends `${infer H}${infer Rest}`
  ? H extends "("
    ? SplitFields<Rest, [...Depth, 0], `${Cur}(`, Acc>
    : H extends ")"
      ? Depth extends readonly [unknown, ...infer T]
        ? SplitFields<Rest, T, `${Cur})`, Acc>
        : SplitFields<Rest, [], `${Cur})`, Acc>
      : H extends ","
        ? Depth["length"] extends 0
          ? SplitFields<Rest, Depth, "", readonly [...Acc, Cur]>
          : SplitFields<Rest, Depth, `${Cur},`, Acc>
        : SplitFields<Rest, Depth, `${Cur}${H}`, Acc>
  : readonly [...Acc, Cur];

type ParseField<F extends string> = F extends "*"
  ? StarNode
  : F extends `${infer Name}(${infer Inner})`
    ? EmbedNode<Trim<Name>, ParseSelect<Inner>>
    : ColNode<F>;

export type ParseSelect<S extends string> = ParseFields<SplitFields<Trim<S>>>;
type ParseFields<F extends readonly string[]> = {
  [I in keyof F]: ParseField<Trim<F[I] & string>>;
};

// ---- resolver: nodes + schema -> row type -----------------------------------

/**
 * A distinct, readable failure type (mirrors postgrest-js's `SelectQueryError`).
 * It's branded so a mistake can't be mistaken for a legit string column value,
 * and the message shows on hover. Detect with `T extends SelectQueryError<any>`.
 */
export type SelectQueryError<Message extends string> = {
  readonly __selectQueryError: Message;
};

/** One node's contribution to the row: an object with the field(s) it adds. */
type Contribution<DB extends GenericDatabase, T extends string, Node> = Node extends StarNode
  ? RowOfTable<DB, T>
  : Node extends { kind: "col"; name: infer N extends string }
    ? N extends keyof RowOfTable<DB, T>
      ? { [K in N]: RowOfTable<DB, T>[N] }
      : { [K in N]: SelectQueryError<`column '${N}' does not exist on '${T}'`> }
    : Node extends {
          kind: "embed";
          name: infer N extends string;
          children: infer C extends readonly unknown[];
        }
      ? { [K in N]: EmbedValue<DB, T, N, C> }
      : Record<never, never>;

type EmbedValue<
  DB extends GenericDatabase,
  T extends string,
  E extends string,
  C extends readonly unknown[],
> = E extends keyof Tables<DB>
  ? RelKind<DB, T, E> extends "one"
    ? RowOf<DB, E, C>
    : RelKind<DB, T, E> extends "many"
      ? RowOf<DB, E, C>[]
      : SelectQueryError<`no relationship found between '${T}' and '${E}'`>
  : SelectQueryError<`table '${E}' does not exist`>;

/** Fold a node tuple into a single row object by intersecting contributions. */
type RowOf<
  DB extends GenericDatabase,
  T extends string,
  Nodes extends readonly unknown[],
> = Prettify<Intersect<DB, T, Nodes>>;
type Intersect<
  DB extends GenericDatabase,
  T extends string,
  Nodes extends readonly unknown[],
> = Nodes extends readonly [infer Head, ...infer Tail]
  ? Contribution<DB, T, Head> & Intersect<DB, T, Tail>
  : Record<never, never>;

type HasRelTo<Rels extends readonly GenericRelationship[], Ref extends string> =
  Extract<Rels[number], { referencedRelation: Ref }> extends never ? false : true;

/**
 * Direction of the embed `T -> E` from the schema's FKs. If T carries the FK
 * (a relationship whose `referencedRelation` is E) it's many-to-one, so the
 * embed is a single object (`"one"`); if E carries the FK back to T it's
 * one-to-many, so an array (`"many"`); if neither, there's no path (`"none"`)
 * and the resolver turns that into a `SelectQueryError`.
 */
type RelKind<DB extends GenericDatabase, T extends string, E extends string> =
  HasRelTo<RelsOfTable<DB, T>, E> extends true
    ? "one"
    : HasRelTo<RelsOfTable<DB, E>, T> extends true
      ? "many"
      : "none";

export type GetResult<
  DB extends GenericDatabase,
  T extends keyof Tables<DB> & string,
  S extends string,
> = RowOf<DB, T, ParseSelect<S>>;

// ---- ergonomic client surface (type-only; nothing is emitted) ---------------

export interface PostgrestResponse<Row> {
  data: Row[] | null;
  error: unknown;
}
export interface QueryBuilder<DB extends GenericDatabase, T extends string> {
  select<S extends string>(query: S): PromiseLike<PostgrestResponse<GetResult<DB, T, S>>>;
}
export interface Client<DB extends GenericDatabase> {
  from<T extends keyof Tables<DB> & string>(table: T): QueryBuilder<DB, T>;
}
export declare function createClient<DB extends GenericDatabase>(): Client<DB>;
