/**
 * Heuristic scanner-vs-prober classification for a source IP, from aggregated signals over a window.
 * Every connection to a honeypot is unsolicited, so this scores *how automated* the source looks, not
 * whether it's malicious. Structural tells (raw-IP hostname, fleet-wide spread, abnormal protocol) are
 * weighted highest because they're hard to fake and don't rely on username analysis.
 */
export interface OffenderSignals {
	hits: number;
	logins: number;
	daemonsHit: number;
	/** Connections where the client used a raw IP literal as the hostname (vs a domain). */
	rawHostnameHits: number;
	/** Connections with a null/≤0 protocol version (tooling probing). */
	abnormalProtoHits: number;
	/** Distinct usernames seen from this IP (name/credential spraying → bot). */
	distinctUsernames: number;
}

export type Classification = "scanner" | "suspicious" | "prober";

// Shared with the SQL score mirror in getOffenders (db/connections.ts) so DB-side ordering stays in sync.
export const SCORE_WEIGHTS = {
	rawHostname: 40,
	multiDaemon: 30,
	abnormalProto: 20,
	reconOnly: 10,
	usernameSpray: 20,
} as const;
export const RAW_HOSTNAME_RATIO = 0.8;
export const USERNAME_SPRAY_MIN = 3;

export interface ClassificationResult {
	score: number; // 0-100
	label: Classification;
}

export function classify(s: OffenderSignals): ClassificationResult {
	let score = 0;
	// Connected mostly by raw IP → blind internet scan, not a human typing a domain.
	if (s.hits > 0 && s.rawHostnameHits / s.hits > RAW_HOSTNAME_RATIO) score += SCORE_WEIGHTS.rawHostname;
	// Hit more than one honeypot → sweeping our address space.
	if (s.daemonsHit > 1) score += SCORE_WEIGHTS.multiDaemon;
	// Non-vanilla / probing protocol values.
	if (s.abnormalProtoHits > 0) score += SCORE_WEIGHTS.abnormalProto;
	// Recon-only: pinged status, never attempted a login.
	if (s.logins === 0) score += SCORE_WEIGHTS.reconOnly;
	// Many different usernames from one IP → automated name spraying.
	if (s.distinctUsernames >= USERNAME_SPRAY_MIN) score += SCORE_WEIGHTS.usernameSpray;

	score = Math.min(score, 100);
	const label: Classification = score >= 60 ? "scanner" : score >= 30 ? "suspicious" : "prober";
	return { score, label };
}
