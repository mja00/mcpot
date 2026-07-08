import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db/client.ts";
import { getStats, listConnections } from "../db/connections.ts";
import { adminAuth } from "../auth/middleware.ts";

const StatsQuery = z.object({ windowMinutes: z.coerce.number().int().min(1).max(10080).default(60) });
const ConnectionsQuery = z.object({
	limit: z.coerce.number().int().min(1).max(1000).default(100),
	daemonId: z.string().uuid().optional(),
});

/**
 * Dashboard read APIs. Admin-authed for M2; a dedicated dashboard session auth arrives with the web
 * app. All output is DB-derived (validated by drizzle-zod schemas at the source).
 */
export function registerReadRoutes(app: FastifyInstance, db: Db, adminToken: string): void {
	const admin = adminAuth(adminToken);

	app.get("/v1/stats", { preHandler: admin }, async (req, reply) => {
		const q = StatsQuery.safeParse(req.query);
		if (!q.success) return reply.code(400).send({ error: "validation_failed", issues: q.error.issues });
		return reply.send(await getStats(db, q.data.windowMinutes));
	});

	app.get("/v1/connections", { preHandler: admin }, async (req, reply) => {
		const q = ConnectionsQuery.safeParse(req.query);
		if (!q.success) return reply.code(400).send({ error: "validation_failed", issues: q.error.issues });
		return reply.send(await listConnections(db, { limit: q.data.limit, daemonId: q.data.daemonId }));
	});
}
