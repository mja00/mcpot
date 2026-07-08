/** Strip the IPv4-mapped-IPv6 prefix so `::ffff:1.2.3.4` and `1.2.3.4` key/dedupe as one IP. */
export function normalizeIp(ip: string): string {
	return ip.startsWith("::ffff:") ? ip.slice("::ffff:".length) : ip;
}

/** A raw-IP hostname (vs a domain) is a strong scanner tell; humans connect by name. */
export function isRawIpAddress(host: string): boolean {
	if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true; // IPv4
	if (host.includes(":") && /^[0-9a-fA-F:]+$/.test(host)) return true; // IPv6
	return false;
}
