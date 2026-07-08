// Same-origin API client hitting the /v1 dev proxy. Attaches the stored session token; a 401 clears
// it and signals the caller to bounce to login. Response shapes are duck-typed (server validates).

const TOKEN_KEY = "mcpot_session";

export function getToken(): string | null {
	return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string): void {
	localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken(): void {
	localStorage.removeItem(TOKEN_KEY);
}

export class UnauthorizedError extends Error {}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
	const token = getToken();
	const res = await fetch(path, {
		...init,
		headers: {
			accept: "application/json",
			...(init.body ? { "content-type": "application/json" } : {}),
			...(token ? { authorization: `Bearer ${token}` } : {}),
			...init.headers,
		},
	});
	if (res.status === 401) {
		clearToken();
		throw new UnauthorizedError("unauthorized");
	}
	if (!res.ok) throw new Error(`${path} -> ${res.status}`);
	const text = await res.text();
	return (text ? JSON.parse(text) : undefined) as T;
}

export async function login(password: string): Promise<void> {
	const { token } = await req<{ token: string }>("/v1/auth/login", { method: "POST", body: JSON.stringify({ password }) });
	setToken(token);
}

export interface Stats {
	windowMinutes: number;
	total: number;
	uniqueIps: number;
	statusCount: number;
	loginCount: number;
	hitsPerMinute: number;
}
export interface TrendBucket {
	bucket: string;
	total: number;
	status: number;
	login: number;
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
export interface DaemonListItem {
	id: string;
	hostname: string | null;
	versionName: string;
	revoked: boolean;
	lastSeenAt: string | null;
	queueDepth: number | null;
	createdAt: string;
}
export interface Offender {
	srcIp: string | null;
	hits: number;
	logins: number;
	daemonsHit: number;
	lastSeen: string;
}

export const fetchStats = (windowMinutes = 60) => req<Stats>(`/v1/stats?windowMinutes=${windowMinutes}`);
export const fetchTrends = (hours = 24) => req<TrendBucket[]>(`/v1/trends?hours=${hours}`);
export const fetchDaemons = () => req<DaemonListItem[]>(`/v1/daemons`);
export const fetchOffenders = (windowHours = 24, limit = 50) =>
	req<Offender[]>(`/v1/offenders?windowHours=${windowHours}&limit=${limit}`);
export const fetchConnections = (params: { limit?: number; srcIp?: string; daemonId?: string } = {}) => {
	const q = new URLSearchParams();
	q.set("limit", String(params.limit ?? 50));
	if (params.srcIp) q.set("srcIp", params.srcIp);
	if (params.daemonId) q.set("daemonId", params.daemonId);
	return req<RecentConnection[]>(`/v1/connections?${q}`);
};
export const revokeDaemon = (id: string) => req<void>(`/v1/admin/daemons/${id}/revoke`, { method: "POST", body: "{}" });
export const createToken = () => req<{ token: string }>(`/v1/admin/tokens`, { method: "POST", body: "{}" });
