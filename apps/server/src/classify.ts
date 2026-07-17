/**
 * Heuristic scanner-vs-prober classification for a source IP, from aggregated signals over a window.
 * Every connection to a honeypot is unsolicited, so this scores *how automated* the source looks, not
 * whether it's malicious. Structural tells (raw-IP hostname, fleet-wide spread, protocol anomalies) are
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
	/** Connections with a fingerprint anomaly (timeouts, protocol errors, legacy pings) — no vanilla client produces these. */
	anomalyHits: number;
	/** Status handshakes that never completed the ping exchange — scanners grab the MOTD and bail. */
	incompletePingHits: number;
	/** Distinct handshake hostnames from one IP — hostname replay / churn is scanner tooling. */
	distinctAddresses: number;
	/** Distinct valid protocol versions from one IP — version probing. */
	distinctProtocols: number;
	/** Connections the daemon rate limiter dropped (sum of dropped_count) — flood volume. */
	rateLimitedDrops: number;
}

export type Classification = "scanner" | "suspicious" | "prober";

/** Signals classify() derives from OffenderSignals before evaluating terms. */
export interface DerivedSignals extends OffenderSignals {
	rawHostnameRatio: number;
}

export type ScoreTermOp = "gt" | "gte" | "eq";

export interface ScoreTerm {
	/** Stable id — referenced by tests and UI tooltips. */
	key: string;
	signal: keyof DerivedSignals;
	op: ScoreTermOp;
	threshold: number;
	weight: number;
}

/**
 * The single source of truth for the score formula. The SQL ORDER BY expression in db/connections.ts
 * is generated from this table, so TS and DB scores can't drift. Terms are additive; the raw sum
 * exceeds 100 by design and is capped, so no single tell dominates but stacked tells saturate.
 */
export const SCORE_TERMS: readonly ScoreTerm[] = [
	// Connected mostly by raw IP → blind internet scan, not a human typing a domain.
	{ key: "rawHostname", signal: "rawHostnameRatio", op: "gt", threshold: 0.8, weight: 30 },
	// Hit more than one honeypot → sweeping our address space.
	{ key: "multiDaemon", signal: "daemonsHit", op: "gt", threshold: 1, weight: 25 },
	// Hit 3+ honeypots → fleet-wide sweep; stacks on multiDaemon.
	{ key: "fleetSweep", signal: "daemonsHit", op: "gte", threshold: 3, weight: 10 },
	// Any fingerprint anomaly (masscan bare connects, garbage payloads, legacy pings).
	{ key: "anomaly", signal: "anomalyHits", op: "gt", threshold: 0, weight: 15 },
	// Non-vanilla / probing protocol values.
	{ key: "abnormalProto", signal: "abnormalProtoHits", op: "gt", threshold: 0, weight: 10 },
	// Many different usernames from one IP → automated name spraying.
	{ key: "usernameSpray", signal: "distinctUsernames", op: "gte", threshold: 3, weight: 20 },
	// Many different handshake hostnames from one IP → replaying recorded handshakes.
	{ key: "addressChurn", signal: "distinctAddresses", op: "gte", threshold: 3, weight: 15 },
	// Many valid-but-different protocol versions → version-probing tooling.
	{ key: "protoChurn", signal: "distinctProtocols", op: "gte", threshold: 3, weight: 10 },
	// Repeatedly requests status but never completes the ping — MOTD harvesting.
	{ key: "incompletePing", signal: "incompletePingHits", op: "gte", threshold: 2, weight: 10 },
	// Recon-only: never attempted a login. Weak tell (true of most traffic), so weighted low.
	{ key: "reconOnly", signal: "logins", op: "eq", threshold: 0, weight: 5 },
	// Tripped the daemon rate limiter hard → flood, not a client.
	{ key: "rateLimitedDrops", signal: "rateLimitedDrops", op: "gte", threshold: 30, weight: 15 },
] as const;

export const SCANNER_MIN_SCORE = 60;
export const SUSPICIOUS_MIN_SCORE = 30;

export interface ClassificationResult {
	score: number; // 0-100
	label: Classification;
}

function termMatches(value: number, op: ScoreTermOp, threshold: number): boolean {
	switch (op) {
		case "gt":
			return value > threshold;
		case "gte":
			return value >= threshold;
		case "eq":
			return value === threshold;
	}
}

export function classify(s: OffenderSignals): ClassificationResult {
	const derived: DerivedSignals = { ...s, rawHostnameRatio: s.hits > 0 ? s.rawHostnameHits / s.hits : 0 };
	let score = 0;
	for (const term of SCORE_TERMS) {
		if (termMatches(derived[term.signal], term.op, term.threshold)) score += term.weight;
	}

	score = Math.min(score, 100);
	const label: Classification = score >= SCANNER_MIN_SCORE ? "scanner" : score >= SUSPICIOUS_MIN_SCORE ? "suspicious" : "prober";
	return { score, label };
}
