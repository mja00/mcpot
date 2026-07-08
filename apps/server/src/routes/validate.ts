import type { FastifyReply, FastifyRequest } from "fastify";
import type { z } from "zod";

/** Parse+validate a request body against a zod schema, sending a 400 and returning undefined on failure. */
export function parseBody<T>(schema: z.ZodType<T>, req: FastifyRequest, reply: FastifyReply): T | undefined {
	const result = schema.safeParse(req.body);
	if (!result.success) {
		reply.code(400).send({ error: "validation_failed", issues: result.error.issues });
		return undefined;
	}
	return result.data;
}
