import { describe, expect, it } from "vitest";
import type { Persona } from "@mcpot/shared";
import { simulatePlayers } from "./simulation.ts";
import { getFavicon } from "./favicon.ts";

const persona: Persona = {
	seed: "test-seed-abc",
	versionName: "1.21.8",
	protocol: 772,
	motd: "Test",
	maxPlayers: 100,
	basePlayers: 20,
	utcOffsetMinutes: 0,
	curveJitter: 0.2,
	faviconEnabled: true,
	nameCorpus: Array.from({ length: 40 }, (_, i) => `player${i}`),
	pingLatencyMinMs: 10,
	pingLatencyMaxMs: 50,
};

// A UTC day at a fixed hour: hour 20:00 UTC is the peak for utcOffset 0, 08:00 the trough.
function atHour(hour: number): number {
	return Date.UTC(2026, 0, 1, hour, 0, 0);
}

describe("simulatePlayers", () => {
	it("peaks in the local evening and troughs in the early morning", () => {
		const peak = simulatePlayers(persona, atHour(20)).online;
		const trough = simulatePlayers(persona, atHour(8)).online;
		expect(peak).toBeGreaterThan(trough);
	});

	it("keeps online within [0, maxPlayers]", () => {
		for (let h = 0; h < 24; h++) {
			const { online } = simulatePlayers(persona, atHour(h));
			expect(online).toBeGreaterThanOrEqual(0);
			expect(online).toBeLessThanOrEqual(persona.maxPlayers);
		}
	});

	it("is stable within the same minute (no per-ping flicker)", () => {
		const t = atHour(20);
		const a = simulatePlayers(persona, t);
		const b = simulatePlayers(persona, t + 5000);
		expect(a.online).toBe(b.online);
		expect(a.sample.map((s) => s.name)).toEqual(b.sample.map((s) => s.name));
	});

	it("sizes the sample to the online count and caps it at 12", () => {
		const { online, sample } = simulatePlayers(persona, atHour(20));
		expect(sample.length).toBe(Math.min(online, 12));
		expect(sample[0]?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-3[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
	});

	it("timezone offset shifts the peak (a US-evening host differs from UTC at the same instant)", () => {
		const us = { ...persona, utcOffsetMinutes: -480 }; // UTC-8
		const t = atHour(4); // 20:00 in UTC-8 → US peak, but 04:00 UTC → UTC trough
		expect(simulatePlayers(us, t).online).toBeGreaterThan(simulatePlayers(persona, t).online);
	});
});

describe("getFavicon", () => {
	it("produces a valid 64x64 PNG data URI, deterministic per seed", () => {
		const a = getFavicon("seed-1");
		const b = getFavicon("seed-1");
		const c = getFavicon("seed-2");
		expect(a).toBe(b); // deterministic + cached
		expect(a).not.toBe(c); // distinct per seed
		expect(a.startsWith("data:image/png;base64,")).toBe(true);

		const png = Buffer.from(a.slice("data:image/png;base64,".length), "base64");
		expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]); // PNG magic
		expect(png.subarray(12, 16).toString("ascii")).toBe("IHDR");
		expect(png.readUInt32BE(16)).toBe(64); // width
		expect(png.readUInt32BE(20)).toBe(64); // height
	});
});
