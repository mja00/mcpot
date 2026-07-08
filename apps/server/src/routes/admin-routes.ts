import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db/client.ts";
import { revokeDaemon } from "../db/daemons.ts";
import { createEnrollmentToken } from "../db/tokens.ts";
import { dashboardAuth } from "../auth/middleware.ts";
import { type ReportConfig, reportIp } from "../report.ts";
import { parseBody } from "./validate.ts";

const CreateTokenRequest = z.object({
	label: z.string().max(128).optional(),
	singleUse: z.boolean().optional(),
	expiresInHours: z.number().int().min(1).max(8760).optional(),
});

const ReportRequest = z.object({ srcIp: z.string().min(1).max(45) });

/** Operator endpoints: mint enrollment tokens, revoke a daemon's key, manually report an offender. */
export function registerAdminRoutes(
	app: FastifyInstance,
	db: Db,
	adminToken: string,
	sessionSecret: string,
	reportConfig: ReportConfig,
): void {
	const admin = dashboardAuth(adminToken, sessionSecret);

	app.post("/v1/admin/tokens", { preHandler: admin }, async (req, reply) => {
		const body = parseBody(CreateTokenRequest, req, reply);
		if (!body) return;
		const expiresAt = body.expiresInHours ? new Date(Date.now() + body.expiresInHours * 3_600_000) : null;
		const { token } = await createEnrollmentToken(db, {
			label: body.label,
			singleUse: body.singleUse,
			expiresAt,
		});
		return reply.code(201).send({ token });
	});

	app.post("/v1/admin/daemons/:id/revoke", { preHandler: admin }, async (req, reply) => {
		const { id } = req.params as { id: string };
		await revokeDaemon(db, id);
		return reply.code(204).send();
	});

	// Manual, human-in-the-loop reporting. No-ops (reported:false) when no sink is configured.
	app.post("/v1/admin/report", { preHandler: admin }, async (req, reply) => {
		const body = parseBody(ReportRequest, req, reply);
		if (!body) return;
		try {
			return reply.send(await reportIp(reportConfig, body.srcIp));
		} catch {
			return reply.code(400).send({ error: "invalid IP" });
		}
	});
}
