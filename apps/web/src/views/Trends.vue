<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { fetchTrends, type TrendsResponse } from "../api";
import { useAuthGuard } from "../composables/useAuthGuard";
import { isOnline, timeAgo } from "../lib/format";
import DaemonTrendChart from "../components/DaemonTrendChart.vue";
import PageHeader from "../components/PageHeader.vue";
import Panel from "../components/Panel.vue";
import RankingChart from "../components/RankingChart.vue";
import StatTile from "../components/StatTile.vue";
import StatusDot from "../components/StatusDot.vue";
import TrendChart from "../components/TrendChart.vue";
import UiBadge from "../components/ui/UiBadge.vue";
import UiButton from "../components/ui/UiButton.vue";
import UiSelect from "../components/ui/UiSelect.vue";

type Tab = "activity" | "threats" | "daemons";

const guard = useAuthGuard();
const route = useRoute();
const router = useRouter();
const data = ref<TrendsResponse | null>(null);
const hours = ref(24);
const loading = ref(false);
const error = ref<string | null>(null);
let requestSequence = 0;

const windows = [
	{ label: "6h", value: 6 },
	{ label: "24h", value: 24 },
	{ label: "7d", value: 168 },
	{ label: "30d", value: 720 },
];

const tabs: { id: Tab; label: string }[] = [
	{ id: "activity", label: "Activity" },
	{ id: "threats", label: "Threats" },
	{ id: "daemons", label: "Daemons" },
];

const activeTab = computed<Tab>(() => {
	const tab = Array.isArray(route.query.tab) ? route.query.tab[0] : route.query.tab;
	return tab === "threats" || tab === "daemons" ? tab : "activity";
});

async function selectTab(tab: Tab): Promise<void> {
	await router.replace({ query: { ...route.query, tab: tab === "activity" ? undefined : tab } });
}

async function moveTab(event: KeyboardEvent, index: number): Promise<void> {
	let next = index;
	if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
	else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
	else if (event.key === "Home") next = 0;
	else if (event.key === "End") next = tabs.length - 1;
	else return;
	event.preventDefault();
	const tab = tabs[next]!;
	await selectTab(tab.id);
	document.getElementById(`tab-${tab.id}`)?.focus();
}

async function load(): Promise<void> {
	const sequence = ++requestSequence;
	loading.value = true;
	error.value = null;
	try {
		const response = await guard(() => fetchTrends(hours.value));
		if (sequence === requestSequence && response) data.value = response;
	} catch {
		if (sequence === requestSequence) error.value = "Analytics could not be loaded. The previous range is still shown.";
	} finally {
		if (sequence === requestSequence) loading.value = false;
	}
}

function delta(current: number, previous: number): string {
	if (previous === 0) return current === 0 ? "0%" : "new";
	const percent = Math.round(((current - previous) / previous) * 100);
	return `${percent > 0 ? "+" : ""}${percent}%`;
}

const summaryTiles = computed(() => {
	if (!data.value) return [];
	const { current, previous } = data.value.summary;
	return [
		{ label: "Connections", value: current.total, change: delta(current.total, previous.total), hint: "All captured connections in the selected range" },
		{ label: "Unique IPs", value: current.uniqueIps, change: delta(current.uniqueIps, previous.uniqueIps), hint: "Distinct non-null source addresses" },
		{ label: "Login attempts", value: current.loginCount, change: delta(current.loginCount, previous.loginCount), hint: "Connections that proceeded to the login intent" },
		{ label: "Daemons hit", value: current.activeDaemons, change: delta(current.activeDaemons, previous.activeDaemons), hint: "Daemons receiving at least one connection" },
	];
});

const regionNames = typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames(undefined, { type: "region" }) : null;
const countryChart = computed(() =>
	(data.value?.countries ?? []).map((row) => ({
		label: row.countryCode ? (regionNames?.of(row.countryCode.toUpperCase()) ?? row.countryCode.toUpperCase()) : "Unknown",
		value: row.hits,
	})),
);
const networkChart = computed(() =>
	(data.value?.networks ?? []).map((row) => ({
		label: row.asn ? `AS${row.asn} ${row.asOrg ?? ""}`.trim() : "Unknown",
		value: row.hits,
	})),
);
const maxAddressHits = computed(() => Math.max(...(data.value?.serverAddresses.map((row) => row.hits) ?? []), 1));
const maxUsernameHits = computed(() => Math.max(...(data.value?.usernames.map((row) => row.hits) ?? []), 1));

function daemonState(daemon: TrendsResponse["daemons"][number]): "good" | "off" | "critical" {
	return daemon.revoked ? "critical" : isOnline(daemon.lastSeenAt) ? "good" : "off";
}

watch(hours, () => void load());
onMounted(() => void load());
</script>

<template>
	<section>
		<PageHeader title="Trends" eyebrow="Honeypot network">
			<template #actions>
				<span v-if="loading" class="font-mono text-xs text-ink-muted">updating…</span>
				<UiSelect v-model="hours" :options="windows" />
			</template>
		</PageHeader>

		<div v-if="error" class="mb-4 flex items-center justify-between gap-3 rounded-xl border border-critical/40 bg-critical/5 px-4 py-3 text-sm text-critical">
			<span>{{ error }}</span>
			<UiButton size="sm" @click="load">Retry</UiButton>
		</div>

		<div class="mb-4 grid grid-cols-4 gap-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
			<StatTile v-for="tile in summaryTiles" :key="tile.label" :label="tile.label" :value="String(tile.value)" :hint="tile.hint">
				<UiBadge :tone="tile.change === '0%' ? 'neutral' : 'accent'">{{ tile.change }}</UiBadge>
			</StatTile>
			<template v-if="!data">
				<StatTile v-for="label in ['Connections', 'Unique IPs', 'Login attempts', 'Daemons hit']" :key="label" :label="label" value="—" />
			</template>
		</div>

		<div class="mb-4 flex gap-1 rounded-xl border border-line bg-surface p-1" role="tablist" aria-label="Trend analysis">
			<button
				v-for="(tab, index) in tabs"
				:id="`tab-${tab.id}`"
				:key="tab.id"
				type="button"
				role="tab"
				:aria-selected="activeTab === tab.id"
				:tabindex="activeTab === tab.id ? 0 : -1"
				class="cursor-pointer rounded-lg border-0 px-4 py-2 font-mono text-xs tracking-[0.12em] uppercase transition-colors"
				:class="activeTab === tab.id ? 'bg-raised text-accent' : 'bg-transparent text-ink-muted hover:text-ink'"
				@click="selectTab(tab.id)"
				@keydown="moveTab($event, index)"
			>
				{{ tab.label }}
			</button>
		</div>

		<div v-if="data" role="tabpanel" :aria-labelledby="`tab-${activeTab}`">
			<div v-if="activeTab === 'activity'" class="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
				<Panel title="Connections and unique sources">
					<TrendChart v-if="data.summary.current.total" :buckets="data.series" kind="activity" />
					<p v-else class="px-3 py-10 text-center text-sm text-ink-muted">No connection data in this window yet.</p>
				</Panel>
				<Panel title="Intent mix">
					<TrendChart v-if="data.summary.current.total" :buckets="data.series" kind="intent" />
					<p v-else class="px-3 py-10 text-center text-sm text-ink-muted">No connection data in this window yet.</p>
				</Panel>
			</div>

			<div v-else-if="activeTab === 'threats'" class="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
				<Panel title="Top source countries">
					<RankingChart v-if="countryChart.length" :rows="countryChart" />
					<p v-else class="px-3 py-10 text-center text-sm text-ink-muted">No geographic data in this window.</p>
				</Panel>
				<Panel title="Top source networks">
					<RankingChart v-if="networkChart.length" :rows="networkChart" />
					<p v-else class="px-3 py-10 text-center text-sm text-ink-muted">No network data in this window.</p>
				</Panel>
				<Panel title="Top hostnames targeted">
					<ul class="m-0 flex list-none flex-col gap-1 p-1">
						<li v-for="row in data.serverAddresses" :key="row.serverAddress" class="relative overflow-hidden rounded-md px-2 py-2">
							<span class="absolute inset-y-0 left-0 bg-accent/10" :style="{ width: `${(row.hits / maxAddressHits) * 100}%` }"></span>
							<span class="relative flex justify-between gap-3"><span class="truncate font-mono text-sm text-ink">{{ row.serverAddress }}</span><span class="font-mono text-xs text-ink-muted">{{ row.hits }}</span></span>
						</li>
						<li v-if="!data.serverAddresses.length" class="px-2 py-8 text-center text-sm text-ink-muted">No hostnames targeted in this window.</li>
					</ul>
				</Panel>
				<Panel title="Top usernames attempted">
					<ul class="m-0 flex list-none flex-col gap-1 p-1">
						<li v-for="row in data.usernames" :key="row.username" class="relative overflow-hidden rounded-md px-2 py-2">
							<span class="absolute inset-y-0 left-0 bg-series-login/10" :style="{ width: `${(row.hits / maxUsernameHits) * 100}%` }"></span>
							<span class="relative flex justify-between gap-3"><span class="truncate font-mono text-sm text-ink">{{ row.username }}</span><span class="font-mono text-xs text-ink-muted">{{ row.hits }}</span></span>
						</li>
						<li v-if="!data.usernames.length" class="px-2 py-8 text-center text-sm text-ink-muted">No login usernames in this window.</li>
					</ul>
				</Panel>
			</div>

			<div v-else class="flex flex-col gap-4">
				<Panel title="Traffic by daemon">
					<DaemonTrendChart v-if="data.summary.current.total" :data="data.daemonSeries" />
					<p v-else class="px-3 py-10 text-center text-sm text-ink-muted">No daemon traffic in this window yet.</p>
				</Panel>
				<Panel title="Fleet activity and current health">
					<div class="overflow-x-auto">
						<table class="w-full border-collapse text-sm tabular-nums">
							<thead><tr class="[&>th]:border-b [&>th]:border-grid [&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-mono [&>th]:text-[11px] [&>th]:font-medium [&>th]:tracking-[0.14em] [&>th]:uppercase [&>th]:text-ink-muted">
								<th>Status</th><th>Daemon</th><th>Hits</th><th>Share</th><th>Unique IPs</th><th>Logins</th><th>Last seen</th><th>Queue</th>
							</tr></thead>
							<tbody>
								<tr v-for="daemon in data.daemons" :key="daemon.daemonId" class="[&>td]:border-b [&>td]:border-grid [&>td]:px-3 [&>td]:py-2">
									<td><span class="inline-flex items-center gap-2"><StatusDot :state="daemonState(daemon)" /><UiBadge :tone="daemon.revoked ? 'critical' : isOnline(daemon.lastSeenAt) ? 'good' : 'neutral'">{{ daemon.revoked ? 'revoked' : isOnline(daemon.lastSeenAt) ? 'online' : 'offline' }}</UiBadge></span></td>
									<td class="font-mono text-ink">{{ daemon.daemonHostname ?? daemon.daemonId.slice(0, 8) }}</td>
									<td class="font-mono text-ink">{{ daemon.hits }}</td>
									<td class="font-mono text-ink-secondary">{{ (daemon.share * 100).toFixed(1) }}%</td>
									<td class="font-mono text-ink-secondary">{{ daemon.uniqueIps }}</td>
									<td class="font-mono" :class="daemon.loginCount ? 'text-accent' : 'text-ink-secondary'">{{ daemon.loginCount }}</td>
									<td class="whitespace-nowrap text-ink-secondary">{{ timeAgo(daemon.lastSeenAt) }}</td>
									<td class="font-mono" :class="daemon.queueDepth ? 'text-warn' : 'text-ink-secondary'">{{ daemon.queueDepth ?? '—' }}</td>
								</tr>
								<tr v-if="!data.daemons.length"><td colspan="8" class="px-3 py-8 text-center text-ink-muted">No daemons enrolled yet.</td></tr>
							</tbody>
						</table>
					</div>
				</Panel>
			</div>
		</div>
	</section>
</template>
