import { type StatusResponse, serializeStatus } from "@mcpot/protocol";
import type { Persona } from "@mcpot/shared";
import { simulatePlayers } from "./simulation.ts";
import { getFavicon } from "./favicon.ts";

/** Build the live status-response JSON for a persona: simulated players + optional favicon. */
export function buildLiveStatusJson(persona: Persona, nowMs: number): string {
	const { online, sample } = simulatePlayers(persona, nowMs);

	const status: StatusResponse = {
		version: { name: persona.versionName, protocol: persona.protocol },
		players: { max: persona.maxPlayers, online, ...(sample.length > 0 ? { sample } : {}) },
		description: { text: persona.motd },
		...(persona.faviconEnabled ? { favicon: getFavicon(persona.seed) } : {}),
		enforcesSecureChat: persona.enforcesSecureChat,
	};
	return serializeStatus(status);
}

/** Random pong delay within the persona's latency band, to mimic real network round-trips. */
export function pingLatencyMs(persona: Persona): number {
	const { pingLatencyMinMs: min, pingLatencyMaxMs: max } = persona;
	if (max <= min) return min;
	return min + Math.floor(Math.random() * (max - min + 1));
}
