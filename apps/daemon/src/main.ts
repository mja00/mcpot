import { loadConfig } from "./config.ts";
import { startDaemonServer } from "./server.ts";

// M1: log each captured connection as a JSON line to stdout. M3 swaps this sink for the durable
// phone-home queue; the ConnectionEvent shape stays identical.
const config = loadConfig();

const server = startDaemonServer({
	...config,
	onEvent: (event) => process.stdout.write(`${JSON.stringify(event)}\n`),
});

server.on("listening", () => {
	process.stderr.write(
		`mcpot daemon listening on :${config.listenPort} as "${config.persona.versionName}" (protocol ${config.persona.protocol})\n` +
			`In a Minecraft client, add a server pointing at <this-host>:${config.listenPort} (e.g. 127.0.0.1:${config.listenPort}).\n` +
			`Each connection is printed below as a JSON line.\n`,
	);
});

for (const sig of ["SIGINT", "SIGTERM"] as const) {
	process.on(sig, () => server.close(() => process.exit(0)));
}
