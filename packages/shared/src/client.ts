import type { z } from "zod";

export class ApiError extends Error {
	constructor(
		message: string,
		readonly status: number,
		readonly body: string,
	) {
		super(message);
		this.name = "ApiError";
	}
}

export interface RequestOptions {
	method?: "GET" | "POST";
	/** Parsed + validated against this schema before returning. */
	responseSchema: z.ZodType;
	body?: unknown;
	/** Bearer token (daemon API key or admin session). */
	token?: string;
	signal?: AbortSignal;
}

/**
 * Single fetch helper that validates responses with zod, so daemon and web never hand-roll parsing
 * or trust unvalidated server output. Throws ApiError on non-2xx.
 */
export async function apiRequest<T>(baseUrl: string, path: string, opts: RequestOptions): Promise<T> {
	const headers: Record<string, string> = { accept: "application/json" };
	if (opts.body !== undefined) headers["content-type"] = "application/json";
	if (opts.token) headers.authorization = `Bearer ${opts.token}`;

	const res = await fetch(new URL(path, baseUrl), {
		method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
		headers,
		body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
		signal: opts.signal,
	});

	const text = await res.text();
	if (!res.ok) throw new ApiError(`request to ${path} failed`, res.status, text);

	const json = text.length > 0 ? JSON.parse(text) : undefined;
	return opts.responseSchema.parse(json) as T;
}
