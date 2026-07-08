import { isIP } from "node:net";

/**
 * Report an offending IP to external sinks — AbuseIPDB and/or a webhook. This is deliberately MANUAL
 * (operator-triggered per IP), never automatic: ingest is spoofable and observed IPs can be shared
 * NAT/proxy egress, so blind auto-reporting risks defaming innocents. A human confirms each report.
 */
export interface ReportConfig {
	abuseipdbKey: string | null;
	webhookUrl: string | null;
}

export interface ReportResult {
	reported: boolean;
	sinks: string[];
}

const COMMENT = "Unsolicited connection to a Minecraft honeypot (no legitimate reason to connect).";
// AbuseIPDB categories: 14 = Port Scan, 15 = Hacking.
const CATEGORIES = "14,15";

export async function reportIp(config: ReportConfig, srcIp: string): Promise<ReportResult> {
	if (isIP(srcIp) === 0) throw new Error("invalid IP");
	const sinks: string[] = [];

	if (config.abuseipdbKey) {
		const res = await fetch("https://api.abuseipdb.com/api/v2/report", {
			method: "POST",
			headers: { Key: config.abuseipdbKey, Accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({ ip: srcIp, categories: CATEGORIES, comment: COMMENT }),
		});
		if (res.ok) sinks.push("abuseipdb");
	}

	if (config.webhookUrl) {
		const res = await fetch(config.webhookUrl, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ ip: srcIp, note: COMMENT }),
		});
		if (res.ok) sinks.push("webhook");
	}

	return { reported: sinks.length > 0, sinks };
}
