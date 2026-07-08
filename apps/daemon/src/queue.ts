import { createRequire } from "node:module";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import type { ConnectionEvent } from "@mcpot/shared";

// node:sqlite is a prefix-only builtin that Vite's bundler mis-resolves (it strips `node:` and looks
// for a bare `sqlite` package). Loading it through createRequire keeps the specifier a runtime string
// so the test bundler never touches it. Node itself resolves it natively.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

export interface QueuedEvent {
	id: number;
	event: ConnectionEvent;
}

/**
 * Durable on-disk event buffer (node:sqlite, WAL). Events survive daemon restarts and central
 * outages. Bounded with a drop-oldest policy so a flood or multi-day outage can't fill a small VPS
 * disk — we favor staying alive and serving realistic responses over retaining every last event.
 */
export class EventQueue {
	private readonly db: DatabaseSyncType;

	constructor(
		path: string,
		private readonly maxEvents: number,
	) {
		this.db = new DatabaseSync(path);
		this.db.exec("pragma journal_mode = WAL");
		this.db.exec(
			`create table if not exists queue (
				id integer primary key autoincrement,
				event_id text not null unique,
				payload text not null
			)`,
		);
	}

	enqueue(event: ConnectionEvent): void {
		const count = this.size();
		if (count >= this.maxEvents) {
			// Make room by dropping the oldest surplus rows.
			const overflow = count - this.maxEvents + 1;
			this.db.prepare("delete from queue where id in (select id from queue order by id asc limit ?)").run(overflow);
		}
		this.db
			.prepare("insert or ignore into queue (event_id, payload) values (?, ?)")
			.run(event.eventId, JSON.stringify(event));
	}

	/** Oldest events, up to `limit`, without removing them (removed via {@link ack} after a successful send). */
	peek(limit: number): QueuedEvent[] {
		const rows = this.db.prepare("select id, payload from queue order by id asc limit ?").all(limit) as {
			id: number;
			payload: string;
		}[];
		return rows.map((r) => ({ id: r.id, event: JSON.parse(r.payload) as ConnectionEvent }));
	}

	ack(ids: number[]): void {
		if (ids.length === 0) return;
		const placeholders = ids.map(() => "?").join(",");
		this.db.prepare(`delete from queue where id in (${placeholders})`).run(...ids);
	}

	size(): number {
		const row = this.db.prepare("select count(*) as n from queue").get() as { n: number };
		return row.n;
	}

	close(): void {
		this.db.close();
	}
}
