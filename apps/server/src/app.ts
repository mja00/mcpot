import Fastify, { type FastifyInstance } from "fastify";
import type { Db } from "./db/client.ts";
import { registerDaemonRoutes } from "./routes/daemon-routes.ts";
import { registerAdminRoutes } from "./routes/admin-routes.ts";
import { registerReadRoutes } from "./routes/read-routes.ts";
import { registerAuthRoutes } from "./routes/auth-routes.ts";
import { registerStreamRoutes } from "./routes/stream-routes.ts";
import { type GeoService, noopGeo } from "./geo.ts";
import { createEventBus } from "./events/bus.ts";
import { AutomaticReporter, ReportingService } from "./report.ts";

export interface BuildAppOptions {
	db: Db;
	adminToken: string;
	adminPassword: string;
	sessionSecret: string;
	abuseipdbKey?: string | null;
	webhookUrl?: string | null;
	abuseipdbDailyLimit?: number;
	abuseipdbCheckDailyLimit?: number;
	abuseipdbCheckCacheHours?: number;
	autoReportEnabled?: boolean;
	autoCheckEnabled?: boolean;
	autoReportMinScore?: number;
	autoReportMinHits?: number;
	autoReportWindowHours?: number;
	reportFetch?: typeof fetch;
	geo?: GeoService;
}

/** Assemble the Fastify app. Kept db-injectable so tests run it against a throwaway database. */
export function buildApp(opts: BuildAppOptions): FastifyInstance {
	const app = Fastify({ logger: false, bodyLimit: 5 * 1024 * 1024 });

	app.get("/health", async () => ({ status: "ok" }));

	const bus = createEventBus();
	const reporting = new ReportingService(
		opts.db,
		{
			abuseipdbKey: opts.abuseipdbKey ?? null,
			webhookUrl: opts.webhookUrl ?? null,
			abuseipdbDailyLimit: opts.abuseipdbDailyLimit ?? 5000,
			abuseipdbCheckDailyLimit: opts.abuseipdbCheckDailyLimit ?? 5000,
			abuseipdbCheckCacheHours: opts.abuseipdbCheckCacheHours ?? 24,
		},
		opts.reportFetch,
	);
	const autoReporter = new AutomaticReporter(opts.db, reporting, {
		enabled: opts.autoReportEnabled ?? Boolean(opts.abuseipdbKey),
		minScore: opts.autoReportMinScore ?? 60,
		minHits: opts.autoReportMinHits ?? 3,
		windowHours: opts.autoReportWindowHours ?? 24,
		checkEnabled: opts.autoCheckEnabled ?? Boolean(opts.abuseipdbKey),
		checkCacheHours: opts.abuseipdbCheckCacheHours ?? 24,
	});
	registerAuthRoutes(app, opts.adminPassword, opts.sessionSecret);
	registerDaemonRoutes(app, opts.db, opts.geo ?? noopGeo, bus, autoReporter);
	registerAdminRoutes(app, opts.db, opts.adminToken, opts.sessionSecret, reporting);
	registerReadRoutes(app, opts.db, opts.adminToken, opts.sessionSecret);
	registerStreamRoutes(app, bus, opts.adminToken, opts.sessionSecret);
	app.addHook("onClose", async () => autoReporter.stop());

	return app;
}
