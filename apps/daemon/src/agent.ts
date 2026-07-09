import { ConfigResponse, IngestResponse, apiRequest } from "@mcpot/shared";
import type { ConfigHolder } from "./config-holder.ts";
import type { EventQueue } from "./queue.ts";

export interface AgentOptions {
	serverUrl: string;
	daemonId: string;
	apiKey: string;
	queue: EventQueue;
	config: ConfigHolder;
	/** Sent with every heartbeat so renames (MCPOT_HOSTNAME) apply without re-enrolling. */
	hostname?: string;
	/** Injectable clock for tests; defaults to Date.now. */
	now?: () => number;
}

const MAX_BACKOFF_MS = 60_000;

/**
 * Background loops that connect a daemon to central: drain the durable queue to /v1/ingest (acking
 * only on success, with exponential backoff so a central outage doesn't spin) and periodically poll
 * config + send a heartbeat. All failures are swallowed — the honeypot keeps serving regardless.
 */
export class DaemonAgent {
	private stopped = false;
	private flushFailures = 0;
	private readonly startedAt: number;
	private readonly now: () => number;
	private timers = new Set<NodeJS.Timeout>();

	constructor(private readonly opts: AgentOptions) {
		this.now = opts.now ?? Date.now;
		this.startedAt = this.now();
	}

	start(): void {
		this.scheduleFlush(0);
		this.schedulePoll(0);
	}

	stop(): void {
		this.stopped = true;
		for (const t of this.timers) clearTimeout(t);
		this.timers.clear();
	}

	private schedule(fn: () => void, delay: number): void {
		if (this.stopped) return;
		const t = setTimeout(() => {
			this.timers.delete(t);
			fn();
		}, delay);
		this.timers.add(t);
	}

	private scheduleFlush(delay: number): void {
		this.schedule(() => void this.flushTick(), delay);
	}

	private schedulePoll(delay: number): void {
		this.schedule(() => void this.pollTick(), delay);
	}

	/** Send one batch. Returns the count sent (0 if the queue was empty). Throws on network/HTTP error. */
	async flushOnce(): Promise<number> {
		const batch = this.opts.queue.peek(this.opts.config.get().settings.batchSize);
		if (batch.length === 0) return 0;

		await apiRequest<IngestResponse>(this.opts.serverUrl, "/v1/ingest", {
			method: "POST",
			responseSchema: IngestResponse,
			token: this.opts.apiKey,
			body: { events: batch.map((b) => b.event) },
		});
		// Ack only after the server confirmed receipt; a crash before this just re-sends (idempotent).
		this.opts.queue.ack(batch.map((b) => b.id));
		return batch.length;
	}

	private async flushTick(): Promise<void> {
		let nextDelay = this.opts.config.get().settings.maxBatchDelayMs;
		try {
			await this.flushOnce();
			this.flushFailures = 0;
		} catch {
			this.flushFailures++;
			nextDelay = Math.min(1000 * 2 ** this.flushFailures, MAX_BACKOFF_MS);
		}
		this.scheduleFlush(nextDelay);
	}

	/** Poll config and send a heartbeat. Returns true on success. */
	async pollOnce(): Promise<boolean> {
		const cfg = await apiRequest<ConfigResponse>(
			this.opts.serverUrl,
			`/v1/daemons/${this.opts.daemonId}/config`,
			{ responseSchema: ConfigResponse, token: this.opts.apiKey },
		);
		this.opts.config.set(cfg);
		await this.sendHeartbeat();
		return true;
	}

	private async sendHeartbeat(): Promise<void> {
		await fetch(new URL(`/v1/daemons/${this.opts.daemonId}/heartbeat`, this.opts.serverUrl), {
			method: "POST",
			headers: { authorization: `Bearer ${this.opts.apiKey}`, "content-type": "application/json" },
			body: JSON.stringify({
				queueDepth: this.opts.queue.size(),
				uptimeSeconds: Math.floor((this.now() - this.startedAt) / 1000),
				configRevision: this.opts.config.revision,
				...(this.opts.hostname ? { hostname: this.opts.hostname } : {}),
			}),
		});
	}

	private async pollTick(): Promise<void> {
		try {
			await this.pollOnce();
		} catch {
			// Stale config is fine; the daemon keeps serving with what it has.
		}
		this.schedulePoll(this.opts.config.get().settings.pollIntervalMs);
	}
}
