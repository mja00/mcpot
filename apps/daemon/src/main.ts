import { join } from "node:path";
import { hostname as osHostname } from "node:os";
import { DEFAULT_SETTINGS, fallbackConfig, handlerConfigFrom, loadBootstrap } from "./config.ts";
import { startDaemonServer } from "./server.ts";
import { EventQueue } from "./queue.ts";
import { hasIdentity, loadState } from "./state.ts";
import { ensureEnrolled } from "./enroll.ts";
import { ConfigHolder } from "./config-holder.ts";
import { DaemonAgent } from "./agent.ts";

const boot = loadBootstrap();

if (!boot.serverUrl) {
	// Standalone mode: no central server configured, so just serve and log events (M1 behavior).
	const holder = new ConfigHolder(fallbackConfig("standalone", boot.listenPort));
	const server = startDaemonServer({
		listenPort: boot.listenPort,
		getHandlerConfig: () => handlerConfigFrom(holder),
		maxConcurrentConnections: DEFAULT_SETTINGS.maxConcurrentConnections,
		perIpConnectionsPerMinute: DEFAULT_SETTINGS.perIpConnectionsPerMinute,
		onEvent: (event) => process.stdout.write(`${JSON.stringify(event)}\n`),
	});
	server.on("listening", () =>
		process.stderr.write(
			`mcpot daemon (standalone) listening on :${boot.listenPort} as "${holder.persona.versionName}"\n` +
				`Set MCPOT_SERVER_URL + MCPOT_ENROLLMENT_TOKEN to phone home. Events print below.\n`,
		),
	);
	for (const sig of ["SIGINT", "SIGTERM"] as const) {
		process.on(sig, () => {
			server.close();
			setTimeout(() => process.exit(0), 300).unref(); // don't hang on lingering sockets
		});
	}
} else {
	const state = loadState(boot.stateDir);
	if (!hasIdentity(state) && !boot.enrollmentToken) {
		process.stderr.write("no stored identity and MCPOT_ENROLLMENT_TOKEN not set — cannot enroll\n");
		process.exit(1);
	}

	const displayName = boot.hostname ?? osHostname();
	const identity = await ensureEnrolled(state, {
		serverUrl: boot.serverUrl,
		enrollmentToken: boot.enrollmentToken ?? "",
		stateDir: boot.stateDir,
		hostname: displayName,
	});

	// Serve with fallback config immediately; the agent's first poll swaps in the real config.
	const holder = new ConfigHolder(fallbackConfig(identity.daemonId, boot.listenPort));
	const queue = new EventQueue(join(boot.stateDir, "queue.sqlite"), holder.get().settings.maxQueueEvents);

	const server = startDaemonServer({
		listenPort: boot.listenPort,
		getHandlerConfig: () => handlerConfigFrom(holder),
		maxConcurrentConnections: holder.get().settings.maxConcurrentConnections,
		perIpConnectionsPerMinute: holder.get().settings.perIpConnectionsPerMinute,
		onEvent: (event) => queue.enqueue(event),
	});

	const agent = new DaemonAgent({
		serverUrl: boot.serverUrl,
		daemonId: identity.daemonId,
		apiKey: identity.apiKey,
		queue,
		config: holder,
		hostname: displayName,
	});
	agent.start();

	server.on("listening", () =>
		process.stderr.write(
			`mcpot daemon listening on :${boot.listenPort}, phoning home to ${boot.serverUrl} (daemon ${identity.daemonId})\n`,
		),
	);

	for (const sig of ["SIGINT", "SIGTERM"] as const) {
		process.on(sig, () => {
			agent.stop();
			server.close();
			// WAL keeps the queue durable without an explicit close; force exit so we never hang.
			setTimeout(() => process.exit(0), 300).unref();
		});
	}
}
