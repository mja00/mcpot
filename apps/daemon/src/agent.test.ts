import http from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ConnectionEvent, DaemonConfig } from "@mcpot/shared";
import { DaemonAgent } from "./agent.ts";
import { ConfigHolder } from "./config-holder.ts";
import { EventQueue } from "./queue.ts";
import { fallbackConfig } from "./config.ts";

interface StubState {
	ingested: ConnectionEvent[];
	failIngest: boolean;
	configRevision: number;
	heartbeats: number;
}

/** Minimal stand-in for the central server so the agent's phone-home behavior is tested in isolation. */
function startStub(state: StubState): Promise<{ url: string; close: () => Promise<void> }> {
	const server = http.createServer((req, res) => {
		let body = "";
		req.on("data", (c) => (body += c));
		req.on("end", () => {
			if (req.url === "/v1/ingest" && req.method === "POST") {
				if (state.failIngest) return void res.writeHead(500).end("{}");
				const { events } = JSON.parse(body) as { events: ConnectionEvent[] };
				state.ingested.push(...events);
				return void res.writeHead(200).end(JSON.stringify({ accepted: events.length, duplicates: 0 }));
			}
			if (req.url?.endsWith("/config") && req.method === "GET") {
				const cfg: DaemonConfig = { ...fallbackConfig("stub-daemon", 25565), revision: state.configRevision };
				return void res.writeHead(200).end(JSON.stringify(cfg));
			}
			if (req.url?.endsWith("/heartbeat") && req.method === "POST") {
				state.heartbeats++;
				return void res.writeHead(204).end();
			}
			res.writeHead(404).end();
		});
	});
	return new Promise((resolve) => {
		server.listen(0, "127.0.0.1", () => {
			const addr = server.address();
			const port = typeof addr === "object" && addr ? addr.port : 0;
			resolve({
				url: `http://127.0.0.1:${port}`,
				close: () => new Promise((r) => server.close(() => r())),
			});
		});
	});
}

function event(): ConnectionEvent {
	return {
		eventId: randomUUID(),
		observedAt: new Date().toISOString(),
		srcIp: "203.0.113.5",
		srcPort: 4321,
		protocolVersion: 772,
		serverAddress: "example.net",
		serverPort: 25565,
		intent: "status",
		pingCompleted: true,
		username: null,
		playerUuid: null,
		fingerprint: null,
	};
}

let dir: string;
beforeEach(() => (dir = mkdtempSync(join(tmpdir(), "mcpot-agent-"))));
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("DaemonAgent phone-home", () => {
	function makeAgent(url: string, queue: EventQueue) {
		const holder = new ConfigHolder(fallbackConfig("stub-daemon", 25565));
		return { agent: new DaemonAgent({ serverUrl: url, daemonId: "stub-daemon", apiKey: "k", queue, config: holder }), holder };
	}

	it("flushes queued events and acks them on success", async () => {
		const state: StubState = { ingested: [], failIngest: false, configRevision: 1, heartbeats: 0 };
		const stub = await startStub(state);
		const queue = new EventQueue(join(dir, "q.sqlite"), 1000);
		queue.enqueue(event());
		queue.enqueue(event());

		const { agent } = makeAgent(stub.url, queue);
		const sent = await agent.flushOnce();

		expect(sent).toBe(2);
		expect(state.ingested).toHaveLength(2);
		expect(queue.size()).toBe(0); // acked
		queue.close();
		await stub.close();
	});

	it("does NOT ack when the server rejects the batch (events survive for retry)", async () => {
		const state: StubState = { ingested: [], failIngest: true, configRevision: 1, heartbeats: 0 };
		const stub = await startStub(state);
		const queue = new EventQueue(join(dir, "q.sqlite"), 1000);
		queue.enqueue(event());

		const { agent } = makeAgent(stub.url, queue);
		await expect(agent.flushOnce()).rejects.toBeDefined();
		expect(queue.size()).toBe(1); // retained
		queue.close();
		await stub.close();
	});

	it("polls config and sends a heartbeat", async () => {
		const state: StubState = { ingested: [], failIngest: false, configRevision: 7, heartbeats: 0 };
		const stub = await startStub(state);
		const queue = new EventQueue(join(dir, "q.sqlite"), 1000);
		const { agent, holder } = makeAgent(stub.url, queue);

		await agent.pollOnce();
		expect(holder.revision).toBe(7);
		expect(state.heartbeats).toBe(1);
		queue.close();
		await stub.close();
	});
});
