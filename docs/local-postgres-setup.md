# Local PostgreSQL setup

Optional Docker PostgreSQL for the Postgres migration path. **The app still uses SQLite by default** until a later migration phase switches the runtime driver and schema.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine + Compose v2)

## Quick start

```bash
npm run docker:pg:up
```

PostgreSQL listens on `localhost:5433` (host port; container uses 5432 internally):

| Setting | Value |
|---|---|
| User | `worklight` |
| Password | `worklight` |
| Database | `worklight` |

Data persists in the Docker volume `worklight_postgres_data`.

## Environment

Copy the local URL into `.env.local` when you want tools to target Postgres (the app runtime still ignores it for now):

```bash
DATABASE_URL=postgresql://worklight:worklight@127.0.0.1:5433/worklight
```

See `.env.example` for the full list.

## Commands

| Command | Action |
|---|---|
| `npm run docker:pg:up` | Start PostgreSQL and wait until healthy |
| `npm run docker:pg:down` | Stop and remove the container (volume kept) |
| `npm run docker:pg:logs` | Follow PostgreSQL logs |
| `npm run db:pg:migrate` | Start Postgres, apply PostgreSQL migrations (`drizzle/postgres/`) |
| `npm run db:pg:generate` | Generate a new PostgreSQL migration from `src/db/schema.ts` |

Apply PostgreSQL migrations after pointing `DATABASE_URL` at the local container:

```bash
npm run db:pg:migrate
npx tsx scripts/verify-postgres-connection.mts
```

To keep using SQLite (default when `DATABASE_URL` is unset):

```bash
npm run db:migrate
npm run dev
```

To wipe local Postgres data:

```bash
docker compose down -v
```

## Verify connectivity

```bash
docker compose exec postgres psql -U worklight -d worklight -c 'SELECT version();'
```

## Current limitations

- Drizzle SQLite migrations remain in `drizzle/`; PostgreSQL migrations live in `drizzle/postgres/`.
- Set `DATABASE_URL=postgresql://worklight:worklight@127.0.0.1:5433/worklight` to run the app against PostgreSQL; omit it to keep using SQLite.
- Briefing, queue summary, secrets, and OAuth JSON files still use the local filesystem.
- `pgvector` is available in the image but not used by the app yet.
- SQLite → PostgreSQL data migration is not included.
