import { z } from "zod";

/**
 * The server identity a daemon presents. Seeded per-daemon so each host is stable but distinct;
 * the simulation engine varies `players.online`/sample over the day within these bounds. Curve
 * jitter + a timezone offset keep hosts from correlating into an obvious fleet.
 */
export const Persona = z.object({
	versionName: z.string(),
	protocol: z.number().int(),
	motd: z.string().max(256),
	maxPlayers: z.number().int().min(1).max(100000),
	/** Base online count around which the diurnal curve oscillates. */
	basePlayers: z.number().int().min(0),
	/** IANA-style UTC offset in minutes; drives the timezone-correlated activity peak. */
	utcOffsetMinutes: z.number().int().min(-720).max(840),
	/** 0-1 random jitter applied to the curve so hosts don't share an identical shape. */
	curveJitter: z.number().min(0).max(1),
	faviconEnabled: z.boolean(),
	/** Names the sample roster draws from; large + distinct across hosts to resist correlation. */
	nameCorpus: z.array(z.string()).max(2000),
	pingLatencyMinMs: z.number().int().min(0),
	pingLatencyMaxMs: z.number().int().min(0),
});
export type Persona = z.infer<typeof Persona>;
