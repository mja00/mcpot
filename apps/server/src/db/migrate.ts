import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createClient, createDb } from "./client.ts";

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "drizzle");

/** Apply drizzle-kit-generated migrations. Used by tests; the CLI `migrate` script covers ops. */
export async function runMigrations(url?: string): Promise<void> {
	const client = createClient(url);
	try {
		await migrate(createDb(client), { migrationsFolder });
	} finally {
		await client.end();
	}
}

if (import.meta.url === `file://${process.argv[1]}`) {
	await runMigrations();
	process.stdout.write("migrations applied\n");
}
