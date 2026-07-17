/**
 * Keeps the daemon alive under hostile load: a global concurrent-connection ceiling plus a per-IP
 * rate limit. A public :25565 listener is a magnet for scan floods, so unbounded accepts would
 * exhaust sockets/memory. Cheap in-memory counters — this is a honeypot, not a bank.
 */
export interface LimiterOptions {
	maxConcurrent: number;
	perIpPerMinute: number;
}

export class ConnectionLimiter {
	private active = 0;
	private readonly ipHits = new Map<string, number[]>();
	private readonly dropped = new Map<string, number>();

	constructor(private readonly opts: LimiterOptions) {}

	/** Try to admit a connection from `ip`. Returns false if a limit is hit (caller should drop). */
	tryAdmit(ip: string, now: number): boolean {
		if (this.active >= this.opts.maxConcurrent) {
			this.recordDrop(ip);
			return false;
		}

		const windowStart = now - 60_000;
		const hits = (this.ipHits.get(ip) ?? []).filter((t) => t > windowStart);
		if (hits.length >= this.opts.perIpPerMinute) {
			this.ipHits.set(ip, hits);
			this.recordDrop(ip);
			return false;
		}
		hits.push(now);
		this.ipHits.set(ip, hits);
		this.active++;
		return true;
	}

	// Dropped connections would otherwise vanish from telemetry, under-counting exactly the floods
	// that trip the limiter — so we tally them and let the caller drain one summary per sweep.
	private recordDrop(ip: string): void {
		this.dropped.set(ip, (this.dropped.get(ip) ?? 0) + 1);
	}

	/** Take (and clear) the per-IP counts of connections dropped since the last drain. */
	drainDrops(): Array<{ ip: string; count: number }> {
		const drops = [...this.dropped].map(([ip, count]) => ({ ip, count }));
		this.dropped.clear();
		return drops;
	}

	release(): void {
		if (this.active > 0) this.active--;
	}

	get activeConnections(): number {
		return this.active;
	}

	/** Drop stale per-IP windows so the map does not grow without bound. */
	sweep(now: number): void {
		const windowStart = now - 60_000;
		for (const [ip, hits] of this.ipHits) {
			const fresh = hits.filter((t) => t > windowStart);
			if (fresh.length === 0) this.ipHits.delete(ip);
			else this.ipHits.set(ip, fresh);
		}
	}
}
