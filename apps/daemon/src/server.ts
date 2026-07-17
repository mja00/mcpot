import { randomUUID } from "node:crypto";
import net, { type Server, type Socket } from "node:net";
import type { ConnectionEvent } from "@mcpot/shared";
import { ConnectionHandler, type HandlerConfig } from "./connection-handler.ts";
import { ConnectionLimiter } from "./limits.ts";
import { normalizeIp } from "./net-util.ts";

export interface DaemonServerOptions {
	listenPort: number;
	/** Read per-connection so persona/timeout changes from a config poll take effect live. */
	getHandlerConfig: () => HandlerConfig;
	// Limits are applied once at accept time; changing them needs a restart (acceptable for now).
	maxConcurrentConnections: number;
	perIpConnectionsPerMinute: number;
	onEvent: (event: ConnectionEvent) => void;
}

/** Starts the fake Minecraft TCP listener. Returns the server so callers can close it in tests. */
export function startDaemonServer(opts: DaemonServerOptions): Server {
	const limiter = new ConnectionLimiter({
		maxConcurrent: opts.maxConcurrentConnections,
		perIpPerMinute: opts.perIpConnectionsPerMinute,
	});
	const sweep = setInterval(() => {
		limiter.sweep(Date.now());
		// One aggregated event per flooding IP per sweep — bounded, so a flood can't amplify the
		// ingest pipeline it triggered while still making the dropped volume visible to scoring.
		for (const { ip, count } of limiter.drainDrops()) opts.onEvent(rateLimitedEvent(ip, count));
	}, 60_000);
	sweep.unref();

	const server = net.createServer((socket: Socket) => {
		const ip = normalizeIp(socket.remoteAddress ?? "unknown");
		if (!limiter.tryAdmit(ip, Date.now())) {
			socket.destroy(); // over a limit: drop silently, a real overloaded server would too
			return;
		}
		socket.once("close", () => limiter.release());

		const handler = new ConnectionHandler(socket, opts.getHandlerConfig(), opts.onEvent);
		handler.start();
	});

	server.on("close", () => clearInterval(sweep));
	server.listen(opts.listenPort);
	return server;
}

/** Synthetic event summarizing connections the limiter dropped for one IP since the last sweep. */
function rateLimitedEvent(ip: string, count: number): ConnectionEvent {
	return {
		eventId: randomUUID(),
		observedAt: new Date().toISOString(),
		srcIp: ip,
		srcPort: 0,
		protocolVersion: null,
		serverAddress: "",
		serverPort: 0,
		intent: "unknown",
		pingCompleted: false,
		username: null,
		playerUuid: null,
		fingerprint: "rate_limited",
		droppedCount: count,
	};
}
