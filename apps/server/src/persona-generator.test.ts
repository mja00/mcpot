import { describe, expect, it } from "vitest";
import { generatePersona } from "./persona-generator.ts";
import { PERSONA_CORPUS } from "./persona-corpus.ts";

describe("generatePersona", () => {
	it("is deterministic for a given seed", () => {
		expect(generatePersona("machine-abc")).toEqual(generatePersona("machine-abc"));
	});

	it("produces varied personas across seeds", () => {
		const motds = new Set(Array.from({ length: 30 }, (_, i) => generatePersona(`seed-${i}`).motd));
		expect(motds.size).toBeGreaterThan(1);
	});

	it("draws version+MOTD+slots as an authentic real-server combination", () => {
		for (const seed of ["s1", "s2", "s3", "s4", "s5"]) {
			const p = generatePersona(seed);
			// The (version, motd, slots) triple must exist together in the real corpus, not be mixed.
			const match = PERSONA_CORPUS.some(
				(r) => r.versionName === p.versionName && r.protocol === p.protocol && r.motd === p.motd && r.maxPlayers === p.maxPlayers,
			);
			expect(match).toBe(true);
		}
	});

	it("stays within sane bounds", () => {
		for (let i = 0; i < 50; i++) {
			const p = generatePersona(`seed-${i}`);
			expect(p.basePlayers).toBeGreaterThanOrEqual(0);
			expect(p.basePlayers).toBeLessThanOrEqual(p.maxPlayers);
			expect(p.nameCorpus.length).toBeGreaterThanOrEqual(18);
			expect(p.pingLatencyMaxMs).toBeGreaterThan(p.pingLatencyMinMs);
			expect(new Set(p.nameCorpus).size).toBe(p.nameCorpus.length); // distinct names
		}
	});
});
