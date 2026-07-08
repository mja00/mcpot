/**
 * Status Response JSON shape (wiki.vg "Status Response"). Field order here mirrors vanilla
 * (version, players, description, favicon, enforcesSecureChat) — sophisticated scanners diff
 * ordering/whitespace to fingerprint fake servers, so we emit it consistently.
 */
export interface StatusPlayerSample {
	readonly name: string;
	/** Canonical 8-4-4-4-12 UUID. */
	readonly id: string;
}

export interface StatusResponse {
	readonly version: { readonly name: string; readonly protocol: number };
	readonly players: {
		readonly max: number;
		readonly online: number;
		readonly sample?: readonly StatusPlayerSample[];
	};
	/** Chat component; a plain `{ text }` is valid and most common. */
	readonly description: { readonly text: string } | Record<string, unknown>;
	/** `data:image/png;base64,...` of a 64x64 PNG, when present. */
	readonly favicon?: string;
	readonly enforcesSecureChat?: boolean;
}

/** Serialize with a fixed key order so output is byte-stable and vanilla-like. */
export function serializeStatus(status: StatusResponse): string {
	const ordered: Record<string, unknown> = {
		version: status.version,
		players: status.players,
		description: status.description,
	};
	if (status.favicon !== undefined) ordered.favicon = status.favicon;
	if (status.enforcesSecureChat !== undefined) ordered.enforcesSecureChat = status.enforcesSecureChat;
	return JSON.stringify(ordered);
}
