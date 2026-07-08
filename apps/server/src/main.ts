import { buildApp } from "./app.ts";
import { createClient, createDb } from "./db/client.ts";
import { loadServerConfig } from "./config.ts";

const config = loadServerConfig();
const client = createClient(config.databaseUrl);
const db = createDb(client);
const app = buildApp({ db, adminToken: config.adminToken });

try {
	await app.listen({ port: config.port, host: config.host });
	process.stderr.write(`mcpot server listening on ${config.host}:${config.port}\n`);
} catch (err) {
	process.stderr.write(`failed to start: ${String(err)}\n`);
	process.exit(1);
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
	process.on(sig, () => {
		void app.close().then(() => client.end()).then(() => process.exit(0));
	});
}
