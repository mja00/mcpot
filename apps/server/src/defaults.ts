import type { DaemonSettings, Persona } from "@mcpot/shared";

/** Persona assigned to a freshly enrolled daemon. Per-daemon seeding/variation lands in M4. */
export const DEFAULT_PERSONA: Persona = {
	versionName: "26.2",
	protocol: 776,
	motd: "A Minecraft Server",
	maxPlayers: 20,
	basePlayers: 3,
	utcOffsetMinutes: 0,
	curveJitter: 0.2,
	faviconEnabled: false,
	nameCorpus: ["Steve", "Alex", "Notch", "jeb_", "Herobrine"],
	pingLatencyMinMs: 0,
	pingLatencyMaxMs: 0,
};

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
