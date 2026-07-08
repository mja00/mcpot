import { VERSIONS } from "@mcpot/protocol";
import { type Persona, pick, pickWeighted, randInt, rngFromString, sample } from "@mcpot/shared";
import { MAX_PLAYERS, MOTD_POOL, NAME_POOL, UTC_OFFSETS } from "./persona-pools.ts";

// Newer versions are far more common on the public internet; weight the version table toward the tail.
const VERSION_WEIGHTS = VERSIONS.map((_, i) => i + 1);

/**
 * Deterministically build a distinct server identity from a seed. Same seed → same persona (so the
 * daemon reproduces favicon/curve from it), different seeds → visibly different servers. Player
 * counts are simulated live on the daemon; this only fixes the stable identity.
 */
export function generatePersona(seed: string): Persona {
	const rng = rngFromString(seed);
	const version = pickWeighted(rng, VERSIONS, VERSION_WEIGHTS);
	const maxPlayers = pick(rng, MAX_PLAYERS);

	return {
		seed,
		versionName: version.name,
		protocol: version.protocol,
		motd: pick(rng, MOTD_POOL),
		maxPlayers,
		// Base (average) population: a modest, plausible fraction of capacity, at least 1.
		basePlayers: Math.max(1, Math.round(maxPlayers * (0.03 + rng() * 0.12))),
		utcOffsetMinutes: pick(rng, UTC_OFFSETS),
		curveJitter: 0.1 + rng() * 0.3,
		faviconEnabled: rng() < 0.7,
		// A distinct roster per daemon; the live sample is drawn from this at request time.
		nameCorpus: sample(rng, NAME_POOL, randInt(rng, 18, 30)),
		pingLatencyMinMs: randInt(rng, 5, 30),
		pingLatencyMaxMs: randInt(rng, 40, 90),
	};
}
