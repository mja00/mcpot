import { and, eq, gt, isNull, or } from "drizzle-orm";
import type { Db } from "./client.ts";
import { enrollmentTokens } from "./schema.ts";
import { generateEnrollmentToken, hashSecret } from "../auth/keys.ts";

/** Create an enrollment token; returns the plaintext once (store only the hash). */
export async function createEnrollmentToken(
	db: Db,
	opts: { label?: string; singleUse?: boolean; expiresAt?: Date | null } = {},
): Promise<{ token: string }> {
	const { token, hash } = generateEnrollmentToken();
	await db.insert(enrollmentTokens).values({
		tokenHash: hash,
		label: opts.label ?? null,
		singleUse: opts.singleUse ?? true,
		expiresAt: opts.expiresAt ?? null,
	});
	return { token };
}

/**
 * Validate and consume an enrollment token atomically. The guarded UPDATE only matches an unexpired,
 * not-yet-used (for single-use) token and stamps used_at, so two concurrent enrolls can't both win.
 * Returns true if the token was valid and consumed.
 */
export async function consumeEnrollmentToken(db: Db, token: string): Promise<boolean> {
	const hash = hashSecret(token);
	const consumed = await db
		.update(enrollmentTokens)
		.set({ usedAt: new Date() })
		.where(
			and(
				eq(enrollmentTokens.tokenHash, hash),
				or(isNull(enrollmentTokens.expiresAt), gt(enrollmentTokens.expiresAt, new Date())),
				or(eq(enrollmentTokens.singleUse, false), isNull(enrollmentTokens.usedAt)),
			),
		)
		.returning({ id: enrollmentTokens.id });
	return consumed.length > 0;
}
