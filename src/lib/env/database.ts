import type postgres from "postgres";
import { z } from "zod";

export type AppEnvironment = "development" | "production" | "test";

/** PostgreSQL is the only supported application database. */
export type DatabaseDialect = "postgres";

const databaseConfigSchema = z.object({
  url: z.string().min(1),
  dialect: z.literal("postgres"),
  environment: z.enum(["development", "production", "test"]),
});

export type DatabaseConfig = z.infer<typeof databaseConfigSchema>;

let cachedConfig: DatabaseConfig | undefined;

export function getAppEnvironment(): AppEnvironment {
  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv === "test") return "test";
  if (nodeEnv === "production") return "production";
  return "development";
}

/** Hosted Vercel deploy (production or preview), not `vercel dev`. */
export function isHostedVercelDeploy(): boolean {
  return (
    process.env.VERCEL === "1" &&
    process.env.VERCEL_ENV !== undefined &&
    process.env.VERCEL_ENV !== "development"
  );
}

function isLocalPostgresHost(host: string): boolean {
  const normalized = host.toLowerCase();
  if (normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1") {
    return true;
  }
  return /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(normalized);
}

function assertPostgresUrlAllowedForDeploy(url: string): void {
  if (!isHostedVercelDeploy()) return;

  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection string on Vercel.");
  }

  if (isLocalPostgresHost(host)) {
    throw new Error(
      `DATABASE_URL host "${host}" is not allowed on Vercel production or preview. ` +
        "Use a hosted PostgreSQL URL (for example Neon)."
    );
  }
}

export function resolvePostgresSsl(url: string): "require" | undefined {
  if (/neon\.tech/i.test(url)) return "require";
  if (/sslmode=(require|verify-full|verify-ca|no-verify)/i.test(url)) return "require";
  return undefined;
}

/** postgres.js options shared by local PostgreSQL and Neon. */
export function getPostgresDriverOptions(url: string): postgres.Options<Record<string, postgres.PostgresType>> {
  const serverless = isHostedVercelDeploy();
  return {
    max: serverless ? 1 : 10,
    idle_timeout: serverless ? 20 : undefined,
    connect_timeout: 10,
    ssl: resolvePostgresSsl(url),
    prepare: false,
  };
}

export function resolveDatabaseConfig(): DatabaseConfig {
  const environment = getAppEnvironment();
  const url = process.env.DATABASE_URL?.trim();

  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. The application requires a PostgreSQL connection string. " +
        "Locally, add it to .env.local (for example " +
        "DATABASE_URL=postgresql://worklight:worklight@127.0.0.1:5433/worklight after `npm run docker:pg:up`). " +
        "On Vercel, set it in the project environment variables (for example a Neon URL)."
    );
  }

  if (!/^postgres(ql)?:\/\//i.test(url)) {
    throw new Error(
      "DATABASE_URL must be a PostgreSQL connection string (postgresql://...). " +
        `SQLite and file URLs are no longer supported at runtime. Received: ${url}. ` +
        "To migrate existing SQLite data, run `npm run db:migrate:sqlite-to-postgres`."
    );
  }

  assertPostgresUrlAllowedForDeploy(url);

  return databaseConfigSchema.parse({
    url,
    dialect: "postgres",
    environment,
  });
}

/** Validated database configuration; parsed once per process. */
export function getDatabaseConfig(): DatabaseConfig {
  if (!cachedConfig) {
    cachedConfig = resolveDatabaseConfig();
  }
  return cachedConfig;
}

/** Reset cached config — for tests only. */
export function resetDatabaseConfigCache(): void {
  cachedConfig = undefined;
}
