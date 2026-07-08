import type { FastifyInstance } from "fastify";
import { EnrollRequest, HeartbeatRequest, IngestRequest } from "@mcpot/shared";
import type { Db } from "../db/client.ts";
import { enrollDaemon, getDaemonConfig, recordHeartbeat } from "../db/daemons.ts";
import { consumeEnrollmentToken } from "../db/tokens.ts";
import { ingestEvents } from "../db/connections.ts";
import { daemonAuth, requireOwnDaemon } from "../auth/middleware.ts";
import { parseBody } from "./validate.ts";
import type { GeoService } from "../geo.ts";

/** Daemon-facing endpoints: enrollment, event ingest, config poll, heartbeat. */
export function registerDaemonRoutes(app: FastifyInstance, db: Db, geo: GeoService): void {
	const auth = daemonAuth(db);

	app.post("/v1/enroll", async (req, reply) => {
		const body = parseBody(EnrollRequest, req, reply);
		if (!body) return;
		const ok = await consumeEnrollmentToken(db, body.enrollmentToken);
		if (!ok) return reply.code(401).send({ error: "invalid or expired enrollment token" });
		const result = await enrollDaemon(db, body.machineId, body.hostname ?? null);
		return reply.code(201).send(result);
	});

	app.post("/v1/ingest", { preHandler: auth }, async (req, reply) => {
		const body = parseBody(IngestRequest, req, reply);
		if (!body) return;
		const result = await ingestEvents(db, geo, req.daemonId!, body.events);
		return reply.send(result);
	});

	app.get("/v1/daemons/:id/config", { preHandler: [auth, requireOwnDaemon] }, async (req, reply) => {
		const config = await getDaemonConfig(db, req.daemonId!);
		if (!config) return reply.code(404).send({ error: "daemon not found" });
		return reply.send(config);
	});

	app.post("/v1/daemons/:id/heartbeat", { preHandler: [auth, requireOwnDaemon] }, async (req, reply) => {
		const body = parseBody(HeartbeatRequest, req, reply);
		if (!body) return;
		await recordHeartbeat(db, req.daemonId!, body);
		return reply.code(204).send();
	});
}
