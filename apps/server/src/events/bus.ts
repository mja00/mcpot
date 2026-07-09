import { EventEmitter } from "node:events";
import type { StreamConnection, StreamDaemonStatus } from "@mcpot/shared";

export interface BusHandlers {
	onConnection?: (event: StreamConnection) => void;
	onDaemon?: (status: StreamDaemonStatus) => void;
}

export interface EventBus {
	publishConnection(event: StreamConnection): void;
	publishDaemon(status: StreamDaemonStatus): void;
	/** Returns an unsubscribe function; callers must invoke it when their stream closes. */
	subscribe(handlers: BusHandlers): () => void;
}

/**
 * In-process fan-out from the ingest path to SSE subscribers. A plain EventEmitter is enough
 * because the stack runs a single server instance; a cross-process bus would be new infra for
 * no benefit at this scale.
 */
export function createEventBus(): EventBus {
	const emitter = new EventEmitter();
	// One listener per open dashboard tab; the default cap of 10 would warn spuriously.
	emitter.setMaxListeners(0);

	return {
		publishConnection: (event) => emitter.emit("connection", event),
		publishDaemon: (status) => emitter.emit("daemon", status),
		subscribe(handlers) {
			const onConnection = handlers.onConnection;
			const onDaemon = handlers.onDaemon;
			if (onConnection) emitter.on("connection", onConnection);
			if (onDaemon) emitter.on("daemon", onDaemon);
			return () => {
				if (onConnection) emitter.off("connection", onConnection);
				if (onDaemon) emitter.off("daemon", onDaemon);
			};
		},
	};
}
