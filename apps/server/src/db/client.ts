import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";

export type Db = ReturnType<typeof createDb>;

/** Underlying postgres.js connection — kept separate so callers/tests can `.end()` it. */
export function createClient(url: string = requireDatabaseUrl()): postgres.Sql {
	// Honeypot ingest is bursty; a modest pool with fast idle recycling is plenty.
	return postgres(url, { max: 10, idle_timeout: 20 });
}

export function createDb(client: postgres.Sql) {
	return drizzle(client, { schema });
}

export function requireDatabaseUrl(): string {
	const url = process.env.DATABASE_URL;
	if (!url) throw new Error("DATABASE_URL is required");
	return url;
}
