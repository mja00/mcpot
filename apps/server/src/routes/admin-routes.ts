import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db/client.ts";
import { revokeDaemon } from "../db/daemons.ts";
import { createEnrollmentToken } from "../db/tokens.ts";
import { adminAuth } from "../auth/middleware.ts";
import { parseBody } from "./validate.ts";

const CreateTokenRequest = z.object({
	label: z.string().max(128).optional(),
	singleUse: z.boolean().optional(),
	expiresInHours: z.number().int().min(1).max(8760).optional(),
});

/** Operator endpoints: mint enrollment tokens, revoke a daemon's key. */
export function registerAdminRoutes(app: FastifyInstance, db: Db, adminToken: string): void {
	const admin = adminAuth(adminToken);

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
}
