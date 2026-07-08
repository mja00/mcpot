import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";

/** Persisted daemon identity. machineId is stable so re-enrollment stays idempotent server-side. */
export interface DaemonState {
	machineId: string;
	daemonId?: string;
	apiKey?: string;
}

/** Load state from disk, generating a fresh machineId on first run. */
export function loadState(stateDir: string): DaemonState {
	const path = statePath(stateDir);
	try {
		return JSON.parse(readFileSync(path, "utf8")) as DaemonState;
	} catch {
		return { machineId: randomUUID() };
	}
}

export function saveState(stateDir: string, state: DaemonState): void {
	const path = statePath(stateDir);
	mkdirSync(dirname(path), { recursive: true });
	// 0600: the file holds the API key, so keep it owner-only.
	writeFileSync(path, JSON.stringify(state, null, 2), { mode: 0o600 });
}

export function hasIdentity(state: DaemonState): state is Required<DaemonState> {
	return Boolean(state.daemonId && state.apiKey);
}

function statePath(stateDir: string): string {
	return join(stateDir, "identity.json");
}
