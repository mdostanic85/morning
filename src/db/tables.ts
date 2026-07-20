// PostgreSQL is the only supported application database; re-export the
// Postgres schema directly.
export * from "./schema";

export type AppSchema = typeof import("./schema");
