import { createHmac, timingSafeEqual } from "node:crypto";

// Stateless signed session tokens for the dashboard: `base64url(payload).base64url(hmac)`. Simple and
// serverless-friendly (no session store); the HMAC secret gates forgery and the payload carries expiry.

function sign(data: string, secret: string): string {
	return createHmac("sha256", secret).update(data).digest("base64url");
}

/** Issue a session token valid for `ttlSeconds`. */
export function issueSession(secret: string, ttlSeconds: number, nowMs: number): string {
	const payload = Buffer.from(JSON.stringify({ exp: Math.floor(nowMs / 1000) + ttlSeconds })).toString("base64url");
	return `${payload}.${sign(payload, secret)}`;
}

/** Verify a session token's signature and expiry. Returns true only if both pass. */
export function verifySession(token: string, secret: string, nowMs: number): boolean {
	const dot = token.indexOf(".");
	if (dot < 1) return false;
	const payload = token.slice(0, dot);
	const providedSig = token.slice(dot + 1);

	const expectedSig = sign(payload, secret);
	const a = Buffer.from(providedSig);
	const b = Buffer.from(expectedSig);
	if (a.length !== b.length || !timingSafeEqual(a, b)) return false;

	try {
		const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp: number };
		return typeof exp === "number" && exp > Math.floor(nowMs / 1000);
	} catch {
		return false;
	}
}
