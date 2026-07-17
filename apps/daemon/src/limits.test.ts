import { describe, expect, it } from "vitest";
import { ConnectionLimiter } from "./limits.ts";

describe("ConnectionLimiter drop accounting", () => {
	it("tallies per-IP rejections and clears them on drain", () => {
		const limiter = new ConnectionLimiter({ maxConcurrent: 10, perIpPerMinute: 2 });
		const now = Date.now();

		expect(limiter.tryAdmit("198.51.100.1", now)).toBe(true);
		expect(limiter.tryAdmit("198.51.100.1", now)).toBe(true);
		expect(limiter.tryAdmit("198.51.100.1", now)).toBe(false);
		expect(limiter.tryAdmit("198.51.100.1", now)).toBe(false);
		expect(limiter.tryAdmit("198.51.100.2", now)).toBe(true);

		expect(limiter.drainDrops()).toEqual([{ ip: "198.51.100.1", count: 2 }]);
		// Drained — the next sweep starts from zero.
		expect(limiter.drainDrops()).toEqual([]);
	});

	it("counts drops from the global concurrency ceiling too", () => {
		const limiter = new ConnectionLimiter({ maxConcurrent: 1, perIpPerMinute: 100 });
		const now = Date.now();

		expect(limiter.tryAdmit("198.51.100.1", now)).toBe(true);
		expect(limiter.tryAdmit("198.51.100.2", now)).toBe(false);
		expect(limiter.drainDrops()).toEqual([{ ip: "198.51.100.2", count: 1 }]);

		// Releasing frees the slot again.
		limiter.release();
		expect(limiter.tryAdmit("198.51.100.2", now)).toBe(true);
	});
});
