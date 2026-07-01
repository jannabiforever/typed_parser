/**
 * PostgREST `select()` return-type inference (src/select.ts).
 *
 * Conventions asserted here:
 *   - `*` expands to the table's whole `Row`.
 *   - a comma list picks exactly those columns, in object form.
 *   - an embed `rel(sub)` resolves against the schema's `Relationships`:
 *     many-to-one (the FK is on the current table) yields an object,
 *     one-to-many (the FK is on the embedded table) yields an array.
 *   - `createClient<DB>().from(t).select(s)` threads all of the above into the
 *     awaited `.data` type.
 */

import { describe, expectTypeOf, test } from "vitest";

import { createClient } from "../src/select";
import type { GetResult, SelectQueryError } from "../src/select";

type DB = {
  public: {
    Tables: {
      users: {
        Row: { id: number; name: string; team_id: number };
        Relationships: [
          {
            foreignKeyName: "users_team_id_fkey";
            columns: ["team_id"];
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      teams: {
        Row: { id: number; name: string };
        Relationships: [];
      };
      // no relationship to users or teams — used for the error-path tests.
      logs: {
        Row: { id: number; message: string };
        Relationships: [];
      };
    };
  };
};

describe("GetResult — select string -> row type", () => {
  test("`*` is the whole row", () => {
    expectTypeOf<GetResult<DB, "users", "*">>().toEqualTypeOf<{
      id: number;
      name: string;
      team_id: number;
    }>();
  });

  test("a column list picks those columns", () => {
    expectTypeOf<GetResult<DB, "users", "id, name">>().toEqualTypeOf<{
      id: number;
      name: string;
    }>();
  });

  test("a many-to-one embed is an object", () => {
    expectTypeOf<GetResult<DB, "users", "id, teams(name)">>().toEqualTypeOf<{
      id: number;
      teams: { name: string };
    }>();
  });

  test("a one-to-many embed is an array", () => {
    expectTypeOf<GetResult<DB, "teams", "name, users(name)">>().toEqualTypeOf<{
      name: string;
      users: { name: string }[];
    }>();
  });
});

describe("GetResult — errors surface as a branded SelectQueryError", () => {
  test("an unknown column", () => {
    expectTypeOf<GetResult<DB, "users", "id, nope">>().toEqualTypeOf<{
      id: number;
      nope: SelectQueryError<"column 'nope' does not exist on 'users'">;
    }>();
  });

  test("embedding an unrelated table", () => {
    expectTypeOf<GetResult<DB, "users", "logs(message)">>().toEqualTypeOf<{
      logs: SelectQueryError<"no relationship found between 'users' and 'logs'">;
    }>();
  });

  test("embedding a table that does not exist", () => {
    expectTypeOf<GetResult<DB, "users", "ghosts(id)">>().toEqualTypeOf<{
      ghosts: SelectQueryError<"table 'ghosts' does not exist">;
    }>();
  });
});

describe("client — from().select() end to end", () => {
  test("awaited response carries the inferred rows", () => {
    const client = createClient<DB>();
    const res = client.from("users").select("id, name, teams(name)");
    expectTypeOf(res).resolves.toEqualTypeOf<{
      data: { id: number; name: string; teams: { name: string } }[] | null;
      error: unknown;
    }>();
  });
});
