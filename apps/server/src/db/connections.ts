import { and, asc, count, countDistinct, desc, eq, gte, isNotNull, lt, ne, sql } from "drizzle-orm";
import type {
	ConnectionEvent,
	OffenderSortBy,
	OverviewResponse,
	SortOrder,
	StreamConnection,
	TrendSummary,
	TrendsResponse,
} from "@mcpot/shared";
import type { Db } from "./client.ts";
import { connections, daemons } from "./schema.ts";
import { sanitizeString, toInetOrNull } from "../sanitize.ts";
import { type Classification, classify, RAW_HOSTNAME_RATIO, SCORE_WEIGHTS, USERNAME_SPRAY_MIN } from "../classify.ts";
import type { GeoService } from "../geo.ts";

export interface IngestResult {
	accepted: number;
	duplicates: number;
	/** Only the newly stored (non-duplicate) rows, with server-authoritative timestamps — SSE feed. */
	inserted: StreamConnection[];
}

/**
 * Store a batch idempotently. event_id is the PK, so onConflictDoNothing makes retried batches safe.
 * We also dedupe within the batch first (a single INSERT can't reference the same conflict key twice)
 * and sanitize attacker-controlled strings. received_at defaults to server time (daemon clocks drift).
 * Geo enrichment happens here (not on read) so historic rows keep the geo of when they were seen.
 */
export async function ingestEvents(
	db: Db,
	geo: GeoService,
	daemonId: string,
	daemonHostname: string | null,
	events: ConnectionEvent[],
): Promise<IngestResult> {
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
	if (rows.length === 0) return { accepted: 0, duplicates: events.length, inserted: [] };

	const inserted = await db.insert(connections).values(rows).onConflictDoNothing({ target: connections.eventId }).returning();

	return {
		accepted: inserted.length,
		duplicates: events.length - inserted.length,
		inserted: inserted.map((r) => ({
			eventId: r.eventId,
			daemonId: r.daemonId,
			daemonHostname,
			receivedAt: r.receivedAt.toISOString(),
			srcIp: r.srcIp,
			protocolVersion: r.protocolVersion,
			serverAddress: r.serverAddress,
			intent: r.intent,
			username: r.username,
			countryCode: r.countryCode,
			asn: r.asn,
			asOrg: r.asOrg,
		})),
	};
}

export interface RecentConnection {
	eventId: string;
	daemonId: string;
	daemonHostname: string | null;
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
			daemonHostname: daemons.hostname,
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
		.innerJoin(daemons, eq(connections.daemonId, daemons.id))
		.orderBy(desc(connections.receivedAt))
		.limit(Math.min(opts.limit, 1000));
	if (opts.daemonId && opts.srcIp) {
		return base.where(and(eq(connections.daemonId, opts.daemonId), eq(connections.srcIp, opts.srcIp)));
	}
	if (opts.daemonId) return base.where(eq(connections.daemonId, opts.daemonId));
	if (opts.srcIp) return base.where(eq(connections.srcIp, opts.srcIp));
	return base;
}

function trendBucketMinutes(hours: number): number {
	if (hours <= 6) return 15;
	if (hours <= 24) return 60;
	if (hours <= 168) return 360;
	return 1440;
}

async function getTrendSummary(db: Db, from: Date, to: Date): Promise<TrendSummary> {
	const [row] = await db
		.select({
			total: count(),
			uniqueIps: countDistinct(connections.srcIp),
			loginCount: sql<number>`count(*) filter (where ${connections.intent} = 'login')`,
			activeDaemons: countDistinct(connections.daemonId),
		})
		.from(connections)
		.where(and(gte(connections.receivedAt, from), lt(connections.receivedAt, to)));
	return {
		total: Number(row?.total ?? 0),
		uniqueIps: Number(row?.uniqueIps ?? 0),
		loginCount: Number(row?.loginCount ?? 0),
		activeDaemons: Number(row?.activeDaemons ?? 0),
	};
}

/** Range-aligned aggregates for all three Trends tabs. */
export async function getTrends(db: Db, hours: number): Promise<TrendsResponse> {
	const to = new Date();
	const durationMs = hours * 3_600_000;
	const from = new Date(to.getTime() - durationMs);
	const previousFrom = new Date(from.getTime() - durationMs);
	const bucketMinutes = trendBucketMinutes(hours);
	const bucketMs = bucketMinutes * 60_000;
	const bucket = sql<string>`date_bin(${sql.raw(`make_interval(mins => ${bucketMinutes})`)}, ${connections.receivedAt}, 'epoch')`;
	const currentWindow = and(gte(connections.receivedAt, from), lt(connections.receivedAt, to));

	const [current, previous, seriesRows, countryRows, networkRows, addressRows, usernameRows, daemonRows, roster, daemonSeriesRows] =
		await Promise.all([
			getTrendSummary(db, from, to),
			getTrendSummary(db, previousFrom, from),
			db
				.select({
					bucket,
					total: count(),
					uniqueIps: countDistinct(connections.srcIp),
					status: sql<number>`count(*) filter (where ${connections.intent} = 'status')`,
					login: sql<number>`count(*) filter (where ${connections.intent} = 'login')`,
				})
				.from(connections)
				.where(currentWindow)
				.groupBy(bucket)
				.orderBy(bucket),
			db
				.select({ countryCode: connections.countryCode, hits: count(), uniqueIps: countDistinct(connections.srcIp) })
				.from(connections)
				.where(currentWindow)
				.groupBy(connections.countryCode)
				.orderBy(desc(count()))
				.limit(10),
			db
				.select({ asn: connections.asn, asOrg: connections.asOrg, hits: count(), uniqueIps: countDistinct(connections.srcIp) })
				.from(connections)
				.where(currentWindow)
				.groupBy(connections.asn, connections.asOrg)
				.orderBy(desc(count()))
				.limit(10),
			db
				.select({ serverAddress: connections.serverAddress, hits: count() })
				.from(connections)
				.where(and(currentWindow, isNotNull(connections.serverAddress), ne(connections.serverAddress, "")))
				.groupBy(connections.serverAddress)
				.orderBy(desc(count()))
				.limit(10),
			db
				.select({ username: connections.username, hits: count() })
				.from(connections)
				.where(and(currentWindow, eq(connections.intent, "login"), isNotNull(connections.username)))
				.groupBy(connections.username)
				.orderBy(desc(count()))
				.limit(10),
			db
				.select({
					daemonId: connections.daemonId,
					hits: count(),
					uniqueIps: countDistinct(connections.srcIp),
					loginCount: sql<number>`count(*) filter (where ${connections.intent} = 'login')`,
				})
				.from(connections)
				.where(currentWindow)
				.groupBy(connections.daemonId),
			db
				.select({
					daemonId: daemons.id,
					daemonHostname: daemons.hostname,
					revoked: daemons.revoked,
					lastSeenAt: daemons.lastSeenAt,
					queueDepth: daemons.queueDepth,
				})
				.from(daemons),
			db
				.select({ bucket, daemonId: connections.daemonId, total: count() })
				.from(connections)
				.where(currentWindow)
				.groupBy(bucket, connections.daemonId)
				.orderBy(bucket),
		]);

	const byDaemon = new Map(daemonRows.map((row) => [row.daemonId, row]));
	const daemonRollups = roster
		.map((daemon) => {
			const activity = byDaemon.get(daemon.daemonId);
			const hits = Number(activity?.hits ?? 0);
			return {
				...daemon,
				lastSeenAt: daemon.lastSeenAt?.toISOString() ?? null,
				hits,
				share: current.total > 0 ? hits / current.total : 0,
				uniqueIps: Number(activity?.uniqueIps ?? 0),
				loginCount: Number(activity?.loginCount ?? 0),
			};
		})
		.sort((a, b) => b.hits - a.hits || (a.daemonHostname ?? a.daemonId).localeCompare(b.daemonHostname ?? b.daemonId));
	const topDaemonIds = new Set(daemonRollups.filter((daemon) => daemon.hits > 0).slice(0, 8).map((daemon) => daemon.daemonId));
	const seriesByBucket = new Map(seriesRows.map((row) => [new Date(row.bucket).getTime(), row]));
	const daemonByBucket = new Map<number, Map<string, number>>();
	for (const row of daemonSeriesRows) {
		const bucketTime = new Date(row.bucket).getTime();
		const counts = daemonByBucket.get(bucketTime) ?? new Map<string, number>();
		counts.set(row.daemonId, Number(row.total));
		daemonByBucket.set(bucketTime, counts);
	}

	const series = [];
	const daemonBuckets = [];
	const firstBucket = Math.floor(from.getTime() / bucketMs) * bucketMs;
	for (let time = firstBucket; time < to.getTime(); time += bucketMs) {
		const row = seriesByBucket.get(time);
		const total = Number(row?.total ?? 0);
		const status = Number(row?.status ?? 0);
		const login = Number(row?.login ?? 0);
		const bucketIso = new Date(time).toISOString();
		series.push({ bucket: bucketIso, total, uniqueIps: Number(row?.uniqueIps ?? 0), status, login, other: total - status - login });
		const daemonCounts = daemonByBucket.get(time) ?? new Map<string, number>();
		const counts: Record<string, number> = {};
		let other = 0;
		for (const [daemonId, hits] of daemonCounts) {
			if (topDaemonIds.has(daemonId)) counts[daemonId] = hits;
			else other += hits;
		}
		daemonBuckets.push({ bucket: bucketIso, counts, other });
	}

	return {
		range: { hours, bucketMinutes, from: from.toISOString(), to: to.toISOString() },
		summary: { current, previous },
		series,
		countries: countryRows.map((row) => ({ countryCode: row.countryCode, hits: Number(row.hits), uniqueIps: Number(row.uniqueIps) })),
		networks: networkRows.map((row) => ({
			asn: row.asn,
			asOrg: row.asOrg,
			hits: Number(row.hits),
			uniqueIps: Number(row.uniqueIps),
		})),
		serverAddresses: addressRows.map((row) => ({ serverAddress: row.serverAddress!, hits: Number(row.hits) })),
		usernames: usernameRows.map((row) => ({ username: row.username!, hits: Number(row.hits) })),
		daemons: daemonRollups,
		daemonSeries: {
			daemons: daemonRollups
				.filter((daemon) => topDaemonIds.has(daemon.daemonId))
				.map((daemon) => ({ daemonId: daemon.daemonId, daemonHostname: daemon.daemonHostname })),
			buckets: daemonBuckets,
		},
	};
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

export interface OffendersPage {
	rows: Offender[];
	total: number;
}

export interface OffendersOpts {
	windowHours: number;
	limit: number;
	offset: number;
	sortBy: OffenderSortBy;
	order: SortOrder;
}

/**
 * One sorted page of source IPs over a rolling window, with a scanner classification. Signals are
 * computed in one aggregation pass and scored in JS; a SQL mirror of classify() (same constants)
 * exists only so `score` is orderable at the DB layer. `total` counts all groups pre-LIMIT.
 */
export async function getOffenders(db: Db, opts: OffendersOpts): Promise<OffendersPage> {
	const since = new Date(Date.now() - opts.windowHours * 3_600_000);
	const hits = count();
	const logins = sql<number>`count(*) filter (where ${connections.intent} = 'login')`;
	const daemonsHit = countDistinct(connections.daemonId);
	const lastSeen = sql<Date>`max(${connections.receivedAt})`;
	// A raw-IP hostname means the client connected by IP literal, not a domain — a scanner tell.
	const rawHostnameHits = sql<number>`count(*) filter (where ${connections.serverAddress} ~ '^[0-9]{1,3}(\\.[0-9]{1,3}){3}$' or ${connections.serverAddress} ~ ':')`;
	const abnormalProtoHits = sql<number>`count(*) filter (where ${connections.protocolVersion} is null or ${connections.protocolVersion} <= 0)`;
	const distinctUsernames = sql<number>`count(distinct ${connections.username})`;
	// SQL mirror of classify() for ORDER BY only; grouped rows always have count(*) >= 1, so the division is safe.
	const scoreExpr = sql<number>`least(100,
		(case when (${rawHostnameHits})::float / count(*) > ${RAW_HOSTNAME_RATIO} then ${SCORE_WEIGHTS.rawHostname} else 0 end)
		+ (case when ${daemonsHit} > 1 then ${SCORE_WEIGHTS.multiDaemon} else 0 end)
		+ (case when ${abnormalProtoHits} > 0 then ${SCORE_WEIGHTS.abnormalProto} else 0 end)
		+ (case when ${logins} = 0 then ${SCORE_WEIGHTS.reconOnly} else 0 end)
		+ (case when ${distinctUsernames} >= ${USERNAME_SPRAY_MIN} then ${SCORE_WEIGHTS.usernameSpray} else 0 end))`;

	const sortExpr = { lastSeen, hits, logins, daemonsHit, score: scoreExpr }[opts.sortBy];
	const dir = opts.order === "asc" ? asc : desc;
	const rows = await db
		.select({
			srcIp: connections.srcIp,
			hits,
			logins,
			daemonsHit,
			lastSeen,
			rawHostnameHits,
			abnormalProtoHits,
			distinctUsernames,
			// Functionally dependent on the grouped src_ip; max() is just the cheap way to select it.
			countryCode: sql<string | null>`max(${connections.countryCode})`,
			asOrg: sql<string | null>`max(${connections.asOrg})`,
			// Group count pre-LIMIT so the client can render page controls without a second query.
			total: sql<number>`count(*) over ()`,
		})
		.from(connections)
		.where(gte(connections.receivedAt, since))
		.groupBy(connections.srcIp)
		// Tiebreakers keep pages stable when the chosen sort key has duplicates (src_ip is unique per group).
		.orderBy(dir(sortExpr), desc(lastSeen), asc(connections.srcIp))
		.limit(Math.min(opts.limit, 500))
		.offset(opts.offset);

	const total = Number(rows[0]?.total ?? 0);
	const mapped = rows.map((r) => {
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
	return { rows: mapped, total };
}

export interface Stats {
	windowMinutes: number;
	total: number;
	uniqueIps: number;
	statusCount: number;
	loginCount: number;
	hitsPerMinute: number;
}

/**
 * Everything the Overview page needs in one round trip: stats, per-intent counts, top targeted
 * hostnames, top tried usernames, and a small time series for sparklines. Bucket width scales with
 * the window (date_bin, Postgres 17) so the series stays at ~60 points regardless of window size.
 */
export async function getOverview(db: Db, windowMinutes: number, topLimit: number): Promise<OverviewResponse> {
	const since = new Date(Date.now() - windowMinutes * 60_000);
	const bucketMinutes = Math.max(1, Math.ceil(windowMinutes / 60));
	// Inlined (not bound) so the SELECT and GROUP BY expressions parse identically; it's a
	// server-computed integer, never user input.
	const bucket = sql<string>`date_bin(${sql.raw(`make_interval(mins => ${bucketMinutes})`)}, ${connections.receivedAt}, 'epoch')`;

	const [stats, intents, topServerAddresses, topUsernames, series, daemonActivity] = await Promise.all([
		getStats(db, windowMinutes),
		db
			.select({ intent: connections.intent, count: count() })
			.from(connections)
			.where(gte(connections.receivedAt, since))
			.groupBy(connections.intent)
			.orderBy(desc(count())),
		db
			.select({ serverAddress: connections.serverAddress, hits: count() })
			.from(connections)
			.where(and(gte(connections.receivedAt, since), isNotNull(connections.serverAddress), ne(connections.serverAddress, "")))
			.groupBy(connections.serverAddress)
			.orderBy(desc(count()))
			.limit(topLimit),
		db
			.select({ username: connections.username, hits: count() })
			.from(connections)
			.where(and(gte(connections.receivedAt, since), eq(connections.intent, "login"), isNotNull(connections.username)))
			.groupBy(connections.username)
			.orderBy(desc(count()))
			.limit(topLimit),
		db
			.select({ bucket, total: count() })
			.from(connections)
			.where(gte(connections.receivedAt, since))
			.groupBy(bucket)
			.orderBy(bucket),
		db
			.select({ daemonId: connections.daemonId, hits: count() })
			.from(connections)
			.where(gte(connections.receivedAt, since))
			.groupBy(connections.daemonId)
			.orderBy(desc(count())),
	]);

	return {
		stats,
		intents: intents.map((r) => ({ intent: r.intent, count: Number(r.count) })),
		topServerAddresses: topServerAddresses.map((r) => ({ serverAddress: r.serverAddress!, hits: Number(r.hits) })),
		topUsernames: topUsernames.map((r) => ({ username: r.username!, hits: Number(r.hits) })),
		series: series.map((r) => ({ bucket: new Date(r.bucket).toISOString(), total: Number(r.total) })),
		daemonActivity: daemonActivity.map((r) => ({ daemonId: r.daemonId, hits: Number(r.hits) })),
		bucketMinutes,
	};
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
