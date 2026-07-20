import "server-only";

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

// Runtime may be SQLite or PostgreSQL; schema shapes are aligned for query compatibility.
export { db as rawDb } from "./connection";
import { db as connectionDb } from "./connection";

export const db = connectionDb as PostgresJsDatabase<typeof schema>;
