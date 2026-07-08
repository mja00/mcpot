import { z } from "zod";
import { Persona } from "./persona.js";

/** Runtime knobs the central service pushes to a daemon via the config poll. */
export const DaemonSettings = z.object({
	/** TCP listen port for the fake server. */
	listenPort: z.number().int().min(1).max(65535),
	/** Max events per phone-home batch. */
	batchSize: z.number().int().min(1).max(10000),
	/** How long a daemon waits before flushing a partial batch (ms). */
	maxBatchDelayMs: z.number().int().min(100),
	/** Config/heartbeat poll interval (ms). */
	pollIntervalMs: z.number().int().min(1000),
	/** Hard cap on the local durable queue; oldest events drop past this. */
	maxQueueEvents: z.number().int().min(100),
	/** Per-connection limits that keep the daemon alive under hostile load. */
	maxConcurrentConnections: z.number().int().min(1),
	perIpConnectionsPerMinute: z.number().int().min(1),
	handshakeTimeoutMs: z.number().int().min(100),
	connectionTimeoutMs: z.number().int().min(100),
});
export type DaemonSettings = z.infer<typeof DaemonSettings>;

/** Full config document returned by the server for a given daemon. */
export const DaemonConfig = z.object({
	daemonId: z.string(),
	persona: Persona,
	settings: DaemonSettings,
	/** Bumped when persona/settings change so the daemon knows to re-apply. */
	revision: z.number().int(),
});
export type DaemonConfig = z.infer<typeof DaemonConfig>;
