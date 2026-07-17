import { and, asc, count, countDistinct, desc, eq, gte, inArray, isNotNull, lt, ne, type SQL, sql } from "drizzle-orm";
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
import { abuseipdbChecks, connections, daemons } from "./schema.ts";
import { sanitizeString, toInetOrNull } from "../sanitize.ts";
import { type Classification, type OffenderSignals, type ScoreTermOp, classify, SCORE_TERMS } from "../classify.ts";
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
			droppedCount: e.droppedCount ?? null,
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
	anomalyHits: number;
	incompletePingHits: number;
	distinctAddresses: number;
	distinctProtocols: number;
	rateLimitedDrops: number;
	lastSeen: Date;
	score: number;
	classification: Classification;
	countryCode: string | null;
	asOrg: string | null;
	abuseCheck: {
		status: "pending" | "succeeded" | "failed";
		checkedAt: Date | null;
		isPublic: boolean | null;
		isWhitelisted: boolean | null;
		abuseConfidenceScore: number | null;
		countryCode: string | null;
		usageType: string | null;
		isp: string | null;
		domain: string | null;
		isTor: boolean | null;
		totalReports: number | null;
		numDistinctUsers: number | null;
		lastReportedAt: Date | null;
	} | null;
}

/**
 * One SQL aggregate per OffenderSignals field, defined once so getOffenderSignals and getOffenders
 * can't diverge. Synthetic `rate_limited` rows only feed rateLimitedDrops — they're excluded from the
 * anomaly/protocol tells so a flood isn't double-counted.
 */
function offenderSignalExprs(): Record<keyof OffenderSignals, SQL<number>> {
	return {
		hits: sql<number>`count(*)`,
		logins: sql<number>`count(*) filter (where ${connections.intent} = 'login')`,
		daemonsHit: sql<number>`count(distinct ${connections.daemonId})`,
		// Raw IPv4 literal, or an IPv6 literal (hex/colons only) — a domain never matches either.
		rawHostnameHits: sql<number>`count(*) filter (where ${connections.serverAddress} ~ '^[0-9]{1,3}(\\.[0-9]{1,3}){3}$' or (${connections.serverAddress} ~* '^[0-9a-f:]+$' and ${connections.serverAddress} like '%:%'))`,
		abnormalProtoHits: sql<number>`count(*) filter (where (${connections.protocolVersion} is null or ${connections.protocolVersion} <= 0) and ${connections.fingerprint} is distinct from 'rate_limited')`,
		distinctUsernames: sql<number>`count(distinct ${connections.username})`,
		anomalyHits: sql<number>`count(*) filter (where ${connections.fingerprint} is not null and ${connections.fingerprint} not like 'rate_limited%')`,
		incompletePingHits: sql<number>`count(*) filter (where ${connections.intent} = 'status' and not ${connections.pingCompleted})`,
		distinctAddresses: sql<number>`count(distinct nullif(${connections.serverAddress}, ''))`,
		distinctProtocols: sql<number>`count(distinct ${connections.protocolVersion}) filter (where ${connections.protocolVersion} > 0)`,
		rateLimitedDrops: sql<number>`coalesce(sum(${connections.droppedCount}) filter (where ${connections.fingerprint} = 'rate_limited'), 0)`,
	};
}

/**
 * ORDER BY-able score, generated from SCORE_TERMS so the DB ordering always matches classify().
 * Grouped rows always have count(*) >= 1, so the ratio division is safe.
 */
function offenderScoreExpr(exprs: Record<keyof OffenderSignals, SQL<number>>): SQL<number> {
	const ops: Record<ScoreTermOp, SQL> = { gt: sql`>`, gte: sql`>=`, eq: sql`=` };
	const cases = SCORE_TERMS.map((term) => {
		const value = term.signal === "rawHostnameRatio" ? sql`(${exprs.rawHostnameHits})::float / count(*)` : exprs[term.signal];
		return sql`(case when ${value} ${ops[term.op]} ${term.threshold} then ${term.weight} else 0 end)`;
	});
	return sql<number>`least(100, ${sql.join(cases, sql` + `)})`;
}

function toOffenderSignals(row: Partial<Record<keyof OffenderSignals, unknown>> | undefined): OffenderSignals {
	return {
		hits: Number(row?.hits ?? 0),
		logins: Number(row?.logins ?? 0),
		daemonsHit: Number(row?.daemonsHit ?? 0),
		rawHostnameHits: Number(row?.rawHostnameHits ?? 0),
		abnormalProtoHits: Number(row?.abnormalProtoHits ?? 0),
		distinctUsernames: Number(row?.distinctUsernames ?? 0),
		anomalyHits: Number(row?.anomalyHits ?? 0),
		incompletePingHits: Number(row?.incompletePingHits ?? 0),
		distinctAddresses: Number(row?.distinctAddresses ?? 0),
		distinctProtocols: Number(row?.distinctProtocols ?? 0),
		rateLimitedDrops: Number(row?.rateLimitedDrops ?? 0),
	};
}

export async function getOffenderSignals(db: Db, srcIp: string, windowHours: number): Promise<OffenderSignals> {
	const since = new Date(Date.now() - windowHours * 3_600_000);
	const [row] = await db
		.select(offenderSignalExprs())
		.from(connections)
		.where(and(gte(connections.receivedAt, since), eq(connections.srcIp, srcIp)));
	return toOffenderSignals(row);
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
 * computed in one aggregation pass and scored in JS; the ORDER BY score expression is generated from
 * the same SCORE_TERMS table classify() uses. `total` counts all groups pre-LIMIT.
 */
export async function getOffenders(db: Db, opts: OffendersOpts): Promise<OffendersPage> {
	const since = new Date(Date.now() - opts.windowHours * 3_600_000);
	const exprs = offenderSignalExprs();
	const lastSeen = sql<Date>`max(${connections.receivedAt})`;
	const scoreExpr = offenderScoreExpr(exprs);

	const sortExpr = { lastSeen, hits: exprs.hits, logins: exprs.logins, daemonsHit: exprs.daemonsHit, score: scoreExpr }[opts.sortBy];
	const dir = opts.order === "asc" ? asc : desc;
	const rows = await db
		.select({
			...exprs,
			srcIp: connections.srcIp,
			lastSeen,
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
	const ips = rows.flatMap((row) => (row.srcIp ? [row.srcIp] : []));
	const abuseChecks = ips.length
		? await db
				.select({
					srcIp: abuseipdbChecks.srcIp,
					status: abuseipdbChecks.status,
					checkedAt: abuseipdbChecks.checkedAt,
					isPublic: abuseipdbChecks.isPublic,
					isWhitelisted: abuseipdbChecks.isWhitelisted,
					abuseConfidenceScore: abuseipdbChecks.abuseConfidenceScore,
					countryCode: abuseipdbChecks.countryCode,
					usageType: abuseipdbChecks.usageType,
					isp: abuseipdbChecks.isp,
					domain: abuseipdbChecks.domain,
					isTor: abuseipdbChecks.isTor,
					totalReports: abuseipdbChecks.totalReports,
					numDistinctUsers: abuseipdbChecks.numDistinctUsers,
					lastReportedAt: abuseipdbChecks.lastReportedAt,
				})
				.from(abuseipdbChecks)
				.where(inArray(abuseipdbChecks.srcIp, ips))
		: [];
	const abuseChecksByIp = new Map(abuseChecks.map(({ srcIp, ...rest }) => [srcIp, rest]));
	const mapped = rows.map((r) => {
		const signals = toOffenderSignals(r);
		const { score, label } = classify(signals);
		const check = r.srcIp ? abuseChecksByIp.get(r.srcIp) : undefined;
		return {
			srcIp: r.srcIp,
			...signals,
			lastSeen: new Date(r.lastSeen),
			score,
			classification: label,
			countryCode: r.countryCode,
			asOrg: r.asOrg,
			abuseCheck: check ? { ...check, status: check.status as "pending" | "succeeded" | "failed" } : null,
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
