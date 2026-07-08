import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import * as schema from "./schema";

const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "morning.db");

declare global {
  var __sqlite: Database.Database | undefined;
}

// Reuse the connection across hot reloads in dev.
const sqlite = globalThis.__sqlite ?? new Database(dbPath);
if (process.env.NODE_ENV !== "production") {
  globalThis.__sqlite = sqlite;
}

sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
