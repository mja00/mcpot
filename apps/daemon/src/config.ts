import type { DaemonConfig, DaemonSettings } from "@mcpot/shared";
import { DEFAULT_PERSONA } from "./persona.ts";
import type { HandlerConfig } from "./connection-handler.ts";
import type { ConfigHolder } from "./config-holder.ts";

/** Fallback settings used before the first successful config poll (or in standalone mode). */
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

/** Env-sourced bootstrap. serverUrl absent → standalone mode (log events, no phone-home). */
export interface BootstrapConfig {
	serverUrl: string | null;
	enrollmentToken: string | null;
	stateDir: string;
	listenPort: number;
}

function envInt(name: string, fallback: number): number {
	const raw = process.env[name];
	if (raw === undefined) return fallback;
	const parsed = Number.parseInt(raw, 10);
	return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadBootstrap(): BootstrapConfig {
	return {
		serverUrl: process.env.MCPOT_SERVER_URL ?? null,
		enrollmentToken: process.env.MCPOT_ENROLLMENT_TOKEN ?? null,
		stateDir: process.env.MCPOT_STATE_DIR ?? "./data",
		listenPort: envInt("MCPOT_PORT", DEFAULT_SETTINGS.listenPort),
	};
}

/** Config used before central is reachable, so the daemon serves a believable server immediately. */
export function fallbackConfig(daemonId: string, listenPort: number): DaemonConfig {
	return {
		daemonId,
		persona: DEFAULT_PERSONA,
		settings: { ...DEFAULT_SETTINGS, listenPort },
		revision: 0,
	};
}

/** Snapshot the per-connection handler config from the live config holder. */
export function handlerConfigFrom(holder: ConfigHolder): HandlerConfig {
	const { settings } = holder.get();
	return {
		persona: holder.persona,
		handshakeTimeoutMs: settings.handshakeTimeoutMs,
		connectionTimeoutMs: settings.connectionTimeoutMs,
	};
}
