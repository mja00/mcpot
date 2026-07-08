import { and, count, countDistinct, desc, eq, gte, sql } from "drizzle-orm";
import type { ConnectionEvent } from "@mcpot/shared";
import type { Db } from "./client.ts";
import { connections } from "./schema.ts";
import { sanitizeString, toInetOrNull } from "../sanitize.ts";
import { type Classification, classify } from "../classify.ts";
import type { GeoService } from "../geo.ts";

export interface IngestResult {
	accepted: number;
	duplicates: number;
}

/**
 * Store a batch idempotently. event_id is the PK, so onConflictDoNothing makes retried batches safe.
 * We also dedupe within the batch first (a single INSERT can't reference the same conflict key twice)
 * and sanitize attacker-controlled strings. received_at defaults to server time (daemon clocks drift).
 * Geo enrichment happens here (not on read) so historic rows keep the geo of when they were seen.
 */
export async function ingestEvents(db: Db, geo: GeoService, daemonId: string, events: ConnectionEvent[]): Promise<IngestResult> {
	const seen = new Set<string>();
	const rows = [];
	for (const e of events) {
		if (seen.has(e.eventId)) continue;
		seen.add(e.eventId);
		const srcIp = toInetOrNull(e.srcIp);
		rows.push({
			eventId: e.eventId,
			daemonId,
			observedAt: new Date(e.observedAt),
			srcIp,
			srcPort: e.srcPort,
			protocolVersion: e.protocolVersion,
			serverAddress: sanitizeString(e.serverAddress),
			serverPort: e.serverPort,
			intent: e.intent,
			pingCompleted: e.pingCompleted,
			username: sanitizeString(e.username),
			playerUuid: e.playerUuid,
			fingerprint: sanitizeString(e.fingerprint),
			...geo.lookup(srcIp),
		});
	}
	if (rows.length === 0) return { accepted: 0, duplicates: events.length };

	const inserted = await db
		.insert(connections)
		.values(rows)
		.onConflictDoNothing({ target: connections.eventId })
		.returning({ eventId: connections.eventId });

	return { accepted: inserted.length, duplicates: events.length - inserted.length };
}

export interface RecentConnection {
	eventId: string;
	daemonId: string;
	receivedAt: Date;
	srcIp: string | null;
	protocolVersion: number | null;
	serverAddress: string | null;
	intent: string;
	username: string | null;
	countryCode: string | null;
	asn: number | null;
	asOrg: string | null;
}

/** Most recent events, optionally scoped to one daemon and/or source IP. */
export async function listConnections(
	db: Db,
	opts: { limit: number; daemonId?: string; srcIp?: string } = { limit: 100 },
): Promise<RecentConnection[]> {
	const base = db
		.select({
			eventId: connections.eventId,
			daemonId: connections.daemonId,
			receivedAt: connections.receivedAt,
			srcIp: connections.srcIp,
			protocolVersion: connections.protocolVersion,
			serverAddress: connections.serverAddress,
			intent: connections.intent,
			username: connections.username,
			countryCode: connections.countryCode,
			asn: connections.asn,
			asOrg: connections.asOrg,
		})
		.from(connections)
		.orderBy(desc(connections.receivedAt))
		.limit(Math.min(opts.limit, 1000));
	if (opts.daemonId && opts.srcIp) {
		return base.where(and(eq(connections.daemonId, opts.daemonId), eq(connections.srcIp, opts.srcIp)));
	}
	if (opts.daemonId) return base.where(eq(connections.daemonId, opts.daemonId));
	if (opts.srcIp) return base.where(eq(connections.srcIp, opts.srcIp));
	return base;
}

export interface TrendBucket {
	bucket: string;
	total: number;
	status: number;
	login: number;
}

/** Hourly connection counts over the last `hours`, split by intent — the trends chart's data. */
export async function getTrends(db: Db, hours: number): Promise<TrendBucket[]> {
	const since = new Date(Date.now() - hours * 3_600_000);
	const bucket = sql<string>`date_trunc('hour', ${connections.receivedAt})`;
	const rows = await db
		.select({
			bucket,
			total: count(),
			status: sql<number>`count(*) filter (where ${connections.intent} = 'status')`,
			login: sql<number>`count(*) filter (where ${connections.intent} = 'login')`,
		})
		.from(connections)
		.where(gte(connections.receivedAt, since))
		.groupBy(bucket)
		.orderBy(bucket);
	return rows.map((r) => ({
		bucket: new Date(r.bucket).toISOString(),
		total: Number(r.total),
		status: Number(r.status),
		login: Number(r.login),
	}));
}

export interface Offender {
	srcIp: string | null;
	hits: number;
	logins: number;
	daemonsHit: number;
	rawHostnameHits: number;
	abnormalProtoHits: number;
	distinctUsernames: number;
	lastSeen: Date;
	score: number;
	classification: Classification;
	countryCode: string | null;
	asOrg: string | null;
}

/**
 * Top source IPs over the window with a scanner classification. `since` defaults to a rolling window;
 * pass a UTC day boundary for the "daily rotating" offenders list. Classification signals are computed
 * in one aggregation pass (raw-IP hostname, abnormal protocol, distinct usernames) and scored in JS.
 */
export async function getOffenders(db: Db, windowHours: number, limit: number): Promise<Offender[]> {
	const since = new Date(Date.now() - windowHours * 3_600_000);
	// A raw-IP hostname means the client connected by IP literal, not a domain — a scanner tell.
	const rawHostnameHits = sql<number>`count(*) filter (where ${connections.serverAddress} ~ '^[0-9]{1,3}(\\.[0-9]{1,3}){3}$' or ${connections.serverAddress} ~ ':')`;
	const rows = await db
		.select({
			srcIp: connections.srcIp,
			hits: count(),
			logins: sql<number>`count(*) filter (where ${connections.intent} = 'login')`,
			daemonsHit: countDistinct(connections.daemonId),
			lastSeen: sql<Date>`max(${connections.receivedAt})`,
			rawHostnameHits,
			abnormalProtoHits: sql<number>`count(*) filter (where ${connections.protocolVersion} is null or ${connections.protocolVersion} <= 0)`,
			distinctUsernames: sql<number>`count(distinct ${connections.username})`,
			// Functionally dependent on the grouped src_ip; max() is just the cheap way to select it.
			countryCode: sql<string | null>`max(${connections.countryCode})`,
			asOrg: sql<string | null>`max(${connections.asOrg})`,
		})
		.from(connections)
		.where(gte(connections.receivedAt, since))
		.groupBy(connections.srcIp)
		.orderBy(desc(count()))
		.limit(Math.min(limit, 500));

	return rows.map((r) => {
		const signals = {
			hits: Number(r.hits),
			logins: Number(r.logins),
			daemonsHit: Number(r.daemonsHit),
			rawHostnameHits: Number(r.rawHostnameHits),
			abnormalProtoHits: Number(r.abnormalProtoHits),
			distinctUsernames: Number(r.distinctUsernames),
		};
		const { score, label } = classify(signals);
		return {
			srcIp: r.srcIp,
			...signals,
			lastSeen: new Date(r.lastSeen),
			score,
			classification: label,
			countryCode: r.countryCode,
			asOrg: r.asOrg,
		};
	});
}

export interface Stats {
	windowMinutes: number;
	total: number;
	uniqueIps: number;
	statusCount: number;
	loginCount: number;
	hitsPerMinute: number;
}

/** Rolling-window aggregates for the Overview page. "hit rate" = connections/min over the window. */
export async function getStats(db: Db, windowMinutes: number): Promise<Stats> {
	const since = new Date(Date.now() - windowMinutes * 60_000);
	const byIntent = await db
		.select({ intent: connections.intent, c: count() })
		.from(connections)
		.where(gte(connections.receivedAt, since))
		.groupBy(connections.intent);

	const [uniq] = await db
		.select({ u: countDistinct(connections.srcIp) })
		.from(connections)
		.where(gte(connections.receivedAt, since));

	const total = byIntent.reduce((sum, r) => sum + Number(r.c), 0);
	const statusCount = Number(byIntent.find((r) => r.intent === "status")?.c ?? 0);
	const loginCount = Number(byIntent.find((r) => r.intent === "login")?.c ?? 0);

	return {
		windowMinutes,
		total,
		uniqueIps: Number(uniq?.u ?? 0),
		statusCount,
		loginCount,
		hitsPerMinute: windowMinutes > 0 ? total / windowMinutes : 0,
	};
}
