function envInt(name: string, fallback: number): number {
	const raw = process.env[name];
	if (raw === undefined) return fallback;
	const parsed = Number.parseInt(raw, 10);
	return Number.isFinite(parsed) ? parsed : fallback;
}

export interface ServerConfig {
	port: number;
	host: string;
	databaseUrl: string;
	/** Bearer secret for machine/CI admin calls (token minting, scripts). */
	adminToken: string;
	/** Password the dashboard operator logs in with. */
	adminPassword: string;
	/** HMAC key for signing dashboard session tokens. */
	sessionSecret: string;
	/** Raw connection events older than this are purged daily (PII retention + table growth). */
	retentionDays: number;
	/** Directory holding GeoLite2 mmdb files; lookups degrade to null when they're absent. */
	geoipDir: string;
	/** Optional reporting sinks; reporting is manual/gated and no-ops when unset. */
	abuseipdbKey: string | null;
	webhookUrl: string | null;
}

export function loadServerConfig(): ServerConfig {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) throw new Error("DATABASE_URL is required");
	const adminToken = process.env.ADMIN_TOKEN;
	if (!adminToken) throw new Error("ADMIN_TOKEN is required");
	const adminPassword = process.env.ADMIN_PASSWORD;
	if (!adminPassword) throw new Error("ADMIN_PASSWORD is required");
	const sessionSecret = process.env.SESSION_SECRET;
	if (!sessionSecret) throw new Error("SESSION_SECRET is required");
	return {
		port: envInt("PORT", 8080),
		host: process.env.HOST ?? "0.0.0.0",
		databaseUrl,
		adminToken,
		adminPassword,
		sessionSecret,
		retentionDays: envInt("RETENTION_DAYS", 90),
		geoipDir: process.env.GEOIP_DIR ?? "/data/geoip",
		abuseipdbKey: process.env.ABUSEIPDB_KEY ?? null,
		webhookUrl: process.env.WEBHOOK_URL ?? null,
	};
}
