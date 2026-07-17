import { describe, expect, it } from "vitest";
import { type OffenderSignals, classify, SCORE_TERMS } from "./classify.ts";

/** Benign-ish baseline: one completed status ping from one daemon via a domain, then a login. */
const base: OffenderSignals = {
	hits: 2,
	logins: 1,
	daemonsHit: 1,
	rawHostnameHits: 0,
	abnormalProtoHits: 0,
	distinctUsernames: 1,
	anomalyHits: 0,
	incompletePingHits: 0,
	distinctAddresses: 1,
	distinctProtocols: 1,
	rateLimitedDrops: 0,
};

describe("classify archetypes", () => {
	it("scores a curious human at 0 (prober)", () => {
		expect(classify(base)).toEqual({ score: 0, label: "prober" });
	});

	it("scores a domain visitor who pings but never joins at 5 (prober)", () => {
		const r = classify({ ...base, hits: 3, logins: 0, distinctUsernames: 0 });
		expect(r).toEqual({ score: 5, label: "prober" });
	});

	it("scores a single-daemon masscan bare-connect at 30 (suspicious, not auto-reported)", () => {
		// Bare connects: no handshake, so null protocol + handshake_timeout fingerprints.
		const r = classify({
			...base,
			hits: 3,
			logins: 0,
			distinctUsernames: 0,
			distinctAddresses: 0,
			distinctProtocols: 0,
			abnormalProtoHits: 3,
			anomalyHits: 3,
		});
		expect(r).toEqual({ score: 30, label: "suspicious" });
	});

	it("scores the same bare-connect sweep across 3 daemons at 65 (scanner)", () => {
		const r = classify({
			...base,
			hits: 9,
			logins: 0,
			daemonsHit: 3,
			distinctUsernames: 0,
			distinctAddresses: 0,
			distinctProtocols: 0,
			abnormalProtoHits: 9,
			anomalyHits: 9,
		});
		expect(r).toEqual({ score: 65, label: "scanner" });
	});

	it("scores a raw-IP status scanner on 2 daemons that never completes pings at 70 (scanner)", () => {
		const r = classify({
			...base,
			hits: 10,
			logins: 0,
			daemonsHit: 2,
			rawHostnameHits: 10,
			distinctUsernames: 0,
			incompletePingHits: 10,
		});
		expect(r).toEqual({ score: 70, label: "scanner" });
	});

	it("scores a hostname-replay scanner (real domains, valid protocols, 3 daemons) at 65 (scanner)", () => {
		// This archetype scored 40 under the old model and was missed entirely.
		const r = classify({
			...base,
			hits: 12,
			logins: 0,
			daemonsHit: 3,
			distinctUsernames: 0,
			distinctAddresses: 6,
			distinctProtocols: 4,
		});
		expect(r).toEqual({ score: 65, label: "scanner" });
	});

	it("scores a credential sprayer via raw IP at 50 (suspicious)", () => {
		const r = classify({
			...base,
			hits: 8,
			logins: 8,
			rawHostnameHits: 8,
			distinctUsernames: 6,
		});
		expect(r).toEqual({ score: 50, label: "suspicious" });
	});

	it("counts rate-limited flood volume toward the score", () => {
		const quiet = classify({ ...base, logins: 0, distinctUsernames: 0 });
		const flooding = classify({ ...base, logins: 0, distinctUsernames: 0, rateLimitedDrops: 120 });
		expect(flooding.score - quiet.score).toBe(15);
	});

	it("caps the score at 100", () => {
		const r = classify({
			hits: 100,
			logins: 0,
			daemonsHit: 20,
			rawHostnameHits: 100,
			abnormalProtoHits: 50,
			distinctUsernames: 10,
			anomalyHits: 50,
			incompletePingHits: 50,
			distinctAddresses: 20,
			distinctProtocols: 8,
			rateLimitedDrops: 500,
		});
		expect(r).toEqual({ score: 100, label: "scanner" });
	});
});

describe("SCORE_TERMS invariants", () => {
	it("has unique keys and positive weights", () => {
		const keys = SCORE_TERMS.map((t) => t.key);
		expect(new Set(keys).size).toBe(keys.length);
		for (const term of SCORE_TERMS) expect(term.weight).toBeGreaterThan(0);
	});

	it("can exceed the cap when every term fires (cap is doing real work)", () => {
		const raw = SCORE_TERMS.reduce((sum, t) => sum + t.weight, 0);
		expect(raw).toBeGreaterThan(100);
	});

	it("labels exactly at the 30/60 boundaries", () => {
		// masscan archetype sits exactly on the suspicious boundary
		const suspicious = classify({
			...base,
			logins: 0,
			distinctUsernames: 0,
			abnormalProtoHits: 1,
			anomalyHits: 1,
		});
		expect(suspicious.score).toBe(30);
		expect(suspicious.label).toBe("suspicious");
	});
});
