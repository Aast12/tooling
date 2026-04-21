import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export function createTestD1(): D1Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  const migrationPath = path.resolve("migrations/0001_init.sql");
  db.exec(fs.readFileSync(migrationPath, "utf8"));

  const d1 = {
    prepare(sql: string) {
      let boundParams: unknown[] = [];
      const stmt = {
        bind(...params: unknown[]) {
          boundParams = params;
          return stmt;
        },
        async first() {
          const row = db.prepare(sql).get(...boundParams);
          return row ?? null;
        },
        async all() {
          const rows = db.prepare(sql).all(...boundParams);
          return {
            results: rows,
            success: true,
            meta: {} as D1Meta,
          };
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
          };
        },
      };
      return stmt;
    },
    async batch(statements: Array<{ run: () => Promise<unknown> }>) {
      const results: unknown[] = [];
      for (const s of statements) results.push(await s.run());
      return results;
    },
    async exec(sql: string) {
      db.exec(sql);
      return { count: 0, duration: 0 };
    },
  };

  return d1 as unknown as D1Database;
}

type D1Meta = {
  changes?: number;
  last_row_id?: number;
  duration?: number;
  size_after?: number;
  rows_read?: number;
  rows_written?: number;
};
