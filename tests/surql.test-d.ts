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
import type { InferStatement, RecordId, SurqlError } from "../src/surql";

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
  };
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

describe("client — connect().query() end to end", () => {
  test("query resolves to a one-entry tuple of rows", () => {
    const db = connect<Schema>();
    const res = db.query("SELECT name, tags FROM person");
    expectTypeOf(res).resolves.toEqualTypeOf<[{ name: string; tags: string[] }[]]>();
  });
});
