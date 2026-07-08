import type { DaemonSettings } from "@mcpot/shared";

/** Default runtime settings pushed to daemons via the config poll. */
export const DEFAULT_SETTINGS: DaemonSettings = {
	listenPort: 25565,
	batchSize: 100,
	maxBatchDelayMs: 5000,
	pollIntervalMs: 30000,
	maxQueueEvents: 50000,
	maxConcurrentConnections: 512,
	perIpConnectionsPerMinute: 60,
	handshakeTimeoutMs: 5000,
	connectionTimeoutMs: 30000,
};
