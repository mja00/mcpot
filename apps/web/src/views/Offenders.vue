<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { fetchConnections, fetchOffenders, reportOffender, type Offender, type RecentConnection } from "../api";
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
	const o = await guard(() => fetchOffenders(windowHours.value, 50));
	if (o) offenders.value = o;
}

async function drill(ip: string | null): Promise<void> {
	if (!ip) return;
	selectedIp.value = ip;
	const rows = await guard(() => fetchConnections({ srcIp: ip, limit: 100 }));
	if (rows) drilldown.value = rows;
}

watch(windowHours, () => void load());
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
							<th>
								<UiTooltip content="0–100 from scanner signals: raw-IP hostnames, abnormal protocol versions, distinct usernames, daemons hit">
									<span>Score</span>
								</UiTooltip>
							</th>
							<th>Hits</th>
							<th>Logins</th>
							<th>Daemons</th>
							<th>Last seen</th>
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
							<td class="font-mono" :class="o.score >= 60 ? 'text-critical' : o.score >= 30 ? 'text-warn' : 'text-ink-secondary'">{{ o.score }}</td>
							<td class="font-mono text-ink-secondary">{{ o.hits }}</td>
							<td class="font-mono" :class="o.logins > 0 ? 'text-accent' : 'text-ink-secondary'">{{ o.logins }}</td>
							<td class="font-mono text-ink-secondary">{{ o.daemonsHit }}</td>
							<td class="whitespace-nowrap text-ink-secondary">{{ fmtDateTime(o.lastSeen) }}</td>
							<td class="text-right">
								<UiButton size="sm" @click.stop="report(o.srcIp)">Report</UiButton>
							</td>
						</tr>
						<tr v-if="offenders.length === 0">
							<td colspan="9" class="px-3 py-6 text-center text-ink-muted">no offenders in this window</td>
						</tr>
					</tbody>
				</table>
			</div>
		</Panel>

		<div v-if="selectedIp" class="mt-4">
			<Panel :title="`${selectedIp} · activity across the fleet`">
				<ConnectionsTable :rows="drilldown" :show-src-ip="false" show-protocol time-style="datetime" empty-text="no recorded activity" />
			</Panel>
		</div>
	</section>
</template>
