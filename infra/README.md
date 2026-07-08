# Deployment

Two things deploy separately: the **central stack** (server + dashboard + Postgres) runs in one
place; **daemons** run on many VPSes and phone home to it.

## Images

CI publishes images to GHCR on every push to `main` (tagged `latest`, `main`, and the commit sha)
and on `v*` tags (semver tags):

- `ghcr.io/mja00/mcpot-server`
- `ghcr.io/mja00/mcpot-web`
- `ghcr.io/mja00/mcpot-daemon`

If the packages are private, authenticate first with a token that has `read:packages`:

```bash
docker login ghcr.io
```

## Central stack

From the repo root:

```bash
ADMIN_TOKEN=$(openssl rand -hex 24) \
ADMIN_PASSWORD='choose-a-strong-password' \
SESSION_SECRET=$(openssl rand -hex 32) \
docker compose -f infra/docker-compose.full.yml up -d
```

This pulls the published images; set `MCPOT_TAG` to pin a specific version (default `latest`), or
add `--build` to build from source instead.

- Dashboard → `http://<host>:8081` (log in with `ADMIN_PASSWORD`)
- API → `http://<host>:8080`
- The server migrates the database on boot and runs the daily retention purge (`RETENTION_DAYS`, default 90).
- Optional reporting sinks: set `ABUSEIPDB_KEY` and/or `WEBHOOK_URL`. Reporting is **manual** (a button per offender) — never automatic.

Put the server/dashboard behind TLS (a reverse proxy) before exposing them publicly. When the proxy
runs on the same machine, layer `docker-compose.local-bind.yml` on top so the ports only bind to
loopback and can't be reached directly:

```bash
docker compose -f infra/docker-compose.full.yml -f infra/docker-compose.local-bind.yml up -d
```

## Deploying a daemon to a VPS

Mint an enrollment token from the dashboard (Daemons → Enroll new daemon), then on the VPS:

```bash
docker run -d --name mcpot --restart unless-stopped \
  -p 25565:25565 \
  -v mcpot-data:/data \
  -e MCPOT_SERVER_URL='https://your-central-host:8080' \
  -e MCPOT_ENROLLMENT_TOKEN='<token-from-dashboard>' \
  ghcr.io/mja00/mcpot-daemon:latest
```

To build the image from source instead: `docker build -f infra/Dockerfile.daemon -t mcpot-daemon .`

- The daemon enrolls once, persists its identity + durable queue in the `/data` volume, and phones home. Re-running with the same volume keeps the same daemon.
- Point real player traffic away from `:25565` — this is a honeypot; anything that connects is recorded.

## Scaling note: partitioning

Retention currently runs as a scheduled `DELETE` of old rows — correct and simple at moderate
volume. Under heavy scan load, convert `connections` to **native range partitioning by `received_at`**
(a raw-SQL migration, since drizzle-kit can't express `PARTITION BY`) and replace the `DELETE` with
dropping expired partitions. The schema was designed for this (time-ordered, indexed on `received_at`).

## Compliance & operations

- **Provider AUP:** many hosts restrict honeypots or high volumes of malicious inbound traffic — check each provider's acceptable-use policy before mass-deploying, and expect abuse-desk mail.
- **PII:** source IPs are personal data (GDPR/CCPA). `RETENTION_DAYS` bounds how long they're kept; set it to your policy.
- **Reporting:** observed IPs can be shared NAT/proxy egress, and ingest is only as trustworthy as the daemon keys — that's why reporting is human-in-the-loop, not automatic.
- **Secrets:** never bake `ADMIN_TOKEN`/`ADMIN_PASSWORD`/`SESSION_SECRET`/reporting keys into images; pass them as environment/secrets at run time.
