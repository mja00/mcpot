import { describe, expect, it } from "vitest";
import { classify } from "./classify.ts";

describe("classify", () => {
	it("flags a fleet-sweeping raw-IP scanner", () => {
		const r = classify({ hits: 50, logins: 0, daemonsHit: 8, rawHostnameHits: 50, abnormalProtoHits: 3, distinctUsernames: 0 });
		expect(r.label).toBe("scanner");
		expect(r.score).toBeGreaterThanOrEqual(60);
	});

	it("rates a single-host domain visitor as a prober", () => {
		const r = classify({ hits: 2, logins: 1, daemonsHit: 1, rawHostnameHits: 0, abnormalProtoHits: 0, distinctUsernames: 1 });
		expect(r.label).toBe("prober");
		expect(r.score).toBeLessThan(30);
	});

	it("treats username spraying as suspicious+", () => {
		const r = classify({ hits: 10, logins: 10, daemonsHit: 1, rawHostnameHits: 0, abnormalProtoHits: 0, distinctUsernames: 6 });
		expect(r.score).toBeGreaterThanOrEqual(20);
	});

	it("caps the score at 100", () => {
		const r = classify({ hits: 100, logins: 0, daemonsHit: 20, rawHostnameHits: 100, abnormalProtoHits: 50, distinctUsernames: 10 });
		expect(r.score).toBeLessThanOrEqual(100);
	});
});
