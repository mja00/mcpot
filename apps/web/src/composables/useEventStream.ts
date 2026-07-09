import { onScopeDispose, readonly, ref } from "vue";
import type { StreamConnection, StreamDaemonStatus } from "@mcpot/shared";
import { clearToken, getToken } from "../api";

export type StreamStatus = "idle" | "connecting" | "open" | "paused";

export interface StreamHandlers {
	onConnection?: (event: StreamConnection) => void;
	onDaemon?: (status: StreamDaemonStatus) => void;
	/** Fired on every successful (re)open so the view can refetch and heal any gap. */
	onResync?: () => void;
}

/**
 * Fetch-based SSE client. Native EventSource can't send the Authorization header our session
 * lives in (and a query-param token would leak into proxy logs), so we read the stream off a
 * plain fetch. One shared connection serves all subscribers; it runs only while a component
 * with handlers is mounted and pauses while the tab is hidden.
 */
const status = ref<StreamStatus>("idle");
const subscribers = new Set<StreamHandlers>();
let controller: AbortController | null = null;
let attempt = 0;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let listeningForVisibility = false;

function dispatch(eventName: string, data: string): void {
	try {
		const payload: unknown = JSON.parse(data);
		for (const s of subscribers) {
			if (eventName === "connection") s.onConnection?.(payload as StreamConnection);
			else if (eventName === "daemon") s.onDaemon?.(payload as StreamDaemonStatus);
		}
	} catch {
		// A malformed frame is a server bug; skip it rather than kill the stream.
	}
}

async function readStream(signal: AbortSignal): Promise<void> {
	const token = getToken();
	if (!token) {
		status.value = "idle";
		return;
	}
	const res = await fetch("/v1/events/stream", {
		headers: { accept: "text/event-stream", authorization: `Bearer ${token}` },
		signal,
	});
	if (res.status === 401) {
		clearToken();
		status.value = "idle";
		return;
	}
	if (!res.ok || !res.body) throw new Error(`stream -> ${res.status}`);

	status.value = "open";
	attempt = 0;
	for (const s of subscribers) s.onResync?.();

	const reader = res.body.getReader();
	const decoder = new TextDecoder();
	let buf = "";
	for (;;) {
		const { value, done } = await reader.read();
		if (done) break;
		buf += decoder.decode(value, { stream: true });
		let sep;
		while ((sep = buf.indexOf("\n\n")) !== -1) {
			const frame = buf.slice(0, sep);
			buf = buf.slice(sep + 2);
			let eventName = "message";
			const dataLines: string[] = [];
			for (const line of frame.split("\n")) {
				if (line.startsWith("event:")) eventName = line.slice(6).trim();
				else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
				// ":" comments (keepalives) and "id:"/"retry:" fields need no handling here.
			}
			if (dataLines.length > 0) dispatch(eventName, dataLines.join("\n"));
		}
	}
	throw new Error("stream ended");
}

function connect(): void {
	if (controller || subscribers.size === 0 || document.hidden) return;
	status.value = "connecting";
	controller = new AbortController();
	const { signal } = controller;
	void readStream(signal)
		.catch(() => {
			if (signal.aborted) return;
			// Exponential backoff with jitter, capped at 30s; a resync fires on the next open.
			const delay = Math.min(1000 * 2 ** attempt, 30_000) * (0.7 + Math.random() * 0.6);
			attempt++;
			status.value = "connecting";
			retryTimer = setTimeout(() => {
				controller = null;
				connect();
			}, delay);
			return;
		})
		.then(() => {
			// Clean returns (401 / no token) land here; don't reconnect until something changes.
			if (controller?.signal === signal && !signal.aborted && status.value === "idle") controller = null;
		});
}

function disconnect(nextStatus: StreamStatus): void {
	clearTimeout(retryTimer);
	controller?.abort();
	controller = null;
	status.value = nextStatus;
}

function onVisibility(): void {
	if (subscribers.size === 0) return;
	if (document.hidden) disconnect("paused");
	else connect();
}

export function useEventStream(handlers?: StreamHandlers) {
	if (handlers) {
		subscribers.add(handlers);
		if (!listeningForVisibility) {
			document.addEventListener("visibilitychange", onVisibility);
			listeningForVisibility = true;
		}
		connect();
		onScopeDispose(() => {
			subscribers.delete(handlers);
			if (subscribers.size === 0) disconnect("idle");
		});
	}
	return { status: readonly(status) };
}
