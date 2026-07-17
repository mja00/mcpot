import { describe, expect, it } from "vitest";
import { isPublicIp, shouldAutoReport } from "./report.ts";

describe("automatic report criteria", () => {
	it("requires an enabled scanner with enough observed hits", () => {
		const config = { enabled: true, minScore: 60, minHits: 3, windowHours: 24, checkEnabled: false, checkCacheHours: 24 };
		// Raw-IP sweep across 2 daemons with anomalous handshakes: 30+25+15+10+5 = 85.
		const scanner = {
			hits: 3,
			logins: 0,
			daemonsHit: 2,
			rawHostnameHits: 3,
			abnormalProtoHits: 1,
			distinctUsernames: 0,
			anomalyHits: 1,
			incompletePingHits: 0,
			distinctAddresses: 0,
			distinctProtocols: 0,
			rateLimitedDrops: 0,
		};
		expect(shouldAutoReport(scanner, config)).toBe(true);
		expect(shouldAutoReport({ ...scanner, hits: 2 }, config)).toBe(false);
		expect(shouldAutoReport({ ...scanner, rawHostnameHits: 0 }, config)).toBe(false);
		expect(shouldAutoReport(scanner, { ...config, enabled: false })).toBe(false);
	});

	it("excludes non-public source addresses", () => {
		expect(isPublicIp("8.8.8.8")).toBe(true);
		expect(isPublicIp("192.168.1.10")).toBe(false);
		expect(isPublicIp("2001:db8::1")).toBe(false);
		expect(isPublicIp("not-an-ip")).toBe(false);
	});
});
