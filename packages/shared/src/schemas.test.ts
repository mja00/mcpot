import { describe, expect, it } from "vitest";
import { ConnectionEvent, IngestRequest, RecentConnection, TrendsResponse } from "./index.js";

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

describe("dashboard schemas", () => {
	it("accepts daemon-attributed recent connections", () => {
		const row = {
			eventId: validEvent.eventId,
			daemonId: "c018353f-a8ea-4a3b-8d8a-a519605d5402",
			daemonHostname: "edge-1",
			receivedAt: validEvent.observedAt,
			srcIp: validEvent.srcIp,
			protocolVersion: validEvent.protocolVersion,
			serverAddress: validEvent.serverAddress,
			intent: validEvent.intent,
			username: null,
			countryCode: null,
			asn: null,
			asOrg: null,
		};
		expect(RecentConnection.parse(row).daemonHostname).toBe("edge-1");
	});

	it("accepts a complete trends response", () => {
		const response = {
			range: { hours: 6, bucketMinutes: 15, from: "2026-07-08T00:00:00.000Z", to: "2026-07-08T06:00:00.000Z" },
			summary: {
				current: { total: 1, uniqueIps: 1, loginCount: 0, activeDaemons: 1 },
				previous: { total: 0, uniqueIps: 0, loginCount: 0, activeDaemons: 0 },
			},
			series: [{ bucket: "2026-07-08T00:00:00.000Z", total: 1, uniqueIps: 1, status: 1, login: 0, other: 0 }],
			countries: [{ countryCode: null, hits: 1, uniqueIps: 1 }],
			networks: [{ asn: null, asOrg: null, hits: 1, uniqueIps: 1 }],
			serverAddresses: [{ serverAddress: "play.example.net", hits: 1 }],
			usernames: [],
			daemons: [
				{
					daemonId: "c018353f-a8ea-4a3b-8d8a-a519605d5402",
					daemonHostname: "edge-1",
					hits: 1,
					share: 1,
					uniqueIps: 1,
					loginCount: 0,
					revoked: false,
					lastSeenAt: null,
					queueDepth: null,
				},
			],
			daemonSeries: {
				daemons: [{ daemonId: "c018353f-a8ea-4a3b-8d8a-a519605d5402", daemonHostname: "edge-1" }],
				buckets: [{ bucket: "2026-07-08T00:00:00.000Z", counts: { "c018353f-a8ea-4a3b-8d8a-a519605d5402": 1 }, other: 0 }],
			},
		};
		expect(TrendsResponse.parse(response).summary.current.total).toBe(1);
	});
});
