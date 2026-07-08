// Thin fetch helpers hitting the same-origin /v1 dev proxy (which injects auth). Response shapes are
// duck-typed here; the server validates on its side. M5 swaps this for the shared typed client.

export interface Stats {
	windowMinutes: number;
	total: number;
	uniqueIps: number;
	statusCount: number;
	loginCount: number;
	hitsPerMinute: number;
}

export interface RecentConnection {
	eventId: string;
	daemonId: string;
	receivedAt: string;
	srcIp: string | null;
	protocolVersion: number | null;
	serverAddress: string | null;
	intent: string;
	username: string | null;
}

async function getJson<T>(path: string): Promise<T> {
	const res = await fetch(path, { headers: { accept: "application/json" } });
	if (!res.ok) throw new Error(`${path} -> ${res.status}`);
	return (await res.json()) as T;
}

export const fetchStats = (windowMinutes = 60) => getJson<Stats>(`/v1/stats?windowMinutes=${windowMinutes}`);
export const fetchConnections = (limit = 25) => getJson<RecentConnection[]>(`/v1/connections?limit=${limit}`);
