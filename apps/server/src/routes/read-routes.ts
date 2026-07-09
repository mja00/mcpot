import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { OffenderSortBy, SortOrder } from "@mcpot/shared";
import type { Db } from "../db/client.ts";
import { getOffenders, getOverview, getStats, getTrends, listConnections } from "../db/connections.ts";
import { listDaemons } from "../db/daemons.ts";
import { dashboardAuth } from "../auth/middleware.ts";

const StatsQuery = z.object({ windowMinutes: z.coerce.number().int().min(1).max(10080).default(60) });
const OverviewQuery = z.object({
	windowMinutes: z.coerce.number().int().min(1).max(10080).default(60),
	topLimit: z.coerce.number().int().min(1).max(50).default(10),
});
const TrendsQuery = z.object({ hours: z.coerce.number().int().min(1).max(720).default(24) });
const OffendersQuery = z.object({
	windowHours: z.coerce.number().int().min(1).max(720).default(24),
	limit: z.coerce.number().int().min(1).max(500).default(50),
	offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
	sortBy: OffenderSortBy.default("lastSeen"),
	order: SortOrder.default("desc"),
});
const ConnectionsQuery = z.object({
	limit: z.coerce.number().int().min(1).max(1000).default(100),
	daemonId: z.string().uuid().optional(),
	srcIp: z.string().max(45).optional(),
});

/** Dashboard read APIs. Guarded by dashboardAuth (session token or admin bearer). */
export function registerReadRoutes(app: FastifyInstance, db: Db, adminToken: string, sessionSecret: string): void {
	const auth = dashboardAuth(adminToken, sessionSecret);

	app.get("/v1/stats", { preHandler: auth }, async (req, reply) => {
		const q = StatsQuery.safeParse(req.query);
		if (!q.success) return reply.code(400).send({ error: "validation_failed", issues: q.error.issues });
		return reply.send(await getStats(db, q.data.windowMinutes));
	});

	app.get("/v1/overview", { preHandler: auth }, async (req, reply) => {
		const q = OverviewQuery.safeParse(req.query);
		if (!q.success) return reply.code(400).send({ error: "validation_failed", issues: q.error.issues });
		return reply.send(await getOverview(db, q.data.windowMinutes, q.data.topLimit));
	});

	app.get("/v1/trends", { preHandler: auth }, async (req, reply) => {
		const q = TrendsQuery.safeParse(req.query);
		if (!q.success) return reply.code(400).send({ error: "validation_failed", issues: q.error.issues });
		return reply.send(await getTrends(db, q.data.hours));
	});

	app.get("/v1/offenders", { preHandler: auth }, async (req, reply) => {
		const q = OffendersQuery.safeParse(req.query);
		if (!q.success) return reply.code(400).send({ error: "validation_failed", issues: q.error.issues });
		return reply.send(await getOffenders(db, q.data));
	});

	app.get("/v1/daemons", { preHandler: auth }, async (_req, reply) => {
		return reply.send(await listDaemons(db));
	});

	app.get("/v1/connections", { preHandler: auth }, async (req, reply) => {
		const q = ConnectionsQuery.safeParse(req.query);
		if (!q.success) return reply.code(400).send({ error: "validation_failed", issues: q.error.issues });
		return reply.send(await listConnections(db, q.data));
	});
}
