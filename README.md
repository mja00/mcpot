# minecraft-pot-network

A distributed Minecraft honeypot network. Daemons present realistic fake servers to internet
scanners, capture every connection attempt, and phone home to a central service with a dashboard.

- `packages/protocol` — hardened Minecraft wire codec (status ping + login capture)
- `packages/shared` — zod schemas + typed API client
- `apps/daemon` — the honeypot: TCP listener, persona engine, durable phone-home queue
- `apps/server` — central ingest + control API (Fastify + Postgres/Drizzle)
- `apps/web` — Vue 3 dashboard

## Prerequisites

- Node **≥ 24** (native TypeScript execution; the daemon/server run `.ts` directly)
- pnpm **10**
- Docker (for local Postgres)

```bash
pnpm install
```

## Running locally

Each command runs in its own terminal. Local dev defaults (DB URL, `dev-admin-token`) are baked
into the root scripts — do **not** use these in production.

### 1. Postgres + migrations

```bash
pnpm db:up        # start Postgres on localhost:55432 (docker compose)
pnpm db:migrate   # apply Drizzle migrations
```

### 2. Central server

```bash
pnpm server       # http://localhost:8080  (admin token: dev-admin-token)
```

### 3. Dashboard

```bash
pnpm web          # http://localhost:5173  (proxies /v1 -> :8080, injects admin auth)
```

### 4. A honeypot daemon

Mint an enrollment token (one-time, single-use), then start a daemon that enrolls and phones home:

```bash
TOKEN=$(pnpm -s token | sed -E 's/.*"token":"([^"]+)".*/\1/')

MCPOT_SERVER_URL=http://localhost:8080 \
MCPOT_ENROLLMENT_TOKEN="$TOKEN" \
MCPOT_STATE_DIR=./data/daemon \
MCPOT_PORT=25565 \
  pnpm --filter @mcpot/daemon start
```

Or run a daemon with **no central server** (logs each connection as JSON):

```bash
pnpm daemon               # standalone on :25565
pnpm daemon:watch         # same, auto-reload on source changes
```

### 5. Generate traffic

Point a real Minecraft client (Java 1.20.2+) at `127.0.0.1:25565` — the server list shows the fake
server (status ping), and clicking Join is captured as a login (username + UUID). Every connection
flows daemon → server → Postgres and appears on the dashboard within a few seconds.

## Development

```bash
pnpm test         # all packages (server tests skip unless TEST_DATABASE_URL is set)
pnpm lint         # eslint across the monorepo
pnpm typecheck    # tsc/vue-tsc across the monorepo
pnpm build        # build libraries + apps

pnpm db:down      # stop Postgres
```

Server integration tests need a database:

```bash
TEST_DATABASE_URL=postgres://mcpot:mcpot@localhost:55432/mcpot pnpm --filter @mcpot/server test
```
