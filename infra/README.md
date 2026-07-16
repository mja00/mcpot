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

Configuration comes from an env file that compose auto-loads from `infra/`:

```bash
cp infra/.env.example infra/.env
# fill in ADMIN_TOKEN, ADMIN_PASSWORD, SESSION_SECRET (see comments in the file)
docker compose -f infra/docker-compose.full.yml up -d
```

Inline env vars on the command line still work and override the file.

This pulls the published images; set `MCPOT_TAG` to pin a specific version (default `latest`), or
add `--build` to build from source instead.

- Dashboard → `http://<host>:8081` (log in with `ADMIN_PASSWORD`)
- API → `http://<host>:8080`
- The server migrates the database on boot and runs the daily retention purge (`RETENTION_DAYS`, default 90).
- Optional reporting sinks: set `ABUSEIPDB_KEY` and/or `WEBHOOK_URL`. With an AbuseIPDB key, automatic reports are enabled by default for public IPs that produce at least 3 hits in 24 hours and reach the existing `scanner` classification (score 60+). Set `ABUSEIPDB_AUTO_REPORT=false` to disable them.
- This deployment is configured for a 5,000-request `/report` quota per UTC day (`ABUSEIPDB_DAILY_LIMIT=5000`) and shares that cap across manual and automatic reports. Reservations are recorded before calls so concurrent replicas cannot oversubscribe it; failed calls remain counted for safety.
- Automatic reports are limited to one attempt per source IP per UTC day. The local criteria are based on observed honeypot connection telemetry, not AbuseIPDB's confidence score.

### GeoIP enrichment (optional)

Set `MAXMIND_ACCOUNT_ID` and `MAXMIND_LICENSE_KEY` (free GeoLite2 account) in `infra/.env` and the
`geoipupdate` sidecar keeps GeoLite2-Country/ASN databases fresh on a shared volume; the server
hot-reloads them and stamps `country_code`/`asn`/`as_org` on new connections. Without credentials
everything works, the geo columns just stay null. For local dev, drop the `.mmdb` files into a
directory and point `GEOIP_DIR` at it.

To geo-tag rows ingested before enrichment existed (re-runnable, `--dry-run` supported):

```bash
docker compose -f infra/docker-compose.full.yml exec server \
  node --experimental-transform-types --disable-warning=ExperimentalWarning \
  apps/server/src/scripts/backfill-geo.ts
```

Append `--dry-run` to preview the per-IP lookups without writing anything.

Put the server/dashboard behind TLS (a reverse proxy) before exposing them publicly. When the proxy
runs on the same machine, layer `docker-compose.local-bind.yml` on top: it unpublishes the server
entirely (the dashboard's nginx proxies `/v1/` to it over the compose network) and binds the
dashboard to loopback only:

```bash
docker compose -f infra/docker-compose.full.yml -f infra/docker-compose.local-bind.yml up -d
```

Point your reverse proxy at `127.0.0.1:8081`. Daemons then use the same public URL as the
dashboard for `MCPOT_SERVER_URL` (e.g. `https://mcpot.example.com`) — no separate API port.

### SSE through reverse proxies (Nginx Proxy Manager, Cloudflare)

The dashboard's live feed is a long-lived `text/event-stream` response on `/v1/events/stream`.
Every proxy between the browser and the server must pass it through unbuffered:

- **The bundled web nginx** already ships a dedicated unbuffered location for it, and the server
  also sends `X-Accel-Buffering: no`, which any nginx hop (including NPM) honors per-response.
- **Nginx Proxy Manager**: usually works as-is because of that header. If the LIVE indicator
  sticks at SYNC, add this to the proxy host's *Advanced* tab:

  ```nginx
  location /v1/events/stream {
      proxy_pass $forward_scheme://$server:$port;
      proxy_http_version 1.1;
      proxy_set_header Connection "";
      proxy_buffering off;
      proxy_cache off;
      proxy_read_timeout 1h;
  }
  ```

- **Cloudflare (proxied DNS)**: streams SSE without buffering, but drops connections idle for
  ~100 s — the server's 25 s heartbeat comments keep the stream under that. Don't add a cache
  rule that caches `/v1/*`. The client auto-reconnects and refetches on any drop, so brief
  proxy restarts self-heal.

## Deploying a daemon to a VPS

Mint an enrollment token from the dashboard (Daemons → Enroll new daemon), then on the VPS:

```bash
docker run -d --name mcpot --restart unless-stopped \
  -p 25565:25565 \
  -v mcpot-data:/data \
  -e MCPOT_SERVER_URL='https://your-central-host:8080' \
  -e MCPOT_ENROLLMENT_TOKEN='<token-from-dashboard>' \
  -e MCPOT_HOSTNAME='pot-de-1' \
  ghcr.io/mja00/mcpot-daemon:latest
```

To build the image from source instead: `docker build -f infra/Dockerfile.daemon -t mcpot-daemon .`

- The daemon enrolls once, persists its identity + durable queue in the `/data` volume, and phones home. Re-running with the same volume keeps the same daemon.
- `MCPOT_HOSTNAME` names the daemon in the dashboard (without it, containers report their container id). It's sent on every heartbeat, so changing it renames an existing daemon on its next check-in — no re-enrollment needed.
- Point real player traffic away from `:25565` — this is a honeypot; anything that connects is recorded.

## Scaling note: partitioning

Retention currently runs as a scheduled `DELETE` of old rows — correct and simple at moderate
volume. Under heavy scan load, convert `connections` to **native range partitioning by `received_at`**
(a raw-SQL migration, since drizzle-kit can't express `PARTITION BY`) and replace the `DELETE` with
dropping expired partitions. The schema was designed for this (time-ordered, indexed on `received_at`).

## Compliance & operations

- **Provider AUP:** many hosts restrict honeypots or high volumes of malicious inbound traffic — check each provider's acceptable-use policy before mass-deploying, and expect abuse-desk mail.
- **PII:** source IPs are personal data (GDPR/CCPA). `RETENTION_DAYS` bounds how long they're kept; set it to your policy.
- **Reporting:** automatic reports are restricted to public IPs with repeated scanner-like telemetry, while the manual endpoint remains available. Observed IPs can still be shared NAT/proxy egress, and ingest is only as trustworthy as daemon keys; review provider policy before enabling production reporting.
- **Secrets:** never bake `ADMIN_TOKEN`/`ADMIN_PASSWORD`/`SESSION_SECRET`/reporting keys into images; pass them as environment/secrets at run time.
