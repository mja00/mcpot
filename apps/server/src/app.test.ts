import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ConnectionEvent } from "@mcpot/shared";
import { buildApp } from "./app.ts";
import { createClient, createDb, type Db } from "./db/client.ts";
import { runMigrations } from "./db/migrate.ts";
import { purgeOldConnections } from "./retention.ts";
import { abuseipdbChecks, abuseipdbDailyUsage, abuseReports } from "./db/schema.ts";
import { classify } from "./classify.ts";
import { ReportingService } from "./report.ts";

// Integration tests need a real Postgres. Set TEST_DATABASE_URL to run them; otherwise they skip so
// `pnpm -r test` stays green on machines without a database.
const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

const ADMIN_TOKEN = "test-admin-token";
const ADMIN_PASSWORD = "test-password";
const SESSION_SECRET = "test-session-secret";

function makeEvent(overrides: Partial<ConnectionEvent> = {}): ConnectionEvent {
	return {
		eventId: randomUUID(),
		observedAt: new Date().toISOString(),
		srcIp: "203.0.113.7",
		srcPort: 51234,
		protocolVersion: 772,
		serverAddress: "203.0.113.7",
		serverPort: 25565,
		intent: "status",
		pingCompleted: true,
		username: null,
		playerUuid: null,
		fingerprint: null,
		...overrides,
	};
}

suite("central server (integration)", () => {
	let client: ReturnType<typeof createClient>;
	let db: Db;
	let app: ReturnType<typeof buildApp>;

	beforeAll(async () => {
		await runMigrations(url);
		client = createClient(url);
		db = createDb(client);
		app = buildApp({ db, adminToken: ADMIN_TOKEN, adminPassword: ADMIN_PASSWORD, sessionSecret: SESSION_SECRET });
		await app.ready();
	});

	afterAll(async () => {
		await app.close();
		await client.end();
	});

	beforeEach(async () => {
		await client`truncate table abuseipdb_checks, abuse_reports, abuseipdb_daily_usage, connections, daemons, enrollment_tokens cascade`;
	});

	async function mintToken(): Promise<string> {
		const res = await app.inject({
			method: "POST",
			url: "/v1/admin/tokens",
			headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
			payload: { label: "test" },
		});
		expect(res.statusCode).toBe(201);
		return res.json().token as string;
	}

	async function enroll(machineId = "machine-1", hostname = "vps-1"): Promise<{ daemonId: string; apiKey: string }> {
		const token = await mintToken();
		const res = await app.inject({
			method: "POST",
			url: "/v1/enroll",
			payload: { enrollmentToken: token, machineId, hostname },
		});
		expect(res.statusCode).toBe(201);
		return res.json();
	}

	it("enrolls with a valid token and rejects a bad one", async () => {
		const { daemonId, apiKey } = await enroll();
		expect(daemonId).toBeTruthy();
		expect(apiKey).toMatch(/^mcpd_/);

		const bad = await app.inject({
			method: "POST",
			url: "/v1/enroll",
			payload: { enrollmentToken: "mcpe_bogus", machineId: "m2" },
		});
		expect(bad.statusCode).toBe(401);
	});

	it("re-enrollment is idempotent on machineId (same daemon, new key)", async () => {
		const first = await enroll("stable-machine");
		const second = await enroll("stable-machine");
		expect(second.daemonId).toBe(first.daemonId);
		expect(second.apiKey).not.toBe(first.apiKey);
	});

	it("rejects a single-use token on second use", async () => {
		const token = await mintToken();
		const a = await app.inject({ method: "POST", url: "/v1/enroll", payload: { enrollmentToken: token, machineId: "a" } });
		const b = await app.inject({ method: "POST", url: "/v1/enroll", payload: { enrollmentToken: token, machineId: "b" } });
		expect(a.statusCode).toBe(201);
		expect(b.statusCode).toBe(401);
	});

	it("ingests a batch and dedupes retries idempotently", async () => {
		const { apiKey } = await enroll();
		const events = [makeEvent(), makeEvent({ intent: "login", username: "ScannerBot" })];

		const first = await app.inject({
			method: "POST",
			url: "/v1/ingest",
			headers: { authorization: `Bearer ${apiKey}` },
			payload: { events },
		});
		expect(first.statusCode).toBe(200);
		expect(first.json()).toEqual({ accepted: 2, duplicates: 0 });

		// Replay the exact same batch — must be fully deduped.
		const replay = await app.inject({
			method: "POST",
			url: "/v1/ingest",
			headers: { authorization: `Bearer ${apiKey}` },
			payload: { events },
		});
		expect(replay.json()).toEqual({ accepted: 0, duplicates: 2 });

		const [{ n }] = await client<{ n: number }[]>`select count(*)::int as n from connections`;
		expect(n).toBe(2);
	});

	it("automatically reports a repeated public scanner without delaying ingest", async () => {
		let reportCalls = 0;
		let checkCalls = 0;
		let resolveReport!: () => void;
		const reportDone = new Promise<void>((resolve, reject) => {
			resolveReport = resolve;
			setTimeout(() => reject(new Error("automatic report did not run")), 1000);
		});
		const reportingApp = buildApp({
			db,
			adminToken: ADMIN_TOKEN,
			adminPassword: ADMIN_PASSWORD,
			sessionSecret: SESSION_SECRET,
			abuseipdbKey: "test-key",
			autoReportEnabled: true,
			reportFetch: async (requestUrl) => {
				if (typeof requestUrl === "string" && requestUrl.includes("/check?")) {
					checkCalls += 1;
					return new Response(JSON.stringify({ data: { ipAddress: "8.8.8.8", abuseConfidenceScore: 2, totalReports: 1 } }), {
						status: 200,
						headers: { "content-type": "application/json" },
					});
				}
				reportCalls += 1;
				resolveReport();
				return new Response("ok", { status: 200 });
			},
		});
		await reportingApp.ready();
		try {
			const { apiKey } = await enroll("auto-machine");
			// Raw-IP probes with anomalous handshakes that never complete the ping: 30+15+10+10+5 = 70 ≥ 60.
			const events = [1, 2, 3].map(() =>
				makeEvent({
					srcIp: "8.8.8.8",
					serverAddress: "8.8.8.8",
					protocolVersion: null,
					pingCompleted: false,
					fingerprint: "protocol_error:bad_varint",
				}),
			);
			const ingest = await reportingApp.inject({
				method: "POST",
				url: "/v1/ingest",
				headers: { authorization: `Bearer ${apiKey}` },
				payload: { events },
			});
			expect(ingest.statusCode).toBe(200);
			await reportDone;
		} finally {
			await reportingApp.close();
		}
		expect(reportCalls).toBe(1);
		expect(checkCalls).toBe(1);
	});

	it("counts provider failures and suppresses duplicate IP attempts", async () => {
		let calls = 0;
		const service = new ReportingService(
			db,
			{ abuseipdbKey: "test-key", webhookUrl: null, abuseipdbDailyLimit: 10, abuseipdbCheckDailyLimit: 10, abuseipdbCheckCacheHours: 24 },
			async () => {
				calls += 1;
				return new Response("unavailable", { status: 503 });
			},
		);

		expect(await service.reportIp("8.8.8.8")).toEqual({ reported: false, sinks: [] });
		expect(await service.reportIp("8.8.8.8")).toEqual({ reported: false, sinks: [] });
		expect(calls).toBe(1);

		const [report] = await db.select().from(abuseReports).where(eq(abuseReports.srcIp, "8.8.8.8"));
		expect(report?.status).toBe("failed");
		const [usage] = await db.select().from(abuseipdbDailyUsage);
		expect(usage?.reportCount).toBe(1);
	});

	it("does not exceed the configured daily cap under concurrency", async () => {
		let calls = 0;
		const service = new ReportingService(
			db,
			{ abuseipdbKey: "test-key", webhookUrl: null, abuseipdbDailyLimit: 2, abuseipdbCheckDailyLimit: 2, abuseipdbCheckCacheHours: 24 },
			async () => {
				calls += 1;
				return new Response("ok", { status: 200 });
			},
		);

		await Promise.all(["8.8.8.1", "8.8.8.2", "8.8.8.3", "8.8.8.4"].map((ip) => service.reportIp(ip)));
		expect(calls).toBe(2);
		const [usage] = await db.select().from(abuseipdbDailyUsage);
		expect(usage?.reportCount).toBe(2);
	});

	it("caches successful AbuseIPDB checks and tracks their separate quota", async () => {
		let calls = 0;
		const service = new ReportingService(
			db,
			{ abuseipdbKey: "test-key", webhookUrl: null, abuseipdbDailyLimit: 10, abuseipdbCheckDailyLimit: 1, abuseipdbCheckCacheHours: 24 },
			async (url) => {
				calls += 1;
				expect(String(url)).toContain("/api/v2/check?");
				return new Response(JSON.stringify({ data: { ipAddress: "8.8.8.8", abuseConfidenceScore: 42, totalReports: 7, isTor: false } }), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			},
		);

		const first = await service.checkIp("8.8.8.8");
		const second = await service.checkIp("8.8.8.8");
		expect(first?.abuseConfidenceScore).toBe(42);
		expect(second).toBeNull();
		expect(calls).toBe(1);
		const [usage] = await db.select().from(abuseipdbDailyUsage);
		expect(usage?.checkCount).toBe(1);
		const [cache] = await db.select().from(abuseipdbChecks);
		expect(cache?.status).toBe("succeeded");
	});

	it("rejects ingest without a valid key", async () => {
		const res = await app.inject({ method: "POST", url: "/v1/ingest", payload: { events: [makeEvent()] } });
		expect(res.statusCode).toBe(401);
	});

	it("returns config only for the authenticated daemon (scope enforcement)", async () => {
		const a = await enroll("machine-a");
		const b = await enroll("machine-b");

		const own = await app.inject({
			method: "GET",
			url: `/v1/daemons/${a.daemonId}/config`,
			headers: { authorization: `Bearer ${a.apiKey}` },
		});
		expect(own.statusCode).toBe(200);
		// Persona is now seeded-generated (M4), so assert a valid persona rather than a fixed protocol.
		expect(typeof own.json().persona.protocol).toBe("number");
		expect(own.json().persona.seed).toBe("machine-a");

		// a's key trying to read b's config must be forbidden.
		const cross = await app.inject({
			method: "GET",
			url: `/v1/daemons/${b.daemonId}/config`,
			headers: { authorization: `Bearer ${a.apiKey}` },
		});
		expect(cross.statusCode).toBe(403);
	});

	it("sanitizes attacker-controlled strings on ingest", async () => {
		const { apiKey } = await enroll();
		await app.inject({
			method: "POST",
			url: "/v1/ingest",
			headers: { authorization: `Bearer ${apiKey}` },
			payload: { events: [makeEvent({ intent: "login", username: "bad\r\ninject", serverAddress: "evil host" })] },
		});
		const [row] = await client<{ username: string; server_address: string }[]>`
			select username, server_address from connections limit 1`;
		expect(row!.username).toBe("badinject");
		expect(row!.server_address).toBe("evilhost");
	});

	it("stores null geo columns when no GeoLite2 databases are configured", async () => {
		const { apiKey } = await enroll();
		await app.inject({
			method: "POST",
			url: "/v1/ingest",
			headers: { authorization: `Bearer ${apiKey}` },
			payload: { events: [makeEvent()] },
		});
		const [row] = await client<{ country_code: string | null; asn: number | null; as_org: string | null }[]>`
			select country_code, asn, as_org from connections limit 1`;
		expect(row!.country_code).toBeNull();
		expect(row!.asn).toBeNull();
		expect(row!.as_org).toBeNull();
	});

	it("logs in with the admin password and the session token authorizes reads", async () => {
		const bad = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { password: "wrong" } });
		expect(bad.statusCode).toBe(401);

		const ok = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { password: ADMIN_PASSWORD } });
		expect(ok.statusCode).toBe(200);
		const { token } = ok.json();

		const stats = await app.inject({ method: "GET", url: "/v1/stats", headers: { authorization: `Bearer ${token}` } });
		expect(stats.statusCode).toBe(200);

		const noAuth = await app.inject({ method: "GET", url: "/v1/stats" });
		expect(noAuth.statusCode).toBe(401);
	});

	it("serves range-aligned trends, daemons, and offenders", async () => {
		const first = await enroll("machine-a", "edge-a");
		const second = await enroll("machine-b", "edge-b");
		const src = "198.51.100.9";
		await app.inject({
			method: "POST",
			url: "/v1/ingest",
			headers: { authorization: `Bearer ${first.apiKey}` },
			payload: {
				events: [
					makeEvent({ srcIp: src, serverAddress: "mc.example.test" }),
					makeEvent({ srcIp: src, intent: "login", username: "bot", serverAddress: "mc.example.test" }),
				],
			},
		});
		await app.inject({
			method: "POST",
			url: "/v1/ingest",
			headers: { authorization: `Bearer ${second.apiKey}` },
			payload: { events: [makeEvent({ srcIp: "198.51.100.10" })] },
		});
		const previousEvent = makeEvent({ srcIp: "198.51.100.11" });
		await app.inject({
			method: "POST",
			url: "/v1/ingest",
			headers: { authorization: `Bearer ${first.apiKey}` },
			payload: { events: [previousEvent] },
		});
		await client`update connections set received_at = now() - interval '30 hours' where event_id = ${previousEvent.eventId}`;
		const hdr = { authorization: `Bearer ${ADMIN_TOKEN}` };

		const trends = await app.inject({ method: "GET", url: "/v1/trends?hours=24", headers: hdr });
		expect(trends.statusCode).toBe(200);
		const trendBody = trends.json();
		expect(trendBody.range.bucketMinutes).toBe(60);
		expect(trendBody.summary).toEqual({
			current: { total: 3, uniqueIps: 2, loginCount: 1, activeDaemons: 2 },
			previous: { total: 1, uniqueIps: 1, loginCount: 0, activeDaemons: 1 },
		});
		expect(trendBody.series.reduce((sum: number, bucket: { total: number }) => sum + bucket.total, 0)).toBe(3);
		expect(trendBody.series).toHaveLength(25);
		expect(trendBody.countries[0]).toEqual({ countryCode: null, hits: 3, uniqueIps: 2 });
		expect(trendBody.serverAddresses[0]).toEqual({ serverAddress: "mc.example.test", hits: 2 });
		expect(trendBody.usernames[0]).toEqual({ username: "bot", hits: 1 });
		expect(trendBody.daemons.map((daemon: { daemonHostname: string; hits: number }) => [daemon.daemonHostname, daemon.hits])).toEqual([
			["edge-a", 2],
			["edge-b", 1],
		]);
		expect(trendBody.daemonSeries.daemons).toHaveLength(2);

		const daemons = await app.inject({ method: "GET", url: "/v1/daemons", headers: hdr });
		expect(daemons.statusCode).toBe(200);
		expect(daemons.json().length).toBe(2);
		expect(daemons.json()[0]).toHaveProperty("versionName");

		const offenders = await app.inject({ method: "GET", url: "/v1/offenders?windowHours=24", headers: hdr });
		expect(offenders.statusCode).toBe(200);
		expect(offenders.json().total).toBe(2);
		const top = offenders.json().rows.find((row: { srcIp: string }) => row.srcIp === src);
		expect(top.srcIp).toBe(src);
		expect(top.hits).toBe(2);
		expect(top.logins).toBe(1);
		expect(typeof top.score).toBe("number");
		expect(["scanner", "suspicious", "prober"]).toContain(top.classification);
	});

	it("attributes connection reads to the daemon's current hostname", async () => {
		const { daemonId, apiKey } = await enroll("named-machine", "edge-old");
		await app.inject({
			method: "POST",
			url: "/v1/ingest",
			headers: { authorization: `Bearer ${apiKey}` },
			payload: { events: [makeEvent()] },
		});
		await app.inject({
			method: "POST",
			url: `/v1/daemons/${daemonId}/heartbeat`,
			headers: { authorization: `Bearer ${apiKey}` },
			payload: { queueDepth: 0, uptimeSeconds: 10, configRevision: 1, hostname: "edge-new" },
		});

		const response = await app.inject({
			method: "GET",
			url: "/v1/connections",
			headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
		});
		expect(response.statusCode).toBe(200);
		expect(response.json()[0]).toMatchObject({ daemonId, daemonHostname: "edge-new" });
	});

	it("limits daemon chart series to eight and aggregates the remainder", async () => {
		for (let index = 0; index < 9; index++) {
			const daemon = await enroll(`chart-${index}`, `edge-${index}`);
			await app.inject({
				method: "POST",
				url: "/v1/ingest",
				headers: { authorization: `Bearer ${daemon.apiKey}` },
				payload: { events: [makeEvent({ srcIp: `198.51.100.${index + 1}` })] },
			});
		}
		const response = await app.inject({
			method: "GET",
			url: "/v1/trends?hours=6",
			headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
		});
		expect(response.statusCode).toBe(200);
		const body = response.json();
		expect(body.range.bucketMinutes).toBe(15);
		expect(body.daemonSeries.daemons).toHaveLength(8);
		expect(body.daemonSeries.buckets.reduce((sum: number, bucket: { other: number }) => sum + bucket.other, 0)).toBe(1);
	});

	it("sorts and paginates offenders", async () => {
		const { apiKey } = await enroll();
		// ipA has the most hits but the oldest activity; ipC is the most recent with the fewest hits.
		const ipA = "198.51.100.1";
		const ipB = "198.51.100.2";
		const ipC = "198.51.100.3";
		await app.inject({
			method: "POST",
			url: "/v1/ingest",
			headers: { authorization: `Bearer ${apiKey}` },
			payload: {
				events: [
					makeEvent({ srcIp: ipA }),
					makeEvent({ srcIp: ipA }),
					makeEvent({ srcIp: ipA, intent: "login", username: "bot" }),
					makeEvent({ srcIp: ipB }),
					makeEvent({ srcIp: ipB }),
					makeEvent({ srcIp: ipC }),
				],
			},
		});
		await client`update connections set received_at = now() - interval '3 hours' where src_ip = ${ipA}`;
		await client`update connections set received_at = now() - interval '2 hours' where src_ip = ${ipB}`;
		const hdr = { authorization: `Bearer ${ADMIN_TOKEN}` };

		// Default sort is last seen desc — the most recent IP leads, not the highest-hit one.
		const byDate = await app.inject({ method: "GET", url: "/v1/offenders?windowHours=24", headers: hdr });
		expect(byDate.statusCode).toBe(200);
		expect(byDate.json().total).toBe(3);
		expect(byDate.json().rows.map((r: { srcIp: string }) => r.srcIp)).toEqual([ipC, ipB, ipA]);

		const byHits = await app.inject({ method: "GET", url: "/v1/offenders?sortBy=hits&order=desc", headers: hdr });
		expect(byHits.json().rows.map((r: { srcIp: string }) => r.srcIp)).toEqual([ipA, ipB, ipC]);

		const byHitsAsc = await app.inject({ method: "GET", url: "/v1/offenders?sortBy=hits&order=asc", headers: hdr });
		expect(byHitsAsc.json().rows[0].srcIp).toBe(ipC);

		// SQL score mirror must order the same way the JS-computed scores do.
		const byScore = await app.inject({ method: "GET", url: "/v1/offenders?sortBy=score", headers: hdr });
		const scores = byScore.json().rows.map((r: { score: number }) => r.score);
		expect(scores).toEqual([...scores].sort((a: number, b: number) => b - a));

		const page1 = await app.inject({ method: "GET", url: "/v1/offenders?limit=1&offset=0", headers: hdr });
		const page2 = await app.inject({ method: "GET", url: "/v1/offenders?limit=1&offset=1", headers: hdr });
		expect(page1.json().rows).toHaveLength(1);
		expect(page2.json().rows).toHaveLength(1);
		expect(page2.json().total).toBe(3);
		expect(page2.json().rows[0].srcIp).not.toBe(page1.json().rows[0].srcIp);

		const past = await app.inject({ method: "GET", url: "/v1/offenders?offset=500", headers: hdr });
		expect(past.statusCode).toBe(200);
		expect(past.json()).toEqual({ rows: [], total: 0 });

		const bad = await app.inject({ method: "GET", url: "/v1/offenders?sortBy=bogus", headers: hdr });
		expect(bad.statusCode).toBe(400);
	});

	it("aggregates offender signals and keeps SQL score ordering in lockstep with classify()", async () => {
		const edgeA = await enroll("parity-a", "edge-a");
		const edgeB = await enroll("parity-b", "edge-b");
		const rawScanner = "198.51.100.20"; // raw-IP sweep across both daemons → 30+25+5 = 60
		const masscan = "198.51.100.21"; // bare connects, no handshake → 15+10+5 = 30
		const replayer = "198.51.100.22"; // hostname+protocol churn via domains → 15+10+5 = 30
		const flooder = "198.51.100.23"; // only a synthetic rate_limited summary → 15+5 = 20

		const ingest = (apiKey: string, events: ConnectionEvent[]) =>
			app.inject({ method: "POST", url: "/v1/ingest", headers: { authorization: `Bearer ${apiKey}` }, payload: { events } });
		await ingest(edgeA.apiKey, [
			makeEvent({ srcIp: rawScanner }),
			makeEvent({ srcIp: rawScanner }),
			...[null, null, null].map(() =>
				makeEvent({ srcIp: masscan, intent: "unknown", protocolVersion: null, serverAddress: "", pingCompleted: false, fingerprint: "handshake_timeout" }),
			),
			...["a.example", "b.example", "c.example"].map((serverAddress, i) =>
				makeEvent({ srcIp: replayer, serverAddress, protocolVersion: 770 + i }),
			),
			makeEvent({
				srcIp: flooder,
				intent: "unknown",
				protocolVersion: null,
				serverAddress: "",
				pingCompleted: false,
				fingerprint: "rate_limited",
				droppedCount: 50,
			}),
		]);
		await ingest(edgeB.apiKey, [makeEvent({ srcIp: rawScanner }), makeEvent({ srcIp: rawScanner })]);
		await ingest(edgeA.apiKey, [
			makeEvent({
				srcIp: rawScanner,
				intent: "unknown",
				protocolVersion: null,
				serverAddress: "",
				pingCompleted: false,
				fingerprint: "rate_limited",
				droppedCount: 50,
			}),
		]);

		const res = await app.inject({
			method: "GET",
			url: "/v1/offenders?windowHours=24&sortBy=score&order=desc",
			headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
		});
		expect(res.statusCode).toBe(200);
		const rows = res.json().rows;
		expect(rows.map((r: { srcIp: string; score: number }) => [r.srcIp, r.score])).toEqual([
			[rawScanner, 75],
			[masscan, 30],
			[replayer, 30],
			[flooder, 20],
		]);

		// Drift guard: the JS-computed score must equal classify() over the row's own signals, and the
		// SQL ORDER BY already sorted by its generated expression — so both formulas agree row-for-row.
		for (const row of rows) expect(classify(row).score).toBe(row.score);

		const byIp = new Map(rows.map((r: { srcIp: string }) => [r.srcIp, r]));
		expect(byIp.get(rawScanner)).toMatchObject({ hits: 4, daemonsHit: 2, rawHostnameHits: 4, rateLimitedDrops: 50 });
		expect(byIp.get(masscan)).toMatchObject({ anomalyHits: 3, abnormalProtoHits: 3, rawHostnameHits: 0 });
		expect(byIp.get(replayer)).toMatchObject({ distinctAddresses: 3, distinctProtocols: 3 });
		// Synthetic rate_limited rows feed only the drop tally — never ordinary hit or scanner signals.
		expect(byIp.get(flooder)).toMatchObject({ hits: 0, daemonsHit: 0, rateLimitedDrops: 50, anomalyHits: 0, abnormalProtoHits: 0 });
	});

	it("overview aggregates stats, intents, tops, and a series in one call", async () => {
		const { apiKey } = await enroll();
		await app.inject({
			method: "POST",
			url: "/v1/ingest",
			headers: { authorization: `Bearer ${apiKey}` },
			payload: {
				events: [
					makeEvent({ serverAddress: "mc.example.com" }),
					makeEvent({ serverAddress: "mc.example.com" }),
					makeEvent({ intent: "login", username: "steve", serverAddress: "mc.example.com" }),
					makeEvent({ intent: "login", username: "alex", serverAddress: "other.example.com" }),
				],
			},
		});
		const res = await app.inject({
			method: "GET",
			url: "/v1/overview?windowMinutes=60&topLimit=5",
			headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
		});
		expect(res.statusCode).toBe(200);
		const body = res.json();
		expect(body.stats.total).toBe(4);
		expect(body.intents.find((i: { intent: string }) => i.intent === "login").count).toBe(2);
		expect(body.topServerAddresses[0]).toEqual({ serverAddress: "mc.example.com", hits: 3 });
		expect(body.topUsernames).toHaveLength(2);
		expect(body.bucketMinutes).toBe(1);
		expect(body.series.reduce((s: number, b: { total: number }) => s + b.total, 0)).toBe(4);
		expect(body.daemonActivity).toHaveLength(1);
		expect(body.daemonActivity[0].hits).toBe(4);
	});

	it("report is gated: no-op (reported:false) when no sink is configured", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/v1/admin/report",
			headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
			payload: { srcIp: "45.83.66.12" },
		});
		expect(res.statusCode).toBe(200);
		expect(res.json()).toEqual({ reported: false, sinks: [] });

		const bad = await app.inject({
			method: "POST",
			url: "/v1/admin/report",
			headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
			payload: { srcIp: "not-an-ip" },
		});
		expect(bad.statusCode).toBe(400);
	});

	it("heartbeat with a hostname renames the daemon; without one it keeps the name", async () => {
		const { daemonId, apiKey } = await enroll();
		const hdr = { authorization: `Bearer ${apiKey}` };

		const renamed = await app.inject({
			method: "POST",
			url: `/v1/daemons/${daemonId}/heartbeat`,
			headers: hdr,
			payload: { queueDepth: 0, uptimeSeconds: 10, configRevision: 1, hostname: "pot-de-1" },
		});
		expect(renamed.statusCode).toBe(204);

		// A legacy heartbeat (no hostname field) must not clear the name.
		await app.inject({
			method: "POST",
			url: `/v1/daemons/${daemonId}/heartbeat`,
			headers: hdr,
			payload: { queueDepth: 0, uptimeSeconds: 20, configRevision: 1 },
		});

		const list = await app.inject({ method: "GET", url: "/v1/daemons", headers: { authorization: `Bearer ${ADMIN_TOKEN}` } });
		expect(list.json().find((d: { id: string }) => d.id === daemonId).hostname).toBe("pot-de-1");
	});

	it("streams ingested events over sse", async () => {
		const { apiKey } = await enroll();
		// inject() can't consume a hijacked infinite response, so listen on an ephemeral port.
		const base = await app.listen({ port: 0, host: "127.0.0.1" });
		const controller = new AbortController();
		try {
			const res = await fetch(`${base}/v1/events/stream`, {
				headers: { accept: "text/event-stream", authorization: `Bearer ${ADMIN_TOKEN}` },
				signal: controller.signal,
			});
			expect(res.status).toBe(200);
			expect(res.headers.get("content-type")).toBe("text/event-stream");

			const event = makeEvent({ intent: "login", username: "streamer" });
			await app.inject({
				method: "POST",
				url: "/v1/ingest",
				headers: { authorization: `Bearer ${apiKey}` },
				payload: { events: [event] },
			});

			const reader = res.body!.getReader();
			const decoder = new TextDecoder();
			let buf = "";
			while (!buf.includes("event: connection")) {
				const { value, done } = await reader.read();
				if (done) break;
				buf += decoder.decode(value, { stream: true });
			}
			expect(buf).toContain("event: connection");
			expect(buf).toContain(`id: ${event.eventId}`);
			const data = /data: (.*)\n/.exec(buf);
			const payload = JSON.parse(data![1]!);
			expect(payload.username).toBe("streamer");
			expect(payload.eventId).toBe(event.eventId);
			expect(payload.daemonHostname).toBe("vps-1");
			expect(payload.receivedAt).toBeTruthy();
		} finally {
			controller.abort();
		}
	});

	it("rejects the sse stream without auth", async () => {
		const res = await app.inject({ method: "GET", url: "/v1/events/stream" });
		expect(res.statusCode).toBe(401);
	});

	it("retention purges connections older than the window", async () => {
		const { apiKey } = await enroll();
		await app.inject({
			method: "POST",
			url: "/v1/ingest",
			headers: { authorization: `Bearer ${apiKey}` },
			payload: { events: [makeEvent()] },
		});
		// Backdate the row well past the retention window.
		await client`update connections set received_at = now() - interval '100 days'`;

		const purged = await purgeOldConnections(db, 90);
		expect(purged).toBe(1);
		const [{ n }] = await client<{ n: number }[]>`select count(*)::int as n from connections`;
		expect(n).toBe(0);
	});

	it("stats reflect ingested events", async () => {
		const { apiKey } = await enroll();
		await app.inject({
			method: "POST",
			url: "/v1/ingest",
			headers: { authorization: `Bearer ${apiKey}` },
			payload: { events: [makeEvent(), makeEvent(), makeEvent({ intent: "login" })] },
		});
		const res = await app.inject({
			method: "GET",
			url: "/v1/stats?windowMinutes=60",
			headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
		});
		expect(res.statusCode).toBe(200);
		const stats = res.json();
		expect(stats.total).toBe(3);
		expect(stats.statusCount).toBe(2);
		expect(stats.loginCount).toBe(1);
		expect(stats.uniqueIps).toBe(1);
	});
});
