// One-shot local dev loop: build libs, migrate, then run server + daemon + web together with
// prefixed, interleaved logs in a single shell. The daemon auto-enrolls with a freshly minted token
// on first run (identity persists after). Ctrl+C tears everything down.
//
//   pnpm dev
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createInterface } from "node:readline";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://mcpot:mcpot@localhost:55432/mcpot";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? "dev-admin-token";
const SERVER_PORT = process.env.PORT ?? "8080";
const SERVER_URL = `http://localhost:${SERVER_PORT}`;
const DAEMON_PORT = process.env.MCPOT_PORT ?? "25565";
const DAEMON_STATE_DIR = "./data/dev-daemon";

const NODE_TS = ["--experimental-transform-types", "--disable-warning=ExperimentalWarning"];
const colors = { dev: "\x1b[90m", server: "\x1b[36m", daemon: "\x1b[32m", web: "\x1b[35m" };
const RESET = "\x1b[0m";
const children = [];
let shuttingDown = false;

function log(name, line) {
	process.stdout.write(`${colors[name] ?? ""}[${name}]${RESET} ${line}\n`);
}

/** Spawn a long-running child and stream its output line-by-line with a colored prefix. */
function run(name, command, args, env) {
	// detached:true puts the child in its own process group so `vite` (a grandchild via pnpm) can be
	// torn down as a group and doesn't receive the terminal's Ctrl+C directly — we own shutdown.
	const child = spawn(command, args, { env: { ...process.env, ...env }, detached: true });
	for (const stream of [child.stdout, child.stderr]) {
		createInterface({ input: stream }).on("line", (line) => log(name, line));
	}
	child.on("exit", (code) => {
		if (!shuttingDown) {
			log("dev", `${name} exited (code ${code}) — shutting down`);
			shutdown(code ?? 1);
		}
	});
	children.push(child);
	return child;
}

function killGroup(pid, signal) {
	try {
		process.kill(-pid, signal); // negative pid = the child's whole process group
	} catch {
		// already gone
	}
}

function shutdown(code) {
	if (shuttingDown) return;
	shuttingDown = true;
	for (const c of children) killGroup(c.pid, "SIGTERM");
	// Escalate to SIGKILL for anything that didn't stop, then exit no matter what.
	setTimeout(() => {
		for (const c of children) killGroup(c.pid, "SIGKILL");
		process.exit(code);
	}, 1500);
}

async function waitForHealth(timeoutMs) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			const res = await fetch(`${SERVER_URL}/health`);
			if (res.ok) return true;
		} catch {
			// not up yet
		}
		await new Promise((r) => setTimeout(r, 500));
	}
	return false;
}

async function mintToken() {
	const res = await fetch(`${SERVER_URL}/v1/admin/tokens`, {
		method: "POST",
		headers: { authorization: `Bearer ${ADMIN_TOKEN}`, "content-type": "application/json" },
		body: "{}",
	});
	const { token } = await res.json();
	return token;
}

// --- setup phase (blocking, output inherited) ---
log("dev", "building libraries…");
if (spawnSync("pnpm", ["libs"], { stdio: "inherit" }).status !== 0) process.exit(1);

log("dev", "applying migrations…");
const migrate = spawnSync("pnpm", ["--filter", "@mcpot/server", "migrate"], {
	stdio: "inherit",
	env: { ...process.env, DATABASE_URL },
});
if (migrate.status !== 0) {
	log("dev", "migration failed — is Postgres up? run `pnpm db:up` first.");
	process.exit(1);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

// --- server ---
run("server", "node", [...NODE_TS, "apps/server/src/main.ts"], {
	DATABASE_URL,
	ADMIN_TOKEN,
	PORT: SERVER_PORT,
});

if (!(await waitForHealth(20_000))) {
	log("dev", "server did not become healthy in time");
	shutdown(1);
}
log("dev", `server healthy at ${SERVER_URL}`);

// --- daemon (auto-enroll on first run) ---
const daemonEnv = {
	MCPOT_SERVER_URL: SERVER_URL,
	MCPOT_STATE_DIR: DAEMON_STATE_DIR,
	MCPOT_PORT: DAEMON_PORT,
};
if (!existsSync(`${DAEMON_STATE_DIR}/identity.json`)) {
	log("dev", "no daemon identity yet — minting an enrollment token");
	daemonEnv.MCPOT_ENROLLMENT_TOKEN = await mintToken();
}
run("daemon", "node", [...NODE_TS, "apps/daemon/src/main.ts"], daemonEnv);

// --- web ---
run("web", "pnpm", ["--filter", "@mcpot/web", "dev"], {
	ADMIN_TOKEN,
	VITE_API_TARGET: SERVER_URL,
});

log("dev", "all services starting — Ctrl+C to stop. Dashboard: http://localhost:5173");
