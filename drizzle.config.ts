import { defineConfig } from "drizzle-kit";
import { getDatabaseConfig } from "./src/lib/env/database";

// PostgreSQL is the only supported application database.
const { url } = getDatabaseConfig();

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle/postgres",
  dialect: "postgresql",
  dbCredentials: { url },
});
