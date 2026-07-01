/**
 * Type-level SurrealQL (surql) return-type inference — slice 0 + 1.
 *
 * Same shape as src/select.ts (schema + query string -> result type at compile
 * time), scaled toward SurrealDB. This first slice covers a single
 * `SELECT <fields> FROM <table>` statement against a schema of tables and
 * typed fields:
 *
 *   const db = connect<Schema>();
 *   const [people] = await db.query("SELECT name, tags FROM person");
 *   //     ^? { name: string; tags: string[] }[]
 *
 * Standalone — shares nothing with the PEG engine (./index.ts) or the PostgREST
 * slice (./select.ts). The small Trim/split/error-brand utilities are
 * intentionally duplicated rather than shared: surql's field grammar (AS,
 * `->` graph arrows, VALUE) will diverge, and coupling this to ./select.ts to
 * save ~20 lines of type util would be the worse trade.
 * ponytail: extract a shared string module only if a third consumer appears.
 *
 * Deferred to later slices (each is a known extension point, noted inline):
 *   - AS aliasing, SELECT VALUE (scalar array)                  [slice 2]
 *   - record links via FETCH, `->edge->table` graph traversal   [slice 3-4]
 *   - multi-statement `a; b` -> result tuple                    [slice 5]
 *   - function returns, SCHEMALESS widening, parse errors        [slice 6]
 * Also not yet: case-insensitive keywords beyond all-upper / all-lower, and
 * clauses after FROM (WHERE/ORDER/LIMIT) — those are recognized and ignored,
 * which is already correct: they change the row count, not the row type.
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
export interface SurqlSchema {
  tables: Record<string, SurqlTable>;
}

/**
 * The stored value of an unfetched record link: the target record's id,
 * branded with its table so a later `FETCH` slice can swap it for the full row.
 */
export type RecordId<Table extends string> = string & { readonly __recordTable: Table };

/** A branded, readable failure type (same pattern as select.ts). */
export type SurqlError<Message extends string> = { readonly __surqlError: Message };

// ---- field-type -> TS type --------------------------------------------------

type Resolve<F> = F extends "string"
  ? string
  : F extends "number"
    ? number
    : F extends "bool"
      ? boolean
      : F extends "datetime" | "duration"
        ? string
        : F extends { link: infer L extends string }
          ? RecordId<L>
          : F extends { array: infer E }
            ? Resolve<E>[]
            : F extends { object: infer O }
              ? { [K in keyof O]: Resolve<O[K]> }
              : unknown;

// ---- tiny type utilities ----------------------------------------------------

type Prettify<T> = { [K in keyof T]: T[K] } & {};
type Trim<S extends string> = S extends ` ${infer R}`
  ? Trim<R>
  : S extends `${infer L} `
    ? Trim<L>
    : S;
type StripSemi<S extends string> = S extends `${infer B};` ? Trim<B> : S;
type FirstWord<S extends string> = S extends `${infer W} ${string}` ? W : S;

// ---- parser (slice 1): SELECT <fields> FROM <table> -------------------------

type SelectStmt = { fields: string; table: string };

type Located<F extends string, Rest extends string> = {
  fields: Trim<F>;
  // table is the first token after FROM; any trailing clause is ignored (it
  // affects row count, not row shape).
  table: Trim<FirstWord<Trim<Rest>>>;
};
type MatchSelect<Q extends string> = Q extends `SELECT ${infer F} FROM ${infer Rest}`
  ? Located<F, Rest>
  : Q extends `select ${infer F} from ${infer Rest}`
    ? Located<F, Rest>
    : SurqlError<"could not parse: expected 'SELECT <fields> FROM <table>'">;

type StarNode = { kind: "star" };
type ColNode<N extends string> = { kind: "col"; name: N };

type SplitComma<
  S extends string,
  Cur extends string = "",
  Acc extends readonly string[] = [],
> = S extends `${infer H}${infer R}`
  ? H extends ","
    ? SplitComma<R, "", readonly [...Acc, Cur]>
    : SplitComma<R, `${Cur}${H}`, Acc>
  : readonly [...Acc, Cur];

type ToNode<F extends string> = F extends "*" ? StarNode : ColNode<F>;
// Map over the tuple through a bare parameter so the mapped type stays
// homomorphic (a tuple in, a tuple out); inlining SplitComma<F> here would make
// `keyof` pick up array prototype members and yield a non-tuple.
type ToNodes<Fs extends readonly string[]> = {
  [I in keyof Fs]: ToNode<Trim<Fs[I] & string>>;
};
type ParseFields<F extends string> = ToNodes<SplitComma<F>>;

// ---- resolver: nodes + schema -> row type -----------------------------------

type TableFields<Schema extends SurqlSchema, T extends string> = T extends keyof Schema["tables"]
  ? Schema["tables"][T]["fields"]
  : Record<never, never>;

type ResolveRow<Schema extends SurqlSchema, T extends string> = {
  [K in keyof TableFields<Schema, T>]: Resolve<TableFields<Schema, T>[K]>;
};

type Contribution<Schema extends SurqlSchema, T extends string, Node> = Node extends StarNode
  ? ResolveRow<Schema, T>
  : Node extends { kind: "col"; name: infer N extends string }
    ? N extends keyof TableFields<Schema, T>
      ? { [K in N]: Resolve<TableFields<Schema, T>[N]> }
      : { [K in N]: SurqlError<`field '${N}' does not exist on '${T}'`> }
    : Record<never, never>;

type BuildRow<
  Schema extends SurqlSchema,
  T extends string,
  Nodes extends readonly unknown[],
> = Prettify<Intersect<Schema, T, Nodes>>;
type Intersect<
  Schema extends SurqlSchema,
  T extends string,
  Nodes extends readonly unknown[],
> = Nodes extends readonly [infer Head, ...infer Tail]
  ? Contribution<Schema, T, Head> & Intersect<Schema, T, Tail>
  : Record<never, never>;

/** Infer one statement's result: an array of rows, or a `SurqlError`. */
export type InferStatement<Schema extends SurqlSchema, Q extends string> =
  MatchSelect<Trim<StripSemi<Trim<Q>>>> extends infer P
    ? P extends SelectStmt
      ? P["table"] extends keyof Schema["tables"]
        ? BuildRow<Schema, P["table"], ParseFields<P["fields"]>>[]
        : SurqlError<`table '${P["table"]}' does not exist`>
      : P // the SurqlError from MatchSelect
    : never;

/**
 * The result of `query(q)`: a tuple with one entry per statement. Slice 1
 * handles a single statement; `;`-splitting into a longer tuple is slice 5.
 */
export type QueryResult<Schema extends SurqlSchema, Q extends string> = [InferStatement<Schema, Q>];

// ---- ergonomic client surface (type-only; nothing is emitted) ---------------

export interface Surreal<Schema extends SurqlSchema> {
  query<Q extends string>(surql: Q): Promise<QueryResult<Schema, Q>>;
}
export declare function connect<Schema extends SurqlSchema>(): Surreal<Schema>;
