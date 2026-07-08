import type { Persona } from "@mcpot/shared";
import { LATEST_VERSION } from "@mcpot/protocol";

/**
 * Fallback persona for standalone mode / before the first config poll. Networked daemons receive a
 * seeded, varied persona from the server; the simulation engine renders live players from it.
 */
export const DEFAULT_PERSONA: Persona = {
	seed: "default",
	versionName: LATEST_VERSION.name,
	protocol: LATEST_VERSION.protocol,
	motd: "A Minecraft Server",
	maxPlayers: 20,
	basePlayers: 3,
	utcOffsetMinutes: 0,
	curveJitter: 0.2,
	faviconEnabled: false,
	enforcesSecureChat: false,
	nameCorpus: ["Steve", "Alex", "Notch", "jeb_", "Herobrine"],
	pingLatencyMinMs: 0,
	pingLatencyMaxMs: 0,
};
