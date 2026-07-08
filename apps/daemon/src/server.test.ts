import net from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import type { ConnectionEvent } from "@mcpot/shared";
import { FrameReader, Intent, Writer } from "@mcpot/protocol";
import { startDaemonServer } from "./server.ts";
import { DEFAULT_PERSONA } from "./persona.ts";

function framed(packetId: number, body: Buffer): Buffer {
	const payload = new Writer().writeVarInt(packetId).writeBytes(body).toBuffer();
	return new Writer().writeVarInt(payload.length).writeBytes(payload).toBuffer();
}

function handshake(intent: Intent, addr = "mc.example.com", protocol = 772): Buffer {
	const body = new Writer()
		.writeVarInt(protocol)
		.writeString(addr)
		.writeUnsignedShort(25565)
		.writeVarInt(intent)
		.toBuffer();
	return framed(0x00, body);
}

let servers: ReturnType<typeof startDaemonServer>[] = [];

function launch(onEvent: (e: ConnectionEvent) => void): Promise<number> {
	const server = startDaemonServer({
		listenPort: 0,
		getHandlerConfig: () => ({
			persona: DEFAULT_PERSONA,
			handshakeTimeoutMs: 2000,
			connectionTimeoutMs: 5000,
		}),
		maxConcurrentConnections: 64,
		perIpConnectionsPerMinute: 1000,
		onEvent,
	});
	servers.push(server);
	return new Promise((resolve) => server.on("listening", () => {
		const addr = server.address();
		resolve(typeof addr === "object" && addr ? addr.port : 0);
	}));
}

function nextEvent(): { promise: Promise<ConnectionEvent>; onEvent: (e: ConnectionEvent) => void } {
	let resolve!: (e: ConnectionEvent) => void;
	const promise = new Promise<ConnectionEvent>((r) => (resolve = r));
	return { promise, onEvent: resolve };
}

afterEach(() => {
	for (const s of servers) s.close();
	servers = [];
});

describe("daemon server (end-to-end over TCP)", () => {
	it("answers a status ping and captures the event", async () => {
		const { promise, onEvent } = nextEvent();
		const port = await launch(onEvent);

		const statusJson = await new Promise<string>((resolve, reject) => {
			const client = net.connect(port, "127.0.0.1", () => {
				client.write(handshake(Intent.Status));
				client.write(framed(0x00, Buffer.alloc(0))); // status request
			});
			const frames = new FrameReader();
			client.on("data", (chunk) => {
				frames.push(chunk);
				const frame = frames.next();
				if (frame) {
					resolve(frame.body.readString());
					client.write(framed(0x01, new Writer().writeLong(42n).toBuffer())); // ping
				}
			});
			client.on("error", reject);
		});

		expect(statusJson).toContain('"version"');
		expect(statusJson).toContain(DEFAULT_PERSONA.versionName);

		const event = await promise;
		expect(event.intent).toBe("status");
		expect(event.serverAddress).toBe("mc.example.com");
		expect(event.protocolVersion).toBe(772);
		expect(event.pingCompleted).toBe(true);
		expect(event.srcIp).toBe("127.0.0.1");
	});

	it("captures username + uuid on a login attempt", async () => {
		const { promise, onEvent } = nextEvent();
		const port = await launch(onEvent);

		const uuidBytes = Buffer.from("f84c6a790a4e45e0879fb8f5e5b0d9c1", "hex");
		const loginStart = framed(0x00, new Writer().writeString("Cracker99").writeBytes(uuidBytes).toBuffer());

		const client = net.connect(port, "127.0.0.1", () => {
			client.write(handshake(Intent.Login));
			client.write(loginStart);
		});
		client.on("data", () => {}); // drain the disconnect packet so the socket can close
		client.on("error", () => {});

		const event = await promise;
		expect(event.intent).toBe("login");
		expect(event.username).toBe("Cracker99");
		expect(event.playerUuid).toBe("f84c6a79-0a4e-45e0-879f-b8f5e5b0d9c1");
	});

	it("records a fingerprint and closes on hostile garbage", async () => {
		const { promise, onEvent } = nextEvent();
		const port = await launch(onEvent);

		await new Promise<void>((resolve) => {
			const client = net.connect(port, "127.0.0.1", () => {
				// Oversized packet-length VarInt → parser must reject, not crash.
				client.write(Buffer.from([0xff, 0xff, 0xff, 0xff, 0xff, 0x01]));
			});
			client.on("close", () => resolve());
			client.on("error", () => resolve());
		});

		const event = await promise;
		expect(event.intent).toBe("unknown");
		expect(event.fingerprint).toContain("protocol_error");
	});
});
