import type { DaemonConfig, Persona } from "@mcpot/shared";

/**
 * Holds the daemon's current config, swapped atomically when a config poll returns a new revision.
 * The TCP server reads through this on each connection so persona changes take effect live without a
 * restart. (Startup-fixed limits like max-concurrent are applied once; only persona/timeouts are hot.)
 */
export class ConfigHolder {
	constructor(private current: DaemonConfig) {}

	get(): DaemonConfig {
		return this.current;
	}

	get persona(): Persona {
		return this.current.persona;
	}

	get revision(): number {
		return this.current.revision;
	}

	set(next: DaemonConfig): void {
		this.current = next;
	}
}
