import type { FastifyInstance } from "fastify";
import type { EventBus } from "../events/bus.ts";
import { dashboardAuth } from "../auth/middleware.ts";

/**
 * SSE fan-out for the dashboard. The reply is hijacked so Fastify's serialization/lifecycle stays
 * out of the way of an infinite response. Clients are expected to refetch their lists on
 * (re)connect rather than rely on replay — events are durably persisted and every list has a read
 * endpoint, so a Last-Event-ID replay buffer would be complexity without benefit here.
 */
export function registerStreamRoutes(app: FastifyInstance, bus: EventBus, adminToken: string, sessionSecret: string): void {
	const auth = dashboardAuth(adminToken, sessionSecret);

	app.get("/v1/events/stream", { preHandler: auth }, (req, reply) => {
		reply.hijack();
		const res = reply.raw;
		res.writeHead(200, {
			"content-type": "text/event-stream",
			// no-transform + x-accel-buffering keep proxies (nginx) from buffering the stream.
			"cache-control": "no-cache, no-transform",
			"x-accel-buffering": "no",
		});
		res.write("retry: 3000\n\n");

		const send = (event: string, id: string | null, data: unknown): void => {
			// A client that can't drain 1 MB of pending events is effectively gone; drop it and let
			// the reconnect + refetch path heal the gap instead of queueing unbounded memory.
			if (res.writableLength > 1_000_000) {
				res.destroy();
				return;
			}
			res.write(`event: ${event}\n${id ? `id: ${id}\n` : ""}data: ${JSON.stringify(data)}\n\n`);
		};

		const unsubscribe = bus.subscribe({
			onConnection: (c) => send("connection", c.eventId, c),
			onDaemon: (d) => send("daemon", null, d),
		});
		// Comment frames defeat idle timeouts in intermediaries; 25s stays under nginx's default 60s.
		const heartbeat = setInterval(() => res.write(": ping\n\n"), 25_000);

		req.raw.on("close", () => {
			clearInterval(heartbeat);
			unsubscribe();
		});
	});
}
