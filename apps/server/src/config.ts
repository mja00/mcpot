function envInt(name: string, fallback: number): number {
	const raw = process.env[name];
	if (raw === undefined) return fallback;
	const parsed = Number(raw);
	if (!Number.isInteger(parsed)) throw new Error(`${name} must be an integer`);
	return parsed;
}

function boundedEnvInt(name: string, fallback: number, min: number, max: number): number {
	const value = envInt(name, fallback);
	if (value < min || value > max) throw new Error(`${name} must be between ${min} and ${max}`);
	return value;
}

function envBool(name: string, fallback: boolean): boolean {
	const raw = process.env[name];
	if (raw === undefined) return fallback;
	if (raw === "1" || raw.toLowerCase() === "true") return true;
	if (raw === "0" || raw.toLowerCase() === "false") return false;
	throw new Error(`${name} must be true or false`);
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
	/** Optional reporting sinks; all AbuseIPDB attempts share the local daily cap. */
	abuseipdbKey: string | null;
	webhookUrl: string | null;
	abuseipdbDailyLimit: number;
	abuseipdbCheckDailyLimit: number;
	abuseipdbCheckCacheHours: number;
	autoReportEnabled: boolean;
	autoCheckEnabled: boolean;
	autoReportMinScore: number;
	autoReportMinHits: number;
	autoReportWindowHours: number;
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
		retentionDays: boundedEnvInt("RETENTION_DAYS", 90, 1, 3650),
		geoipDir: process.env.GEOIP_DIR ?? "/data/geoip",
		abuseipdbKey: process.env.ABUSEIPDB_KEY ?? null,
		webhookUrl: process.env.WEBHOOK_URL ?? null,
		abuseipdbDailyLimit: boundedEnvInt("ABUSEIPDB_DAILY_LIMIT", 5000, 1, 5000),
		abuseipdbCheckDailyLimit: boundedEnvInt("ABUSEIPDB_CHECK_DAILY_LIMIT", 5000, 1, 5000),
		abuseipdbCheckCacheHours: boundedEnvInt("ABUSEIPDB_CHECK_CACHE_HOURS", 24, 1, 720),
		autoReportEnabled: envBool("ABUSEIPDB_AUTO_REPORT", true),
		autoCheckEnabled: envBool("ABUSEIPDB_AUTO_CHECK", true),
		autoReportMinScore: boundedEnvInt("ABUSEIPDB_AUTO_REPORT_MIN_SCORE", 60, 0, 100),
		autoReportMinHits: boundedEnvInt("ABUSEIPDB_AUTO_REPORT_MIN_HITS", 3, 1, 100000),
		autoReportWindowHours: boundedEnvInt("ABUSEIPDB_AUTO_REPORT_WINDOW_HOURS", 24, 1, 720),
	};
}
