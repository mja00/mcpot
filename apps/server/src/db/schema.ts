import { boolean, date, index, inet, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { DaemonSettings, Persona } from "@mcpot/shared";

/** One row per enrolled honeypot. API keys stored hashed; machine_id makes re-enrollment idempotent. */
export const daemons = pgTable("daemons", {
	id: uuid("id").primaryKey().defaultRandom(),
	machineId: text("machine_id").notNull().unique(),
	hostname: text("hostname"),
	apiKeyHash: text("api_key_hash").notNull(),
	apiKeyPrefix: text("api_key_prefix").notNull(),
	revoked: boolean("revoked").notNull().default(false),
	persona: jsonb("persona").$type<Persona>().notNull(),
	settings: jsonb("settings").$type<DaemonSettings>().notNull(),
	configRevision: integer("config_revision").notNull().default(1),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
	lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
	queueDepth: integer("queue_depth"),
	uptimeSeconds: integer("uptime_seconds"),
});

/** Bootstrap tokens a daemon trades for its identity. Hashed, optionally single-use and expiring. */
export const enrollmentTokens = pgTable("enrollment_tokens", {
	id: uuid("id").primaryKey().defaultRandom(),
	tokenHash: text("token_hash").notNull().unique(),
	label: text("label"),
	singleUse: boolean("single_use").notNull().default(true),
	expiresAt: timestamp("expires_at", { withTimezone: true }),
	usedAt: timestamp("used_at", { withTimezone: true }),
	usedByDaemon: uuid("used_by_daemon").references(() => daemons.id),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Raw connection events. event_id is the client-generated PK, so retried ingest batches dedupe via
 * onConflictDoNothing. received_at is server-authoritative (daemon clocks drift). Time-based range
 * partitioning + retention is deferred to M6 (Drizzle can't express declarative partitioning).
 */
export const connections = pgTable(
	"connections",
	{
		eventId: uuid("event_id").primaryKey(),
		daemonId: uuid("daemon_id")
			.notNull()
			.references(() => daemons.id),
		receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
		observedAt: timestamp("observed_at", { withTimezone: true }),
		srcIp: inet("src_ip"),
		srcPort: integer("src_port"),
		protocolVersion: integer("protocol_version"),
		serverAddress: text("server_address"),
		serverPort: integer("server_port"),
		intent: text("intent").notNull(),
		pingCompleted: boolean("ping_completed").notNull().default(false),
		username: text("username"),
		playerUuid: text("player_uuid"),
		fingerprint: text("fingerprint"),
		// GeoLite2 enrichment at ingest time; null when the mmdb files aren't mounted (dev/CI).
		countryCode: text("country_code"),
		asn: integer("asn"),
		asOrg: text("as_org"),
	},
	(t) => [
		index("connections_received_at").on(t.receivedAt.desc()),
		index("connections_daemon_ts").on(t.daemonId, t.receivedAt.desc()),
		index("connections_srcip_ts").on(t.srcIp, t.receivedAt.desc()),
		index("connections_intent_ts").on(t.intent, t.receivedAt.desc()),
	],
);

/** One AbuseIPDB reservation per source IP and UTC day; failed attempts remain auditable and consume quota. */
export const abuseReports = pgTable(
	"abuse_reports",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		srcIp: inet("src_ip").notNull(),
		reportDay: date("report_day", { mode: "string" }).notNull(),
		trigger: text("trigger").notNull(),
		status: text("status").notNull().default("reserved"),
		reservedAt: timestamp("reserved_at", { withTimezone: true }).notNull().defaultNow(),
		completedAt: timestamp("completed_at", { withTimezone: true }),
		httpStatus: integer("http_status"),
		error: text("error"),
	},
	(t) => [uniqueIndex("abuse_reports_src_ip_day").on(t.srcIp, t.reportDay), index("abuse_reports_day").on(t.reportDay)],
);

/** Daily application-side budget for AbuseIPDB /report attempts. */
export const abuseipdbDailyUsage = pgTable("abuseipdb_daily_usage", {
	reportDay: date("report_day", { mode: "string" }).primaryKey(),
	reportCount: integer("report_count").notNull().default(0),
});
