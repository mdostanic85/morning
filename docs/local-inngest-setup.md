# Local Inngest setup

Inngest integration for local development and production. Sync My Day enqueues a
`worklight/sync.requested` event; the Inngest worker performs the actual sync.

## Prerequisites

- Node.js and npm
- Worklight app dependencies installed (`npm install`)

## Commands

| Command | Action |
|---|---|
| `npm run dev` | Start Next.js and Inngest together |
| `npm run dev:next` | Start Next.js only (`http://localhost:3000`) |
| `npm run dev:inngest` | Start Inngest Dev Server (expects Next.js at `:3000`) |
| `npm run dev:all` | Alias for `npm run dev` |

## Quick start

Normal local development:

```bash
npm run dev
```

For separate terminals, run `npm run dev:next` first and then:

```bash
npm run dev:inngest
```

Inngest Dev Server UI: [http://localhost:8288](http://localhost:8288)

## Trigger the test workflow

```bash
curl -X POST http://localhost:3000/api/inngest/test \
  -H 'content-type: application/json' \
  -d '{"note":"hello from curl"}'
```

Check the last completed result:

```bash
curl http://localhost:3000/api/inngest/test
```

You should also see the run in the Inngest Dev Server UI under the `test-ping` function.

## Sync My Day workflow

Background sync is triggered by `POST /api/day/sync`, which enqueues the `worklight/sync.requested` event handled by the `sync-my-day` Inngest function.

Poll progress:

```bash
curl http://localhost:3000/api/day/sync/<syncRunId>
```

Inngest discovers and invokes functions through:

```
GET|POST|PUT /api/inngest
```

This route is compatible with Vercel deployment (`maxDuration = 300`).

## Production (Vercel)

1. Deploy the app with `/api/inngest` reachable.
2. Connect the [Inngest Vercel integration](https://www.inngest.com/docs/deploy/vercel) or set the signing/event keys manually.
3. Sync the app from the Inngest dashboard (or send `PUT /api/inngest` after deploy).

Required environment variables are listed in `.env.example`.
