// Same-origin API client hitting the /v1 dev proxy. Attaches the stored session token; a 401 clears
// it and signals the caller to bounce to login. Response shapes come from @mcpot/shared (types only).
import type {
	CreateTokenResponse,
	DaemonListItem,
	LoginResponse,
	Offender,
	OffenderSortBy,
	OffendersResponse,
	OverviewResponse,
	RecentConnection,
	ReportResponse,
	SortOrder,
	Stats,
	TrendBucket,
} from "@mcpot/shared";

export type { DaemonListItem, Offender, OffenderSortBy, OffendersResponse, OverviewResponse, RecentConnection, SortOrder, Stats, TrendBucket };

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
	const { token } = await req<LoginResponse>("/v1/auth/login", { method: "POST", body: JSON.stringify({ password }) });
	setToken(token);
}

export const fetchStats = (windowMinutes = 60) => req<Stats>(`/v1/stats?windowMinutes=${windowMinutes}`);
export const fetchOverview = (windowMinutes = 60, topLimit = 10) =>
	req<OverviewResponse>(`/v1/overview?windowMinutes=${windowMinutes}&topLimit=${topLimit}`);
export const fetchTrends = (hours = 24) => req<TrendBucket[]>(`/v1/trends?hours=${hours}`);
export const fetchDaemons = () => req<DaemonListItem[]>(`/v1/daemons`);
export const fetchOffenders = (
	params: { windowHours?: number; limit?: number; offset?: number; sortBy?: OffenderSortBy; order?: SortOrder } = {},
) => {
	const q = new URLSearchParams();
	q.set("windowHours", String(params.windowHours ?? 24));
	q.set("limit", String(params.limit ?? 50));
	q.set("offset", String(params.offset ?? 0));
	if (params.sortBy) q.set("sortBy", params.sortBy);
	if (params.order) q.set("order", params.order);
	return req<OffendersResponse>(`/v1/offenders?${q}`);
};
export const fetchConnections = (params: { limit?: number; srcIp?: string; daemonId?: string } = {}) => {
	const q = new URLSearchParams();
	q.set("limit", String(params.limit ?? 50));
	if (params.srcIp) q.set("srcIp", params.srcIp);
	if (params.daemonId) q.set("daemonId", params.daemonId);
	return req<RecentConnection[]>(`/v1/connections?${q}`);
};
export const revokeDaemon = (id: string) => req<void>(`/v1/admin/daemons/${id}/revoke`, { method: "POST", body: "{}" });
export const createToken = () => req<CreateTokenResponse>(`/v1/admin/tokens`, { method: "POST", body: "{}" });
export const reportOffender = (srcIp: string) =>
	req<ReportResponse>(`/v1/admin/report`, { method: "POST", body: JSON.stringify({ srcIp }) });
