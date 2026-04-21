import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export function createTestD1(): D1Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  const migrationPath = path.resolve("migrations/0001_init.sql");
  db.exec(fs.readFileSync(migrationPath, "utf8"));

  const d1: Partial<D1Database> = {
    prepare(sql: string): D1PreparedStatement {
      let boundParams: unknown[] = [];
      const stmt: Partial<D1PreparedStatement> = {
        bind(...params: unknown[]) {
          boundParams = params;
          return stmt as D1PreparedStatement;
        },
        async first<T>() {
          const row = db.prepare(sql).get(...boundParams) as T | undefined;
          return (row ?? null) as T | null;
        },
        async all<T>() {
          const rows = db.prepare(sql).all(...boundParams) as T[];
          return {
            results: rows,
            success: true,
            meta: {} as D1Meta,
          } as D1Result<T>;
        },
        async run() {
          const info = db.prepare(sql).run(...boundParams);
          return {
            success: true,
            results: [],
            meta: {
              changes: info.changes,
              last_row_id: Number(info.lastInsertRowid),
              duration: 0,
              size_after: 0,
              rows_read: 0,
              rows_written: info.changes,
            },
          } as unknown as D1Result;
        },
      };
      return stmt as D1PreparedStatement;
    },
    async batch<T = unknown>(statements: D1PreparedStatement[]) {
      const results: D1Result<T>[] = [];
      for (const s of statements) results.push((await (s as { run: () => Promise<D1Result<T>> }).run()));
      return results;
    },
    async exec(sql: string) {
      db.exec(sql);
      return { count: 0, duration: 0 } as D1ExecResult;
    },
  };

  return d1 as D1Database;
}

type D1Meta = {
  changes?: number;
  last_row_id?: number;
  duration?: number;
  size_after?: number;
  rows_read?: number;
  rows_written?: number;
};
