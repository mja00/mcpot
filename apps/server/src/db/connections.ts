import { count, countDistinct, desc, eq, gte } from "drizzle-orm";
import type { ConnectionEvent } from "@mcpot/shared";
import type { Db } from "./client.ts";
import { connections } from "./schema.ts";
import { sanitizeString, toInetOrNull } from "../sanitize.ts";

export interface IngestResult {
	accepted: number;
	duplicates: number;
}

/**
 * Store a batch idempotently. event_id is the PK, so onConflictDoNothing makes retried batches safe.
 * We also dedupe within the batch first (a single INSERT can't reference the same conflict key twice)
 * and sanitize attacker-controlled strings. received_at defaults to server time (daemon clocks drift).
 */
export async function ingestEvents(db: Db, daemonId: string, events: ConnectionEvent[]): Promise<IngestResult> {
	const seen = new Set<string>();
	const rows = [];
	for (const e of events) {
		if (seen.has(e.eventId)) continue;
		seen.add(e.eventId);
		rows.push({
			eventId: e.eventId,
			daemonId,
			observedAt: new Date(e.observedAt),
			srcIp: toInetOrNull(e.srcIp),
			srcPort: e.srcPort,
			protocolVersion: e.protocolVersion,
			serverAddress: sanitizeString(e.serverAddress),
			serverPort: e.serverPort,
			intent: e.intent,
			pingCompleted: e.pingCompleted,
			username: sanitizeString(e.username),
			playerUuid: e.playerUuid,
			fingerprint: sanitizeString(e.fingerprint),
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
}

/** Most recent events, optionally scoped to one daemon. */
export async function listConnections(
	db: Db,
	opts: { limit: number; daemonId?: string } = { limit: 100 },
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
		})
		.from(connections)
		.orderBy(desc(connections.receivedAt))
		.limit(Math.min(opts.limit, 1000));
	const rows = opts.daemonId ? await base.where(eq(connections.daemonId, opts.daemonId)) : await base;
	return rows;
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
