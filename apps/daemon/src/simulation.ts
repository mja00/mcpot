import { createHash } from "node:crypto";
import type { StatusPlayerSample } from "@mcpot/protocol";
import { type Persona, hashString, mulberry32, sample } from "@mcpot/shared";

export interface SimulatedState {
	online: number;
	sample: StatusPlayerSample[];
}

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;
const PEAK_LOCAL_HOUR = 20; // servers are busiest in the local evening
const MAX_SAMPLE = 12; // vanilla clients only show a handful of names

/** Offline-mode UUID (name-based MD5, UUID v3) — exactly what a real offline server reports. */
function offlineUuid(name: string): string {
	const md5 = createHash("md5").update(`OfflinePlayer:${name}`).digest();
	md5[6] = (md5[6]! & 0x0f) | 0x30;
	md5[8] = (md5[8]! & 0x3f) | 0x80;
	const h = md5.toString("hex");
	return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/**
 * Compute a believable current player population for a persona at `nowMs`. Online count follows a
 * timezone-correlated diurnal curve (evening peak) with per-daemon jitter, and is stable within a
 * minute so repeated pings from one scanner see a consistent count. The sample roster is drawn from
 * the persona's own name corpus and sized to the online count.
 */
export function simulatePlayers(persona: Persona, nowMs: number): SimulatedState {
	const localHour = ((((nowMs + persona.utcOffsetMinutes * MINUTE_MS) / HOUR_MS) % 24) + 24) % 24;
	const phase = ((localHour - PEAK_LOCAL_HOUR) / 24) * 2 * Math.PI;
	const diurnal = 0.5 + 0.5 * Math.cos(phase); // 1 at the local peak, ~0 twelve hours away

	// Per-minute jitter, deterministic within the minute so the count doesn't flicker per ping.
	const minuteBucket = Math.floor(nowMs / MINUTE_MS);
	const jitterRng = mulberry32(hashString(`${persona.seed}:${minuteBucket}`));
	const jitter = 1 - persona.curveJitter + jitterRng() * persona.curveJitter * 2;

	const swing = 0.3 + 1.5 * diurnal; // trough ≈ 0.3× base, peak ≈ 1.8× base
	const online = Math.max(0, Math.min(Math.round(persona.basePlayers * swing * jitter), persona.maxPlayers));

	const sampleRng = mulberry32(hashString(`${persona.seed}:${minuteBucket}:sample`));
	const names = sample(sampleRng, persona.nameCorpus, Math.min(online, MAX_SAMPLE));
	return { online, sample: names.map((name) => ({ name, id: offlineUuid(name) })) };
}
