import { DEFAULT_PERSONA } from "./persona.ts";
import type { Persona } from "@mcpot/shared";

/** M1 daemon config sourced from env; M3 replaces this with the server-pushed config poll. */
export interface DaemonRuntimeConfig {
	listenPort: number;
	persona: Persona;
	maxConcurrentConnections: number;
	perIpConnectionsPerMinute: number;
	handshakeTimeoutMs: number;
	connectionTimeoutMs: number;
}

function envInt(name: string, fallback: number): number {
	const raw = process.env[name];
	if (raw === undefined) return fallback;
	const parsed = Number.parseInt(raw, 10);
	return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadConfig(): DaemonRuntimeConfig {
	return {
		listenPort: envInt("MCPOT_PORT", 25565),
		persona: DEFAULT_PERSONA,
		maxConcurrentConnections: envInt("MCPOT_MAX_CONCURRENT", 512),
		perIpConnectionsPerMinute: envInt("MCPOT_PER_IP_PER_MIN", 60),
		handshakeTimeoutMs: envInt("MCPOT_HANDSHAKE_TIMEOUT_MS", 5000),
		connectionTimeoutMs: envInt("MCPOT_CONN_TIMEOUT_MS", 30000),
	};
}
