import Fastify, { type FastifyInstance } from "fastify";
import type { Db } from "./db/client.ts";
import { registerDaemonRoutes } from "./routes/daemon-routes.ts";
import { registerAdminRoutes } from "./routes/admin-routes.ts";
import { registerReadRoutes } from "./routes/read-routes.ts";
import { registerAuthRoutes } from "./routes/auth-routes.ts";

export interface BuildAppOptions {
	db: Db;
	adminToken: string;
	adminPassword: string;
	sessionSecret: string;
	abuseipdbKey?: string | null;
	webhookUrl?: string | null;
}

/** Assemble the Fastify app. Kept db-injectable so tests run it against a throwaway database. */
export function buildApp(opts: BuildAppOptions): FastifyInstance {
	const app = Fastify({ logger: false, bodyLimit: 5 * 1024 * 1024 });

	app.get("/health", async () => ({ status: "ok" }));

	const reportConfig = { abuseipdbKey: opts.abuseipdbKey ?? null, webhookUrl: opts.webhookUrl ?? null };
	registerAuthRoutes(app, opts.adminPassword, opts.sessionSecret);
	registerDaemonRoutes(app, opts.db);
	registerAdminRoutes(app, opts.db, opts.adminToken, opts.sessionSecret, reportConfig);
	registerReadRoutes(app, opts.db, opts.adminToken, opts.sessionSecret);

	return app;
}
