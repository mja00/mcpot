import { z } from "zod";

/**
 * Dashboard (web ↔ server) wire contracts. Timestamps are ISO strings on the wire — the server's db
 * layer returns Dates that JSON-serialize into these shapes, and the web app imports the types only.
 */

export const Stats = z.object({
	windowMinutes: z.number().int(),
	total: z.number().int(),
	uniqueIps: z.number().int(),
	statusCount: z.number().int(),
	loginCount: z.number().int(),
	hitsPerMinute: z.number(),
});
export type Stats = z.infer<typeof Stats>;

export const TrendBucket = z.object({
	bucket: z.string(),
	total: z.number().int(),
	uniqueIps: z.number().int(),
	status: z.number().int(),
	login: z.number().int(),
	other: z.number().int(),
});
export type TrendBucket = z.infer<typeof TrendBucket>;

export const TrendSummary = z.object({
	total: z.number().int(),
	uniqueIps: z.number().int(),
	loginCount: z.number().int(),
	activeDaemons: z.number().int(),
});
export type TrendSummary = z.infer<typeof TrendSummary>;

export const TrendsResponse = z.object({
	range: z.object({
		hours: z.number().int(),
		bucketMinutes: z.number().int(),
		from: z.string(),
		to: z.string(),
	}),
	summary: z.object({ current: TrendSummary, previous: TrendSummary }),
	series: z.array(TrendBucket),
	countries: z.array(
		z.object({ countryCode: z.string().nullable(), hits: z.number().int(), uniqueIps: z.number().int() }),
	),
	networks: z.array(
		z.object({ asn: z.number().int().nullable(), asOrg: z.string().nullable(), hits: z.number().int(), uniqueIps: z.number().int() }),
	),
	serverAddresses: z.array(z.object({ serverAddress: z.string(), hits: z.number().int() })),
	usernames: z.array(z.object({ username: z.string(), hits: z.number().int() })),
	daemons: z.array(
		z.object({
			daemonId: z.string().uuid(),
			daemonHostname: z.string().nullable(),
			hits: z.number().int(),
			share: z.number(),
			uniqueIps: z.number().int(),
			loginCount: z.number().int(),
			revoked: z.boolean(),
			lastSeenAt: z.string().nullable(),
			queueDepth: z.number().int().nullable(),
		}),
	),
	daemonSeries: z.object({
		daemons: z.array(z.object({ daemonId: z.string().uuid(), daemonHostname: z.string().nullable() })),
		buckets: z.array(z.object({ bucket: z.string(), counts: z.record(z.string(), z.number().int()), other: z.number().int() })),
	}),
});
export type TrendsResponse = z.infer<typeof TrendsResponse>;

export const RecentConnection = z.object({
	eventId: z.string().uuid(),
	daemonId: z.string().uuid(),
	daemonHostname: z.string().nullable(),
	receivedAt: z.string(),
	srcIp: z.string().nullable(),
	protocolVersion: z.number().int().nullable(),
	serverAddress: z.string().nullable(),
	intent: z.string(),
	username: z.string().nullable(),
	countryCode: z.string().nullable(),
	asn: z.number().int().nullable(),
	asOrg: z.string().nullable(),
});
export type RecentConnection = z.infer<typeof RecentConnection>;

export const DaemonListItem = z.object({
	id: z.string().uuid(),
	hostname: z.string().nullable(),
	versionName: z.string(),
	revoked: z.boolean(),
	lastSeenAt: z.string().nullable(),
	queueDepth: z.number().int().nullable(),
	createdAt: z.string(),
});
export type DaemonListItem = z.infer<typeof DaemonListItem>;

export const OffenderClassification = z.enum(["scanner", "suspicious", "prober"]);
export type OffenderClassification = z.infer<typeof OffenderClassification>;

export const OffenderSortBy = z.enum(["lastSeen", "hits", "logins", "daemonsHit", "score"]);
export type OffenderSortBy = z.infer<typeof OffenderSortBy>;

export const SortOrder = z.enum(["asc", "desc"]);
export type SortOrder = z.infer<typeof SortOrder>;

export const Offender = z.object({
	srcIp: z.string().nullable(),
	hits: z.number().int(),
	logins: z.number().int(),
	daemonsHit: z.number().int(),
	rawHostnameHits: z.number().int(),
	abnormalProtoHits: z.number().int(),
	distinctUsernames: z.number().int(),
	lastSeen: z.string(),
	score: z.number(),
	classification: OffenderClassification,
	countryCode: z.string().nullable(),
	asOrg: z.string().nullable(),
});
export type Offender = z.infer<typeof Offender>;

/** GET /v1/offenders — one page of offenders plus the total group count for page controls. */
export const OffendersResponse = z.object({
	rows: z.array(Offender),
	total: z.number().int(),
});
export type OffendersResponse = z.infer<typeof OffendersResponse>;

/** GET /v1/overview — everything the Overview page needs in one call. */
export const OverviewResponse = z.object({
	stats: Stats,
	intents: z.array(z.object({ intent: z.string(), count: z.number().int() })),
	topServerAddresses: z.array(z.object({ serverAddress: z.string(), hits: z.number().int() })),
	topUsernames: z.array(z.object({ username: z.string(), hits: z.number().int() })),
	series: z.array(z.object({ bucket: z.string(), total: z.number().int() })),
	daemonActivity: z.array(z.object({ daemonId: z.string().uuid(), hits: z.number().int() })),
	/** Width of each series bucket so the client can label sparklines correctly. */
	bucketMinutes: z.number().int(),
});
export type OverviewResponse = z.infer<typeof OverviewResponse>;

/** SSE `event: connection` payload — same row shape the /v1/connections list returns. */
export const StreamConnection = RecentConnection;
export type StreamConnection = z.infer<typeof StreamConnection>;

/** SSE `event: daemon` payload — pushed on every daemon heartbeat. */
export const StreamDaemonStatus = z.object({
	daemonId: z.string().uuid(),
	hostname: z.string().nullable(),
	lastSeenAt: z.string().nullable(),
	queueDepth: z.number().int().nullable(),
});
export type StreamDaemonStatus = z.infer<typeof StreamDaemonStatus>;

export const LoginResponse = z.object({
	token: z.string(),
	expiresIn: z.number().int(),
});
export type LoginResponse = z.infer<typeof LoginResponse>;

export const CreateTokenResponse = z.object({ token: z.string() });
export type CreateTokenResponse = z.infer<typeof CreateTokenResponse>;

export const ReportResponse = z.object({
	reported: z.boolean(),
	sinks: z.array(z.string()),
});
export type ReportResponse = z.infer<typeof ReportResponse>;
