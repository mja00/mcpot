import { timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Db } from "../db/client.ts";
import { findDaemonByApiKey } from "../db/daemons.ts";
import { hashSecret } from "./keys.ts";

declare module "fastify" {
	interface FastifyRequest {
		daemonId?: string;
	}
}

function bearer(req: FastifyRequest): string | null {
	const header = req.headers.authorization;
	if (!header?.startsWith("Bearer ")) return null;
	return header.slice("Bearer ".length);
}

/**
 * Authenticates a daemon by API key and pins request.daemonId. Routes with an :id param must also
 * pass requireOwnDaemon so a leaked key can only submit as its own daemon, never forge the fleet.
 */
export function daemonAuth(db: Db) {
	return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
		const key = bearer(req);
		if (!key) return void reply.code(401).send({ error: "missing bearer token" });
		const daemon = await findDaemonByApiKey(db, hashSecret(key));
		if (!daemon || daemon.revoked) return void reply.code(401).send({ error: "invalid or revoked key" });
		req.daemonId = daemon.id;
	};
}

/** Enforce that the authenticated daemon owns the :id it is acting on. */
export async function requireOwnDaemon(req: FastifyRequest, reply: FastifyReply): Promise<void> {
	const { id } = req.params as { id?: string };
	if (!req.daemonId || req.daemonId !== id) {
		return void reply.code(403).send({ error: "daemon may only act on itself" });
	}
}

/** Constant-time admin bearer check for operator routes (token minting / revocation). */
export function adminAuth(adminToken: string) {
	const expected = Buffer.from(adminToken);
	return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
		const key = bearer(req);
		const got = key ? Buffer.from(key) : Buffer.alloc(0);
		if (got.length !== expected.length || !timingSafeEqual(got, expected)) {
			return void reply.code(401).send({ error: "admin auth required" });
		}
	};
}
