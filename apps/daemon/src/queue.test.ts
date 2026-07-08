import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ConnectionEvent } from "@mcpot/shared";
import { EventQueue } from "./queue.ts";

let dir: string;
const dbPath = () => join(dir, "queue.sqlite");

function event(overrides: Partial<ConnectionEvent> = {}): ConnectionEvent {
	return {
		eventId: randomUUID(),
		observedAt: new Date().toISOString(),
		srcIp: "203.0.113.9",
		srcPort: 1234,
		protocolVersion: 772,
		serverAddress: "example.net",
		serverPort: 25565,
		intent: "status",
		pingCompleted: true,
		username: null,
		playerUuid: null,
		fingerprint: null,
		...overrides,
	};
}

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "mcpot-queue-"));
});
afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

describe("EventQueue", () => {
	it("enqueues, peeks in FIFO order, and acks", () => {
		const q = new EventQueue(dbPath(), 100);
		const a = event();
		const b = event();
		q.enqueue(a);
		q.enqueue(b);
		expect(q.size()).toBe(2);

		const batch = q.peek(10);
		expect(batch.map((x) => x.event.eventId)).toEqual([a.eventId, b.eventId]);

		q.ack([batch[0]!.id]);
		expect(q.size()).toBe(1);
		expect(q.peek(10)[0]!.event.eventId).toBe(b.eventId);
		q.close();
	});

	it("survives a restart (durability)", () => {
		const e = event();
		const q1 = new EventQueue(dbPath(), 100);
		q1.enqueue(e);
		q1.close();

		const q2 = new EventQueue(dbPath(), 100);
		expect(q2.size()).toBe(1);
		expect(q2.peek(1)[0]!.event.eventId).toBe(e.eventId);
		q2.close();
	});

	it("drops oldest events past the cap", () => {
		const q = new EventQueue(dbPath(), 3);
		const events = [event(), event(), event(), event(), event()];
		for (const e of events) q.enqueue(e);

		expect(q.size()).toBe(3);
		// The two oldest were dropped; the three newest remain in order.
		expect(q.peek(10).map((x) => x.event.eventId)).toEqual([events[2]!.eventId, events[3]!.eventId, events[4]!.eventId]);
		q.close();
	});

	it("ignores duplicate eventIds", () => {
		const q = new EventQueue(dbPath(), 100);
		const e = event();
		q.enqueue(e);
		q.enqueue(e);
		expect(q.size()).toBe(1);
		q.close();
	});
});
