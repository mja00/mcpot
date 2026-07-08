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
	/** Bearer secret for admin routes (token minting, revocation). Real session auth comes later. */
	adminToken: string;
}

export function loadServerConfig(): ServerConfig {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) throw new Error("DATABASE_URL is required");
	const adminToken = process.env.ADMIN_TOKEN;
	if (!adminToken) throw new Error("ADMIN_TOKEN is required");
	return {
		port: envInt("PORT", 8080),
		host: process.env.HOST ?? "0.0.0.0",
		databaseUrl,
		adminToken,
	};
}
