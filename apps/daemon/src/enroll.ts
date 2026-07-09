import { EnrollResponse } from "@mcpot/shared";
import { apiRequest } from "@mcpot/shared";
import { type DaemonState, hasIdentity, saveState } from "./state.ts";

export interface EnrollOptions {
	serverUrl: string;
	enrollmentToken: string;
	stateDir: string;
	/** Effective display name (env override or os.hostname()), resolved by the caller. */
	hostname: string;
}

/**
 * Ensure the daemon has an identity, enrolling once if not. The persisted machineId makes this safe
 * to call on every boot: a reinstall re-enrolls under the same machineId (same daemon, fresh key)
 * rather than orphaning history.
 */
export async function ensureEnrolled(state: DaemonState, opts: EnrollOptions): Promise<Required<DaemonState>> {
	if (hasIdentity(state)) return state;

	const result = await apiRequest<EnrollResponse>(opts.serverUrl, "/v1/enroll", {
		method: "POST",
		responseSchema: EnrollResponse,
		body: { enrollmentToken: opts.enrollmentToken, machineId: state.machineId, hostname: opts.hostname },
	});

	const enrolled: Required<DaemonState> = {
		machineId: state.machineId,
		daemonId: result.daemonId,
		apiKey: result.apiKey,
	};
	saveState(opts.stateDir, enrolled);
	return enrolled;
}
