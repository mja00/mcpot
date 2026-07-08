import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { issueSession } from "../auth/session.ts";
import { parseBody } from "./validate.ts";

const LoginRequest = z.object({ password: z.string().min(1) });

const SESSION_TTL_SECONDS = 12 * 60 * 60; // 12h

/** Dashboard login: exchange the admin password for a signed session token. */
export function registerAuthRoutes(app: FastifyInstance, adminPassword: string, sessionSecret: string): void {
	const expected = Buffer.from(adminPassword);

	app.post("/v1/auth/login", async (req, reply) => {
		const body = parseBody(LoginRequest, req, reply);
		if (!body) return;
		const got = Buffer.from(body.password);
		if (got.length !== expected.length || !timingSafeEqual(got, expected)) {
			return reply.code(401).send({ error: "invalid password" });
		}
		return reply.send({ token: issueSession(sessionSecret, SESSION_TTL_SECONDS, Date.now()), expiresIn: SESSION_TTL_SECONDS });
	});
}
