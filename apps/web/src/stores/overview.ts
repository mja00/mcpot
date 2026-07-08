import { defineStore } from "pinia";
import { ref } from "vue";
import { fetchConnections, fetchStats, type RecentConnection, type Stats } from "../api";

/** Polls the Overview data on an interval and exposes it reactively. */
export const useOverviewStore = defineStore("overview", () => {
	const stats = ref<Stats | null>(null);
	const connections = ref<RecentConnection[]>([]);
	const error = ref<string | null>(null);
	let timer: ReturnType<typeof setInterval> | undefined;

	async function refresh(): Promise<void> {
		try {
			const [s, c] = await Promise.all([fetchStats(60), fetchConnections(25)]);
			stats.value = s;
			connections.value = c;
			error.value = null;
		} catch (err) {
			error.value = err instanceof Error ? err.message : String(err);
		}
	}

	function start(): void {
		void refresh();
		timer = setInterval(() => void refresh(), 5000);
	}

	function stop(): void {
		if (timer) clearInterval(timer);
	}

	return { stats, connections, error, refresh, start, stop };
});
