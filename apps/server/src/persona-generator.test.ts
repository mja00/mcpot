import { describe, expect, it } from "vitest";
import { versionForProtocol } from "@mcpot/protocol";
import { generatePersona } from "./persona-generator.ts";

describe("generatePersona", () => {
	it("is deterministic for a given seed", () => {
		expect(generatePersona("machine-abc")).toEqual(generatePersona("machine-abc"));
	});

	it("produces distinct personas for different seeds", () => {
		const a = generatePersona("machine-a");
		const b = generatePersona("machine-b");
		// Across a few fields at least one must differ (astronomically unlikely to fully collide).
		const differs = a.motd !== b.motd || a.protocol !== b.protocol || a.maxPlayers !== b.maxPlayers || a.seed !== b.seed;
		expect(differs).toBe(true);
	});

	it("keeps version name and protocol consistent (a mismatch is a honeypot tell)", () => {
		for (const seed of ["s1", "s2", "s3", "s4", "s5"]) {
			const p = generatePersona(seed);
			expect(versionForProtocol(p.protocol)?.name).toBe(p.versionName);
		}
	});

	it("stays within sane bounds", () => {
		for (let i = 0; i < 50; i++) {
			const p = generatePersona(`seed-${i}`);
			expect(p.basePlayers).toBeGreaterThanOrEqual(1);
			expect(p.basePlayers).toBeLessThanOrEqual(p.maxPlayers);
			expect(p.nameCorpus.length).toBeGreaterThanOrEqual(18);
			expect(p.pingLatencyMaxMs).toBeGreaterThan(p.pingLatencyMinMs);
			expect(new Set(p.nameCorpus).size).toBe(p.nameCorpus.length); // distinct names
		}
	});
});
