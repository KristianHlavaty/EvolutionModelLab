import { resolve } from "node:path";

import { createDatabase } from "./index.js";

const repositoryRoot = resolve(import.meta.dirname, "..", "..", "..");
const databasePath = resolve(
  repositoryRoot,
  process.env.DATABASE_PATH ?? "data/evolution-model-lab.db",
);
const migrationsFolder = resolve(
  repositoryRoot,
  "packages",
  "database",
  "drizzle",
);
const handle = createDatabase(databasePath, migrationsFolder);
handle.close();
console.log(`Database migrated: ${databasePath}`);
