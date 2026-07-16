import { isIP } from "node:net";
import { and, eq, lt, sql } from "drizzle-orm";
import type { Db } from "./db/client.ts";
import { getOffenderSignals } from "./db/connections.ts";
import { abuseipdbDailyUsage, abuseReports } from "./db/schema.ts";
import { classify, type OffenderSignals } from "./classify.ts";

export interface ReportConfig {
	abuseipdbKey: string | null;
	webhookUrl: string | null;
	abuseipdbDailyLimit: number;
}

export interface ReportResult {
	reported: boolean;
	sinks: string[];
}

export type ReportTrigger = "manual" | "automatic";
export type ReportFetch = typeof fetch;

export class InvalidReportIpError extends Error {
	constructor() {
		super("invalid IP");
		this.name = "InvalidReportIpError";
	}
}

const COMMENT = "Observed unsolicited TCP connection to a Minecraft honeypot on port 25565; automated scanner behavior matched local connection telemetry.";
// AbuseIPDB categories: 14 = Port Scan, 15 = Hacking.
const CATEGORIES = "14,15";
const AUTO_QUEUE_LIMIT = 1000;
const AUTO_CONCURRENCY = 2;

function utcDay(): string {
	return new Date().toISOString().slice(0, 10);
}

function safeError(error: unknown): string {
	return (error instanceof Error ? error.message : String(error)).slice(0, 512);
}

async function reserveAbuseReport(db: Db, srcIp: string, trigger: ReportTrigger, dailyLimit: number): Promise<string | null> {
	class QuotaExhausted extends Error {}

	try {
		return await db.transaction(async (tx) => {
			const reportDay = utcDay();
			const [report] = await tx
				.insert(abuseReports)
				.values({ srcIp, reportDay, trigger })
				.onConflictDoNothing({ target: [abuseReports.srcIp, abuseReports.reportDay] })
				.returning({ id: abuseReports.id });
			if (!report) return null;

			await tx.insert(abuseipdbDailyUsage).values({ reportDay, reportCount: 0 }).onConflictDoNothing({ target: abuseipdbDailyUsage.reportDay });
			const [usage] = await tx
				.update(abuseipdbDailyUsage)
				.set({ reportCount: sql`${abuseipdbDailyUsage.reportCount} + 1` })
				.where(and(eq(abuseipdbDailyUsage.reportDay, reportDay), lt(abuseipdbDailyUsage.reportCount, dailyLimit)))
				.returning({ reportCount: abuseipdbDailyUsage.reportCount });
			if (!usage) throw new QuotaExhausted();
			return report.id;
		});
	} catch (error) {
		if (error instanceof QuotaExhausted) return null;
		throw error;
	}
}

async function completeAbuseReport(db: Db, id: string, status: "succeeded" | "failed", httpStatus: number | null, error: string | null): Promise<void> {
	await db
		.update(abuseReports)
		.set({ status, completedAt: new Date(), httpStatus, error })
		.where(eq(abuseReports.id, id));
}

/** Sends one manual or automatic report while reserving quota before making the provider call. */
export class ReportingService {
	constructor(
		private readonly db: Db,
		private readonly config: ReportConfig,
		private readonly fetchFn: ReportFetch = fetch,
	) {}

	async reportIp(srcIp: string, trigger: ReportTrigger = "manual"): Promise<ReportResult> {
		if (isIP(srcIp) === 0) throw new InvalidReportIpError();
		const sinks: string[] = [];

		if (this.config.abuseipdbKey) {
			const reservationId = await reserveAbuseReport(this.db, srcIp, trigger, this.config.abuseipdbDailyLimit);
			if (reservationId) {
				try {
					const response = await this.fetchFn("https://api.abuseipdb.com/api/v2/report", {
						method: "POST",
						headers: { Key: this.config.abuseipdbKey, Accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
						body: new URLSearchParams({
							ip: srcIp,
							categories: CATEGORIES,
							comment: COMMENT,
							timestamp: new Date().toISOString(),
						}),
					});
					await completeAbuseReport(this.db, reservationId, response.ok ? "succeeded" : "failed", response.status, response.ok ? null : `provider returned HTTP ${response.status}`);
					if (response.ok) sinks.push("abuseipdb");
				} catch (error) {
					try {
						await completeAbuseReport(this.db, reservationId, "failed", null, safeError(error));
					} catch {
						// The reservation remains as evidence of a conservatively consumed quota slot.
					}
				}
			}
		}

		if (this.config.webhookUrl) {
			try {
				const response = await this.fetchFn(this.config.webhookUrl, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ ip: srcIp, note: COMMENT }),
				});
				if (response.ok) sinks.push("webhook");
			} catch {
				// A failing optional sink must not hide a successful AbuseIPDB report.
			}
		}

		return { reported: sinks.length > 0, sinks };
	}
}

function ipv4Number(ip: string): number {
	return ip.split(".").reduce((value, part) => value * 256 + Number(part), 0) >>> 0;
}

function ipv4IsPublic(ip: string): boolean {
	const value = ipv4Number(ip);
	const blocked = [
		[0x00000000, 0x00ffffff],
		[0x0a000000, 0x0affffff],
		[0x64400000, 0x647fffff],
		[0x7f000000, 0x7fffffff],
		[0xa9fe0000, 0xa9feffff],
		[0xac100000, 0xac1fffff],
		[0xc0000000, 0xc00000ff],
		[0xc0000200, 0xc00002ff],
		[0xc0a80000, 0xc0a8ffff],
		[0xc6120000, 0xc613ffff],
		[0xc6336400, 0xc63364ff],
		[0xcb007100, 0xcb0071ff],
		[0xe0000000, 0xffffffff],
	] as const;
	return !blocked.some(([start, end]) => value >= start && value <= end);
}

/** Automatic reports exclude addresses that cannot identify a public source. */
export function isPublicIp(ip: string): boolean {
	if (isIP(ip) === 4) return ipv4IsPublic(ip);
	if (isIP(ip) !== 6) return false;
	const normalized = ip.toLowerCase();
	if (normalized.startsWith("::ffff:")) return ipv4IsPublic(normalized.slice(7));
	if (normalized === "::" || normalized === "::1" || normalized.startsWith("2001:db8:")) return false;
	const first = Number.parseInt(normalized.split(":")[0] || "0", 16);
	return (first & 0xfe00) !== 0xfc00 && (first & 0xffc0) !== 0xfe80 && (first & 0xff00) !== 0xff00;
}

export interface AutoReportConfig {
	enabled: boolean;
	minScore: number;
	minHits: number;
	windowHours: number;
}

export function shouldAutoReport(signals: OffenderSignals, config: AutoReportConfig): boolean {
	const classification = classify(signals);
	return config.enabled && signals.hits >= config.minHits && classification.label === "scanner" && classification.score >= config.minScore;
}

/** Bounded background queue keeps provider latency outside the ingest request path. */
export class AutomaticReporter {
	private readonly queue: string[] = [];
	private readonly pending = new Set<string>();
	private active = 0;
	private stopping = false;
	private idleResolvers: Array<() => void> = [];

	constructor(
		private readonly db: Db,
		private readonly reporting: ReportingService,
		private readonly config: AutoReportConfig,
		private readonly onError: (error: unknown) => void = (error) => process.stderr.write(`automatic report failed: ${safeError(error)}\n`),
	) {}

	enqueueMany(ips: Iterable<string>): void {
		if (!this.config.enabled || this.stopping) return;
		for (const ip of new Set(ips)) {
			if (this.pending.has(ip) || !isPublicIp(ip) || this.queue.length >= AUTO_QUEUE_LIMIT) continue;
			this.pending.add(ip);
			this.queue.push(ip);
		}
		this.drain();
	}

	async stop(): Promise<void> {
		this.stopping = true;
		this.queue.length = 0;
		if (this.active === 0) return;
		await new Promise<void>((resolve) => this.idleResolvers.push(resolve));
	}

	private drain(): void {
		while (!this.stopping && this.active < AUTO_CONCURRENCY && this.queue.length > 0) {
			const ip = this.queue.shift()!;
			this.active += 1;
			void this.process(ip)
				.catch(this.onError)
				.finally(() => {
					this.pending.delete(ip);
					this.active -= 1;
					if (this.active === 0 && this.queue.length === 0) {
						for (const resolve of this.idleResolvers.splice(0)) resolve();
					}
					this.drain();
				});
		}
	}

	private async process(srcIp: string): Promise<void> {
		const signals = await getOffenderSignals(this.db, srcIp, this.config.windowHours);
		if (!shouldAutoReport(signals, this.config)) return;
		await this.reporting.reportIp(srcIp, "automatic");
	}
}
