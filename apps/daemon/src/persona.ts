import type { Persona } from "@mcpot/shared";
import { LATEST_VERSION, serializeStatus, type StatusPlayerSample } from "@mcpot/protocol";

/** Deterministic UUID-ish id for a sample name (offline-mode style); good enough for a status sample. */
function sampleId(name: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < name.length; i++) {
		h ^= name.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	const hex = (h >>> 0).toString(16).padStart(8, "0");
	return `${hex}-0000-4000-8000-${hex}00000000`.slice(0, 36);
}

/** M1 default persona. The simulation engine (M4) will vary online count/sample over time. */
export const DEFAULT_PERSONA: Persona = {
	versionName: LATEST_VERSION.name,
	protocol: LATEST_VERSION.protocol,
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

/** Build the status-response JSON for a persona at a given online count. */
export function buildStatusJson(persona: Persona, online: number): string {
	const sample: StatusPlayerSample[] = persona.nameCorpus
		.slice(0, Math.min(online, 12))
		.map((name) => ({ name, id: sampleId(name) }));

	return serializeStatus({
		version: { name: persona.versionName, protocol: persona.protocol },
		players: { max: persona.maxPlayers, online, ...(sample.length > 0 ? { sample } : {}) },
		description: { text: persona.motd },
		enforcesSecureChat: false,
	});
}
