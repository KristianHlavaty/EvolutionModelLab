import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import BetterSqlite3 from "better-sqlite3";
import {
  drizzle,
  type BetterSQLite3Database,
} from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import * as schema from "./schema.js";

export type AppDatabase = BetterSQLite3Database<typeof schema>;

export interface DatabaseHandle {
  db: AppDatabase;
  sqlite: BetterSqlite3.Database;
  close: () => void;
}

export function createDatabase(
  databasePath: string,
  migrationsFolder: string,
): DatabaseHandle {
  const resolvedDatabasePath = resolve(databasePath);
  mkdirSync(dirname(resolvedDatabasePath), { recursive: true });

  const sqlite = new BetterSqlite3(resolvedDatabasePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");

  const db = drizzle(sqlite, { schema });
  try {
    migrate(db, { migrationsFolder: resolve(migrationsFolder) });
  } catch (error) {
    sqlite.close();
    throw error;
  }

  return {
    db,
    sqlite,
    close: () => sqlite.close(),
  };
}

export * from "./schema.js";
