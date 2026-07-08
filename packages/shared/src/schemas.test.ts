import { describe, expect, it } from "vitest";
import { ConnectionEvent, IngestRequest } from "./index.js";

const validEvent = {
	eventId: "adfc161d-f579-49a2-a385-f325cdadc461",
	observedAt: "2026-07-08T20:42:07.891Z",
	srcIp: "1.2.3.4",
	srcPort: 45528,
	protocolVersion: 772,
	serverAddress: "play.example.net",
	serverPort: 25565,
	intent: "status" as const,
	pingCompleted: true,
	username: null,
	playerUuid: null,
	fingerprint: null,
};

describe("ConnectionEvent schema", () => {
	it("accepts a well-formed event", () => {
		expect(ConnectionEvent.parse(validEvent)).toEqual(validEvent);
	});

	it("rejects a non-uuid eventId", () => {
		expect(() => ConnectionEvent.parse({ ...validEvent, eventId: "nope" })).toThrow();
	});

	it("rejects a username over 16 chars (protocol max)", () => {
		expect(() => ConnectionEvent.parse({ ...validEvent, username: "x".repeat(17) })).toThrow();
	});

	it("allows a null/abnormal protocol version", () => {
		expect(ConnectionEvent.parse({ ...validEvent, protocolVersion: null }).protocolVersion).toBeNull();
	});
});

describe("IngestRequest schema", () => {
	it("requires at least one event", () => {
		expect(() => IngestRequest.parse({ events: [] })).toThrow();
	});

	it("accepts a batch", () => {
		expect(IngestRequest.parse({ events: [validEvent] }).events).toHaveLength(1);
	});
});
