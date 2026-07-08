import { boolean, index, inet, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
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
	},
	(t) => [
		index("connections_daemon_ts").on(t.daemonId, t.receivedAt.desc()),
		index("connections_srcip_ts").on(t.srcIp, t.receivedAt.desc()),
		index("connections_intent_ts").on(t.intent, t.receivedAt.desc()),
	],
);
