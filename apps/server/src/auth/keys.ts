import { createHash, randomBytes } from "node:crypto";

/** SHA-256 hex. We store only hashes; lookups hash the presented secret and match by hash. */
export function hashSecret(secret: string): string {
	return createHash("sha256").update(secret).digest("hex");
}

export interface GeneratedApiKey {
	/** The full secret, shown to the daemon exactly once. */
	key: string;
	hash: string;
	/** Non-secret leading fragment, stored for identification in the dashboard / rotation. */
	prefix: string;
}

/** Mint a daemon API key. `mcpd_` prefix makes leaked keys greppable in logs/repos. */
export function generateApiKey(): GeneratedApiKey {
	const key = `mcpd_${randomBytes(24).toString("base64url")}`;
	return { key, hash: hashSecret(key), prefix: key.slice(0, 12) };
}

/** Mint an enrollment token operators hand to a new daemon. */
export function generateEnrollmentToken(): { token: string; hash: string } {
	const token = `mcpe_${randomBytes(24).toString("base64url")}`;
	return { token, hash: hashSecret(token) };
}
