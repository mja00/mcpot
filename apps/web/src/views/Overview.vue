<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { RouterLink } from "vue-router";
import {
	fetchConnections,
	fetchDaemons,
	fetchOffenders,
	fetchOverview,
	type DaemonListItem,
	type Offender,
	type OverviewResponse,
	type RecentConnection,
} from "../api";
import { useAuthGuard } from "../composables/useAuthGuard";
import { useEventStream } from "../composables/useEventStream";
import { isOnline, timeAgo } from "../lib/format";
import PageHeader from "../components/PageHeader.vue";
import StatTile from "../components/StatTile.vue";
import Sparkline from "../components/Sparkline.vue";
import Panel from "../components/Panel.vue";
import ConnectionsTable from "../components/ConnectionsTable.vue";
import ActivityChart from "../components/ActivityChart.vue";
import CountryFlag from "../components/CountryFlag.vue";
import LiveIndicator from "../components/LiveIndicator.vue";
import StatusDot from "../components/StatusDot.vue";
import UiBadge from "../components/ui/UiBadge.vue";

const guard = useAuthGuard();
const overview = ref<OverviewResponse | null>(null);
const connections = ref<RecentConnection[]>([]);
const daemons = ref<DaemonListItem[]>([]);
const offenders = ref<Offender[]>([]);
const freshIds = ref(new Set<string>());
let timer: ReturnType<typeof setInterval> | undefined;

async function refresh(): Promise<void> {
	const [o, c, d, off] = await Promise.all([
		guard(() => fetchOverview(60, 8)),
		guard(() => fetchConnections({ limit: 30 })),
		guard(() => fetchDaemons()),
		// Overview highlights the *busiest* IPs, so keep hits ordering rather than the lastSeen default.
		guard(() => fetchOffenders({ windowHours: 24, limit: 5, sortBy: "hits", order: "desc" })),
	]);
	if (o) overview.value = o;
	if (c) connections.value = c;
	if (d) daemons.value = d;
	if (off) offenders.value = off.rows;
}

// SSE drives the live feed; windowed aggregates stay poll-based because events also age *out* of
// the window — the server's SQL is the source of truth, the stream just makes arrivals instant.
const { status: streamStatus } = useEventStream({
	onConnection(event) {
		if (connections.value.some((c) => c.eventId === event.eventId)) return;
		connections.value = [event, ...connections.value].slice(0, 50);
		freshIds.value = new Set(freshIds.value).add(event.eventId);
		setTimeout(() => {
			const next = new Set(freshIds.value);
			next.delete(event.eventId);
			freshIds.value = next;
		}, 1600);
	},
	onDaemon(status) {
		const d = daemons.value.find((x) => x.id === status.daemonId);
		if (d) {
			d.lastSeenAt = status.lastSeenAt;
			d.queueDepth = status.queueDepth;
		}
	},
	onResync() {
		void refresh();
	},
});

const spark = computed(() => overview.value?.series.map((b) => b.total) ?? []);
const stats = computed(() => overview.value?.stats ?? null);
const onlineCount = computed(() => daemons.value.filter((d) => !d.revoked && isOnline(d.lastSeenAt)).length);
const daemonHits = computed(() => new Map((overview.value?.daemonActivity ?? []).map((row) => [row.daemonId, row.hits])));
const overviewDaemons = computed(() =>
	[...daemons.value].sort((a, b) => {
		const byHits = (daemonHits.value.get(b.id) ?? 0) - (daemonHits.value.get(a.id) ?? 0);
		if (byHits !== 0) return byHits;
		const byOnline = Number(!b.revoked && isOnline(b.lastSeenAt)) - Number(!a.revoked && isOnline(a.lastSeenAt));
		return byOnline || (a.hostname ?? a.id).localeCompare(b.hostname ?? b.id);
	}),
);

const maxHostnameHits = computed(() => Math.max(...(overview.value?.topServerAddresses.map((h) => h.hits) ?? []), 1));
const maxUsernameHits = computed(() => Math.max(...(overview.value?.topUsernames.map((u) => u.hits) ?? []), 1));

const classTone = { scanner: "critical", suspicious: "warn", prober: "neutral" } as const;

onMounted(() => {
	void refresh();
	// Slow heartbeat poll — arrivals come over SSE; this keeps the windowed aggregates honest.
	timer = setInterval(() => void refresh(), 30_000);
});
onUnmounted(() => timer && clearInterval(timer));
</script>

<template>
	<section>
		<PageHeader title="Overview" eyebrow="Honeypot network" />

		<div class="mb-4 grid grid-cols-4 gap-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
			<StatTile label="Hits / min" :value="stats ? stats.hitsPerMinute.toFixed(1) : '—'" hint="Connections per minute over the last 60 minutes">
				<span class="text-accent"><Sparkline :points="spark" /></span>
			</StatTile>
			<StatTile label="Connections · 60m" :value="stats ? String(stats.total) : '—'">
				<span class="text-series-status"><Sparkline :points="spark" /></span>
			</StatTile>
			<StatTile label="Unique IPs · 60m" :value="stats ? String(stats.uniqueIps) : '—'" />
			<StatTile
				label="Status / Login"
				:value="stats ? `${stats.statusCount} / ${stats.loginCount}` : '—'"
				hint="Server-list pings vs actual join attempts — logins are the interesting ones"
			/>
		</div>

		<div class="grid grid-cols-3 gap-4 max-lg:grid-cols-1">
			<div class="col-span-2 flex flex-col gap-4 max-lg:col-span-1">
				<Panel title="Live connections">
					<template #actions>
						<LiveIndicator :status="streamStatus" />
					</template>
					<ConnectionsTable :rows="connections" :fresh-ids="freshIds" />
				</Panel>
				<Panel title="Activity · last 60m">
					<ActivityChart v-if="overview && overview.series.length" :series="overview.series" />
					<p v-else class="px-3 py-8 text-center text-sm text-ink-muted">No connection data in this window yet.</p>
				</Panel>
			</div>

			<div class="flex flex-col gap-4">
				<Panel title="Daemons">
					<template #actions>
						<span class="font-mono text-xs text-ink-muted tabular-nums">{{ onlineCount }}/{{ daemons.length }} online</span>
					</template>
					<ul class="m-0 flex list-none flex-col gap-0.5 p-1">
						<li v-for="d in overviewDaemons.slice(0, 8)" :key="d.id" class="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm">
							<StatusDot :state="d.revoked ? 'critical' : isOnline(d.lastSeenAt) ? 'good' : 'off'" />
							<span class="min-w-0 flex-1 truncate font-mono text-ink">{{ d.hostname ?? d.id.slice(0, 8) }}</span>
							<span class="font-mono text-xs text-accent tabular-nums">{{ daemonHits.get(d.id) ?? 0 }} hits</span>
							<span class="text-xs text-ink-muted">{{ d.revoked ? "revoked" : timeAgo(d.lastSeenAt) }}</span>
						</li>
						<li v-if="daemons.length === 0" class="px-2 py-4 text-center text-sm text-ink-muted">no daemons enrolled yet</li>
					</ul>
				</Panel>

				<Panel title="Top hostnames hit">
					<ul class="m-0 flex list-none flex-col gap-1 p-1">
						<li v-for="h in overview?.topServerAddresses ?? []" :key="h.serverAddress" class="relative overflow-hidden rounded-md px-2 py-1.5">
							<span
								class="absolute inset-y-0 left-0 bg-accent/10"
								:style="{ width: `${(h.hits / maxHostnameHits) * 100}%` }"
								aria-hidden="true"
							></span>
							<span class="relative flex items-center justify-between gap-2 text-sm">
								<span class="min-w-0 truncate font-mono text-ink-secondary">{{ h.serverAddress }}</span>
								<span class="font-mono text-xs text-ink-muted tabular-nums">{{ h.hits }}</span>
							</span>
						</li>
						<li v-if="!overview?.topServerAddresses.length" class="px-2 py-4 text-center text-sm text-ink-muted">nothing in this window</li>
					</ul>
				</Panel>

				<Panel title="Top usernames tried">
					<ul class="m-0 flex list-none flex-col gap-1 p-1">
						<li v-for="u in overview?.topUsernames ?? []" :key="u.username" class="relative overflow-hidden rounded-md px-2 py-1.5">
							<span
								class="absolute inset-y-0 left-0 bg-series-login/10"
								:style="{ width: `${(u.hits / maxUsernameHits) * 100}%` }"
								aria-hidden="true"
							></span>
							<span class="relative flex items-center justify-between gap-2 text-sm">
								<span class="min-w-0 truncate font-mono text-ink-secondary">{{ u.username }}</span>
								<span class="font-mono text-xs text-ink-muted tabular-nums">{{ u.hits }}</span>
							</span>
						</li>
						<li v-if="!overview?.topUsernames.length" class="px-2 py-4 text-center text-sm text-ink-muted">no login attempts in this window</li>
					</ul>
				</Panel>

				<Panel title="Top offenders · 24h">
					<template #actions>
						<RouterLink to="/offenders" class="text-xs text-accent no-underline hover:underline">All offenders →</RouterLink>
					</template>
					<ul class="m-0 flex list-none flex-col gap-0.5 p-1">
						<li v-for="o in offenders" :key="o.srcIp ?? 'null'" class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm">
							<CountryFlag :country-code="o.countryCode" :as-org="o.asOrg" />
							<span class="min-w-0 flex-1 truncate font-mono text-ink">{{ o.srcIp ?? "—" }}</span>
							<UiBadge :tone="classTone[o.classification]">{{ o.classification }}</UiBadge>
							<span class="w-12 text-right font-mono text-xs text-ink-muted tabular-nums">{{ o.hits }}</span>
						</li>
						<li v-if="offenders.length === 0" class="px-2 py-4 text-center text-sm text-ink-muted">no offenders in this window</li>
					</ul>
				</Panel>
			</div>
		</div>
	</section>
</template>
