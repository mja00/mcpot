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
	const sweep = setInterval(() => limiter.sweep(Date.now()), 60_000);
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
