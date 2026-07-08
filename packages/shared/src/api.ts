import { z } from "zod";
import { ConnectionEvent } from "./events.js";
import { DaemonConfig } from "./config.js";

/** POST /v1/enroll — a daemon trades a bootstrap token for its identity + API key. */
export const EnrollRequest = z.object({
	enrollmentToken: z.string().min(1),
	/** Stable machine identifier so re-enrollment is idempotent (no orphaned history). */
	machineId: z.string().min(1).max(128),
	hostname: z.string().max(255).optional(),
});
export type EnrollRequest = z.infer<typeof EnrollRequest>;

export const EnrollResponse = z.object({
	daemonId: z.string(),
	apiKey: z.string(),
});
export type EnrollResponse = z.infer<typeof EnrollResponse>;

/** POST /v1/ingest — a batch of captured events. Server dedupes on eventId. */
export const IngestRequest = z.object({
	events: z.array(ConnectionEvent).min(1).max(10000),
});
export type IngestRequest = z.infer<typeof IngestRequest>;

export const IngestResponse = z.object({
	/** How many events were newly stored (duplicates excluded). */
	accepted: z.number().int(),
	duplicates: z.number().int(),
});
export type IngestResponse = z.infer<typeof IngestResponse>;

/** POST /v1/daemons/:id/heartbeat — liveness + host metrics. */
export const HeartbeatRequest = z.object({
	queueDepth: z.number().int().min(0),
	uptimeSeconds: z.number().int().min(0),
	/** Config revision the daemon currently has applied. */
	configRevision: z.number().int(),
});
export type HeartbeatRequest = z.infer<typeof HeartbeatRequest>;

/** GET /v1/daemons/:id/config */
export const ConfigResponse = DaemonConfig;
export type ConfigResponse = z.infer<typeof ConfigResponse>;
