import { type Persona, pick, randInt, rngFromString, sample } from "@mcpot/shared";
import { NAME_POOL } from "./persona-pools.ts";
import { PERSONA_CORPUS } from "./persona-corpus.ts";

/**
 * Deterministically build a server identity from a seed by sampling a real observed server profile
 * (version, MOTD, slots, favicon, secure-chat, timezone) and layering on a player roster + latency
 * band. Same seed → same persona (so the daemon reproduces favicon/curve from it). Because whole
 * profiles are sampled, field combinations are authentic rather than independently random.
 */
export function generatePersona(seed: string): Persona {
	const rng = rngFromString(seed);
	const profile = pick(rng, PERSONA_CORPUS);

	// A scan snapshot catches most servers momentarily empty, but a 24/7 server isn't empty all day.
	// Trust a real non-zero reading; otherwise model a plausible typical population (some stay quiet,
	// most host a handful scaled to capacity) that the diurnal curve then animates.
	const basePlayers =
		profile.online > 0
			? Math.min(profile.online, profile.maxPlayers)
			: rng() < 0.35
				? 0
				: Math.max(1, Math.round(profile.maxPlayers * (0.01 + rng() * 0.06)));

	return {
		seed,
		versionName: profile.versionName,
		protocol: profile.protocol,
		motd: profile.motd,
		maxPlayers: profile.maxPlayers,
		basePlayers,
		utcOffsetMinutes: profile.utcOffsetMinutes,
		curveJitter: 0.1 + rng() * 0.3,
		faviconEnabled: profile.hasFavicon,
		enforcesSecureChat: profile.enforcesSecureChat,
		// A distinct roster per daemon; the live sample is drawn from this at request time.
		nameCorpus: sample(rng, NAME_POOL, randInt(rng, 18, 30)),
		pingLatencyMinMs: randInt(rng, 5, 30),
		pingLatencyMaxMs: randInt(rng, 40, 90),
	};
}
