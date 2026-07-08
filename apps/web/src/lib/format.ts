/** Shared time/status formatting used across views (was duplicated per-view before the redesign). */

export function fmtTime(iso: string): string {
	return new Date(iso).toLocaleTimeString();
}

export function fmtDateTime(iso: string): string {
	return new Date(iso).toLocaleString();
}

export function timeAgo(iso: string | null): string {
	if (!iso) return "never";
	const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
	if (s < 60) return `${s}s ago`;
	if (s < 3600) return `${Math.floor(s / 60)}m ago`;
	if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
	return `${Math.floor(s / 86_400)}d ago`;
}

/** Online = a heartbeat within the last 2 minutes (daemons poll on an interval). */
export function isOnline(lastSeenAt: string | null): boolean {
	return lastSeenAt !== null && Date.now() - new Date(lastSeenAt).getTime() < 120_000;
}
