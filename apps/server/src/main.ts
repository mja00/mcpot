import { buildApp } from "./app.ts";
import { createClient, createDb } from "./db/client.ts";
import { loadServerConfig } from "./config.ts";
import { scheduleRetention } from "./retention.ts";
import { createGeoService } from "./geo.ts";

const config = loadServerConfig();
const client = createClient(config.databaseUrl);
const db = createDb(client);
const geo = await createGeoService(config.geoipDir);
const app = buildApp({
	db,
	adminToken: config.adminToken,
	adminPassword: config.adminPassword,
	sessionSecret: config.sessionSecret,
	abuseipdbKey: config.abuseipdbKey,
	webhookUrl: config.webhookUrl,
	abuseipdbDailyLimit: config.abuseipdbDailyLimit,
	abuseipdbCheckDailyLimit: config.abuseipdbCheckDailyLimit,
	abuseipdbCheckCacheHours: config.abuseipdbCheckCacheHours,
	autoReportEnabled: config.autoReportEnabled,
	autoCheckEnabled: config.autoCheckEnabled,
	autoReportMinScore: config.autoReportMinScore,
	autoReportMinHits: config.autoReportMinHits,
	autoReportWindowHours: config.autoReportWindowHours,
	geo,
});

const retention = scheduleRetention(db, config.retentionDays, (n) => {
	if (n > 0) process.stderr.write(`retention: purged ${n} connections older than ${config.retentionDays}d\n`);
});

try {
	await app.listen({ port: config.port, host: config.host });
	process.stderr.write(`mcpot server listening on ${config.host}:${config.port} (retention ${config.retentionDays}d)\n`);
} catch (err) {
	process.stderr.write(`failed to start: ${String(err)}\n`);
	process.exit(1);
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
	process.on(sig, () => {
		retention.stop();
		void app.close().then(() => client.end()).then(() => process.exit(0));
	});
}
