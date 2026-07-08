import { eq } from "drizzle-orm";
import type { DaemonConfig, HeartbeatRequest } from "@mcpot/shared";
import type { Db } from "./client.ts";
import { daemons } from "./schema.ts";
import { generateApiKey } from "../auth/keys.ts";
import { DEFAULT_SETTINGS } from "../defaults.ts";
import { generatePersona } from "../persona-generator.ts";

export interface EnrollResult {
	daemonId: string;
	apiKey: string;
}

/**
 * Enroll or re-enroll a daemon. Idempotent on machine_id: a reinstall keeps the same daemon id and
 * history but is issued a fresh key (we only store hashes, so the old key can't be returned) and any
 * prior revocation is cleared. New daemons get default persona/settings; existing ones keep theirs.
 */
export async function enrollDaemon(db: Db, machineId: string, hostname: string | null): Promise<EnrollResult> {
	const { key, hash, prefix } = generateApiKey();
	const [row] = await db
		.insert(daemons)
		.values({
			machineId,
			hostname,
			apiKeyHash: hash,
			apiKeyPrefix: prefix,
			// Seed the identity from the stable machineId so re-enrollment keeps the same server.
			persona: generatePersona(machineId),
			settings: DEFAULT_SETTINGS,
		})
		.onConflictDoUpdate({
			target: daemons.machineId,
			set: { apiKeyHash: hash, apiKeyPrefix: prefix, hostname, revoked: false },
		})
		.returning({ id: daemons.id });
	return { daemonId: row!.id, apiKey: key };
}

export interface AuthedDaemon {
	id: string;
	revoked: boolean;
}

/** Resolve a presented API key (by its hash) to a daemon; null if unknown. */
export async function findDaemonByApiKey(db: Db, apiKeyHash: string): Promise<AuthedDaemon | null> {
	const [row] = await db
		.select({ id: daemons.id, revoked: daemons.revoked })
		.from(daemons)
		.where(eq(daemons.apiKeyHash, apiKeyHash))
		.limit(1);
	return row ?? null;
}

/** Assemble the config document a daemon polls for. */
export async function getDaemonConfig(db: Db, daemonId: string): Promise<DaemonConfig | null> {
	const [row] = await db
		.select({ persona: daemons.persona, settings: daemons.settings, revision: daemons.configRevision })
		.from(daemons)
		.where(eq(daemons.id, daemonId))
		.limit(1);
	if (!row) return null;
	return { daemonId, persona: row.persona, settings: row.settings, revision: row.revision };
}

export async function recordHeartbeat(db: Db, daemonId: string, hb: HeartbeatRequest): Promise<void> {
	await db
		.update(daemons)
		.set({
			lastHeartbeatAt: new Date(),
			lastSeenAt: new Date(),
			queueDepth: hb.queueDepth,
			uptimeSeconds: hb.uptimeSeconds,
		})
		.where(eq(daemons.id, daemonId));
}

/** Revoke a daemon's key (compromise response). It must re-enroll to get a new one. */
export async function revokeDaemon(db: Db, daemonId: string): Promise<void> {
	await db.update(daemons).set({ revoked: true }).where(eq(daemons.id, daemonId));
}
