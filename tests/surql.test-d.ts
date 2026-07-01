/**
 * SurrealQL `SELECT ... FROM ...` return-type inference (src/surql.ts), slice 0+1.
 *
 * Conventions asserted here:
 *   - `*` resolves every field of the table via its declared `FieldType`
 *     (scalars -> primitives, `{ link }` -> `RecordId`, `{ array }` -> `T[]`).
 *   - a field list picks those fields; a statement's result is an array of rows.
 *   - keywords work all-upper or all-lower; a clause after FROM (WHERE/...) is
 *     ignored, since it changes the row count and not the row type.
 *   - unknown fields/tables resolve to a branded `SurqlError`.
 *   - `connect<Schema>().query(q)` returns a one-entry tuple: `[Row[]]`.
 */

import { describe, expectTypeOf, test } from "vitest";

import { connect } from "../src/surql";
import type { InferStatement, QueryResult, RecordId, SurqlError } from "../src/surql";

type Schema = {
  tables: {
    person: {
      fields: {
        name: "string";
        age: "number";
        active: "bool";
        best_friend: { link: "person" };
        tags: { array: "string" };
      };
    };
    article: {
      fields: { title: "string" };
    };
    tag: {
      fields: { label: "string" };
    };
  };
  edges: {
    wrote: { in: "person"; out: "article" };
    tagged: { in: "article"; out: "tag" };
  };
};

// person with its own links unfetched — the shape a fetched `person` expands to.
type PersonRow = {
  name: string;
  age: number;
  active: boolean;
  best_friend: RecordId<"person">;
  tags: string[];
};

describe("InferStatement — SELECT ... FROM ...", () => {
  test("`*` resolves every field of the table", () => {
    expectTypeOf<InferStatement<Schema, "SELECT * FROM person">>().toEqualTypeOf<
      {
        name: string;
        age: number;
        active: boolean;
        best_friend: RecordId<"person">;
        tags: string[];
      }[]
    >();
  });

  test("a field list picks those fields", () => {
    expectTypeOf<InferStatement<Schema, "SELECT name, age FROM person">>().toEqualTypeOf<
      { name: string; age: number }[]
    >();
  });

  test("keywords may be lower case", () => {
    expectTypeOf<InferStatement<Schema, "select title from article">>().toEqualTypeOf<
      { title: string }[]
    >();
  });

  test("a clause after FROM is ignored (it doesn't change the row type)", () => {
    expectTypeOf<
      InferStatement<Schema, "SELECT title FROM article WHERE title = 'x'">
    >().toEqualTypeOf<{ title: string }[]>();
  });
});

describe("InferStatement — errors surface as a branded SurqlError", () => {
  test("an unknown field", () => {
    expectTypeOf<InferStatement<Schema, "SELECT name, nope FROM person">>().toEqualTypeOf<
      { name: string; nope: SurqlError<"field 'nope' does not exist on 'person'"> }[]
    >();
  });

  test("an unknown table", () => {
    expectTypeOf<InferStatement<Schema, "SELECT * FROM ghost">>().toEqualTypeOf<
      SurqlError<"table 'ghost' does not exist">
    >();
  });
});

describe("InferStatement — record links and FETCH (slice 3)", () => {
  test("an unfetched link is a RecordId", () => {
    expectTypeOf<InferStatement<Schema, "SELECT best_friend FROM person">>().toEqualTypeOf<
      { best_friend: RecordId<"person"> }[]
    >();
  });

  test("FETCH expands a link to the full target row", () => {
    expectTypeOf<
      InferStatement<Schema, "SELECT best_friend FROM person FETCH best_friend">
    >().toEqualTypeOf<{ best_friend: PersonRow }[]>();
  });
});

describe("InferStatement — AS aliasing and graph traversal (slice 2/4)", () => {
  test("AS renames a column", () => {
    expectTypeOf<InferStatement<Schema, "SELECT name AS n FROM person">>().toEqualTypeOf<
      { n: string }[]
    >();
  });

  test("a graph path with .field projection fans out to an array", () => {
    expectTypeOf<
      InferStatement<Schema, "SELECT name, ->wrote->article.title AS titles FROM person">
    >().toEqualTypeOf<{ name: string; titles: string[] }[]>();
  });

  test("a graph path without projection yields the target rows", () => {
    expectTypeOf<
      InferStatement<Schema, "SELECT ->wrote->article AS arts FROM person">
    >().toEqualTypeOf<{ arts: { title: string }[] }[]>();
  });

  test("a graph path to the wrong target is a SurqlError", () => {
    expectTypeOf<InferStatement<Schema, "SELECT ->wrote->person AS x FROM person">>().toEqualTypeOf<
      { x: SurqlError<"edge 'wrote' does not point to 'person'"> }[]
    >();
  });
});

describe("InferStatement — multi-hop and reverse graph traversal (slice 4+)", () => {
  test("a multi-hop path chains edges and projects the last node", () => {
    expectTypeOf<
      InferStatement<Schema, "SELECT ->wrote->article->tagged->tag.label AS labels FROM person">
    >().toEqualTypeOf<{ labels: string[] }[]>();
  });

  test("a multi-hop path without projection yields the last node's rows", () => {
    expectTypeOf<
      InferStatement<Schema, "SELECT ->wrote->article->tagged->tag AS tags FROM person">
    >().toEqualTypeOf<{ tags: { label: string }[] }[]>();
  });

  test("a reverse path `<-` walks incoming edges", () => {
    expectTypeOf<
      InferStatement<Schema, "SELECT <-wrote<-person.name AS authors FROM article">
    >().toEqualTypeOf<{ authors: string[] }[]>();
  });

  test("a reverse path with the wrong source is a SurqlError", () => {
    expectTypeOf<InferStatement<Schema, "SELECT <-tagged<-person AS x FROM tag">>().toEqualTypeOf<
      { x: SurqlError<"edge 'tagged' does not come from 'person'"> }[]
    >();
  });
});

describe("QueryResult — multiple statements form a tuple (slice 5)", () => {
  test("each statement becomes a positional tuple entry", () => {
    expectTypeOf<
      QueryResult<Schema, "SELECT name FROM person; SELECT title FROM article">
    >().toEqualTypeOf<[{ name: string }[], { title: string }[]]>();
  });

  test("a trailing semicolon does not add an entry", () => {
    expectTypeOf<QueryResult<Schema, "SELECT name FROM person;">>().toEqualTypeOf<
      [{ name: string }[]]
    >();
  });
});

describe("client — connect().query() end to end", () => {
  test("query resolves to a one-entry tuple of rows", () => {
    const db = connect<Schema>();
    const res = db.query("SELECT name, tags FROM person");
    expectTypeOf(res).resolves.toEqualTypeOf<[{ name: string; tags: string[] }[]]>();
  });

  test("multiple statements resolve positionally", () => {
    const db = connect<Schema>();
    const res = db.query("SELECT name FROM person; SELECT title FROM article");
    expectTypeOf(res).resolves.toEqualTypeOf<[{ name: string }[], { title: string }[]]>();
  });
});
