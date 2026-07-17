import { lt, sql } from "drizzle-orm";
import { Cron } from "croner";
import type { Db } from "./db/client.ts";
import { abuseipdbChecks, abuseReports, abuseipdbDailyUsage, connections } from "./db/schema.ts";

// PII (source IPs) can't be kept forever, and a busy honeypot grows the raw table without bound. A
// scheduled purge enforces a retention window. A Postgres advisory lock keeps concurrent server
// replicas from purging at once. At scale, replace this DELETE with dropping old time partitions
// (see infra/README) — DELETE is correct but does more work than a partition drop.
const PURGE_LOCK_KEY = 947_213; // arbitrary constant shared by all replicas

export async function purgeOldConnections(db: Db, retentionDays: number): Promise<number> {
	const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
	return db.transaction(async (tx) => {
		const [lock] = await tx.execute(sql`select pg_try_advisory_xact_lock(${PURGE_LOCK_KEY}) as ok`);
		if (!(lock as { ok: boolean }).ok) return 0; // another replica holds the lock this run
		const deleted = await tx.delete(connections).where(lt(connections.receivedAt, cutoff)).returning({ id: connections.eventId });
		const reportDay = cutoff.toISOString().slice(0, 10);
		await tx.delete(abuseReports).where(lt(abuseReports.reportDay, reportDay));
		await tx.delete(abuseipdbDailyUsage).where(lt(abuseipdbDailyUsage.reportDay, reportDay));
		await tx.delete(abuseipdbChecks).where(lt(abuseipdbChecks.attemptedAt, cutoff));
		return deleted.length;
	});
}

/** Schedule the daily retention purge. Returns the Cron handle so callers can stop it on shutdown. */
export function scheduleRetention(db: Db, retentionDays: number, onPurge?: (n: number) => void): Cron {
	// 03:17 UTC daily — off the hour to avoid colliding with other cron work.
	return new Cron("17 3 * * *", { timezone: "UTC" }, async () => {
		const n = await purgeOldConnections(db, retentionDays);
		onPurge?.(n);
	});
}
