<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import {
	fetchConnections,
	fetchOffenders,
	reportOffender,
	type Offender,
	type OffenderSortBy,
	type RecentConnection,
	type SortOrder,
} from "../api";
import { useAuthGuard } from "../composables/useAuthGuard";
import { useToast } from "../composables/useToast";
import { fmtDateTime } from "../lib/format";
import PageHeader from "../components/PageHeader.vue";
import Panel from "../components/Panel.vue";
import ConnectionsTable from "../components/ConnectionsTable.vue";
import CountryFlag from "../components/CountryFlag.vue";
import UiBadge from "../components/ui/UiBadge.vue";
import UiButton from "../components/ui/UiButton.vue";
import UiSelect from "../components/ui/UiSelect.vue";
import UiTooltip from "../components/ui/UiTooltip.vue";

const guard = useAuthGuard();
const { toast } = useToast();
const offenders = ref<Offender[]>([]);
const windowHours = ref(24);
const selectedIp = ref<string | null>(null);
const drilldown = ref<RecentConnection[]>([]);
const sortBy = ref<OffenderSortBy>("lastSeen");
const order = ref<SortOrder>("desc");
const page = ref(1);
const pageSize = 50;
const total = ref(0);
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));

const windows = [
	{ label: "last 24h", value: 24 },
	{ label: "last 7d", value: 168 },
];

const classTone = { scanner: "critical", suspicious: "warn", prober: "neutral" } as const;

async function report(ip: string | null): Promise<void> {
	if (!ip) return;
	const res = await guard(() => reportOffender(ip));
	if (!res) return;
	if (res.reported) toast(`Reported ${ip}`, { description: `Sent to: ${res.sinks.join(", ")}`, tone: "good" });
	else toast(`No reporting sink configured`, { description: `${ip} was not reported — set ABUSEIPDB_KEY or WEBHOOK_URL on the server.` });
}

async function load(): Promise<void> {
	const res = await guard(() =>
		fetchOffenders({
			windowHours: windowHours.value,
			limit: pageSize,
			offset: (page.value - 1) * pageSize,
			sortBy: sortBy.value,
			order: order.value,
		}),
	);
	if (!res) return;
	offenders.value = res.rows;
	total.value = res.total;
	// The window slid or rows were purged since the last fetch — snap back to page 1.
	if (res.rows.length === 0 && page.value > 1) page.value = 1;
}

function setSort(col: OffenderSortBy): void {
	if (sortBy.value === col) order.value = order.value === "desc" ? "asc" : "desc";
	else {
		sortBy.value = col;
		order.value = "desc";
	}
}

/** Human-readable list of the scanner signals present for a row, for the score tooltip. */
function signalSummary(o: Offender): string {
	const parts: string[] = [];
	if (o.rawHostnameHits > 0) parts.push(`${o.rawHostnameHits} raw-IP hostnames`);
	if (o.anomalyHits > 0) parts.push(`${o.anomalyHits} protocol anomalies`);
	if (o.abnormalProtoHits > 0) parts.push(`${o.abnormalProtoHits} abnormal versions`);
	if (o.incompletePingHits > 0) parts.push(`${o.incompletePingHits} incomplete pings`);
	if (o.distinctUsernames >= 2) parts.push(`${o.distinctUsernames} usernames`);
	if (o.distinctAddresses >= 2) parts.push(`${o.distinctAddresses} hostnames`);
	if (o.distinctProtocols >= 2) parts.push(`${o.distinctProtocols} protocol versions`);
	if (o.rateLimitedDrops > 0) parts.push(`${o.rateLimitedDrops} rate-limited drops`);
	return parts.length ? parts.join(" · ") : "no scanner signals";
}

function indicator(col: OffenderSortBy): string {
	return sortBy.value === col ? (order.value === "desc" ? "▼" : "▲") : "";
}

function ariaSort(col: OffenderSortBy): "ascending" | "descending" | "none" {
	return sortBy.value === col ? (order.value === "desc" ? "descending" : "ascending") : "none";
}

async function drill(ip: string | null): Promise<void> {
	if (!ip) return;
	selectedIp.value = ip;
	const rows = await guard(() => fetchConnections({ srcIp: ip, limit: 100 }));
	if (rows) drilldown.value = rows;
}

// A param change on a later page resets to page 1, whose watcher fires the load — avoids a double fetch.
watch([windowHours, sortBy, order], () => {
	if (page.value !== 1) page.value = 1;
	else void load();
});
watch(page, () => void load());
onMounted(() => void load());
</script>

<template>
	<section>
		<PageHeader title="Offenders" eyebrow="Honeypot network">
			<template #actions>
				<UiSelect v-model="windowHours" :options="windows" />
			</template>
		</PageHeader>

		<Panel title="Top source IPs by activity">
			<div class="overflow-x-auto">
				<table class="w-full border-collapse text-sm tabular-nums">
					<thead>
						<tr class="[&>th]:border-b [&>th]:border-grid [&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-mono [&>th]:text-[11px] [&>th]:font-medium [&>th]:tracking-[0.14em] [&>th]:uppercase [&>th]:text-ink-muted">
							<th>Source IP</th>
							<th>Network</th>
							<th>Class</th>
							<th class="cursor-pointer select-none" :aria-sort="ariaSort('score')" @click="setSort('score')">
								<UiTooltip content="0–100 from scanner signals: raw-IP hostnames, daemons hit, protocol anomalies, username/hostname/version churn, incomplete pings, rate-limited floods">
									<span>Score</span>
								</UiTooltip>
								<span class="ml-1">{{ indicator("score") }}</span>
							</th>
							<th>AbuseIPDB</th>
							<th class="cursor-pointer select-none" :aria-sort="ariaSort('hits')" @click="setSort('hits')">
								Hits<span class="ml-1">{{ indicator("hits") }}</span>
							</th>
							<th class="cursor-pointer select-none" :aria-sort="ariaSort('logins')" @click="setSort('logins')">
								Logins<span class="ml-1">{{ indicator("logins") }}</span>
							</th>
							<th class="cursor-pointer select-none" :aria-sort="ariaSort('daemonsHit')" @click="setSort('daemonsHit')">
								Daemons<span class="ml-1">{{ indicator("daemonsHit") }}</span>
							</th>
							<th class="cursor-pointer select-none whitespace-nowrap" :aria-sort="ariaSort('lastSeen')" @click="setSort('lastSeen')">
								Last seen<span class="ml-1">{{ indicator("lastSeen") }}</span>
							</th>
							<th></th>
						</tr>
					</thead>
					<tbody>
						<tr
							v-for="o in offenders"
							:key="o.srcIp ?? 'null'"
							class="cursor-pointer transition-colors hover:bg-raised [&>td]:border-b [&>td]:border-grid [&>td]:px-3 [&>td]:py-2"
							:class="selectedIp === o.srcIp ? 'bg-raised' : ''"
							@click="drill(o.srcIp)"
						>
							<td class="font-mono text-ink">
								<span class="mr-1.5"><CountryFlag :country-code="o.countryCode" :as-org="o.asOrg" /></span>{{ o.srcIp ?? "—" }}
							</td>
							<td class="max-w-44 truncate text-ink-secondary">{{ o.asOrg ?? "—" }}</td>
							<td><UiBadge :tone="classTone[o.classification]">{{ o.classification }}</UiBadge></td>
							<td class="font-mono" :class="o.score >= 60 ? 'text-critical' : o.score >= 30 ? 'text-warn' : 'text-ink-secondary'">
									<UiTooltip :content="signalSummary(o)"><span>{{ o.score }}</span></UiTooltip>
								</td>
							<td class="font-mono text-ink-secondary">
								<template v-if="o.abuseCheck?.status === 'succeeded'">
									<span :class="(o.abuseCheck.abuseConfidenceScore ?? 0) >= 60 ? 'text-critical' : 'text-ink-secondary'">
										{{ o.abuseCheck.abuseConfidenceScore ?? "—" }}%
									</span>
									<span class="ml-1 text-xs">({{ o.abuseCheck.totalReports ?? 0 }})</span>
								</template>
								<span v-else-if="o.abuseCheck" class="text-xs text-ink-muted">{{ o.abuseCheck.status }}</span>
								<span v-else>—</span>
							</td>
							<td class="font-mono text-ink-secondary">{{ o.hits }}</td>
							<td class="font-mono" :class="o.logins > 0 ? 'text-accent' : 'text-ink-secondary'">{{ o.logins }}</td>
							<td class="font-mono text-ink-secondary">{{ o.daemonsHit }}</td>
							<td class="whitespace-nowrap text-ink-secondary">{{ fmtDateTime(o.lastSeen) }}</td>
							<td class="text-right">
								<UiButton size="sm" @click.stop="report(o.srcIp)">Report</UiButton>
							</td>
						</tr>
						<tr v-if="offenders.length === 0">
							<td colspan="10" class="px-3 py-6 text-center text-ink-muted">no offenders in this window</td>
						</tr>
					</tbody>
				</table>
			</div>
			<div class="flex items-center justify-between px-3 pt-3 text-xs text-ink-muted">
				<span class="tabular-nums">{{ total }} source IPs</span>
				<div class="flex items-center gap-2">
					<UiButton size="sm" :disabled="page <= 1" @click="page--">Prev</UiButton>
					<span class="tabular-nums">page {{ page }} of {{ totalPages }}</span>
					<UiButton size="sm" :disabled="page >= totalPages" @click="page++">Next</UiButton>
				</div>
			</div>
		</Panel>

		<div v-if="selectedIp" class="mt-4">
			<Panel :title="`${selectedIp} · activity across the fleet`">
				<ConnectionsTable :rows="drilldown" :show-src-ip="false" show-protocol time-style="datetime" empty-text="no recorded activity" />
			</Panel>
		</div>
	</section>
</template>
