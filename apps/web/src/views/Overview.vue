<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { fetchConnections, fetchStats, type RecentConnection, type Stats } from "../api";
import { useAuthGuard } from "../composables/useAuthGuard";

const guard = useAuthGuard();
const stats = ref<Stats | null>(null);
const connections = ref<RecentConnection[]>([]);
let timer: ReturnType<typeof setInterval> | undefined;

async function refresh(): Promise<void> {
	const [s, c] = await Promise.all([guard(() => fetchStats(60)), guard(() => fetchConnections({ limit: 25 }))]);
	if (s) stats.value = s;
	if (c) connections.value = c;
}

function fmtTime(iso: string): string {
	return new Date(iso).toLocaleTimeString();
}

onMounted(() => {
	void refresh();
	timer = setInterval(() => void refresh(), 5000);
});
onUnmounted(() => timer && clearInterval(timer));
</script>

<template>
	<section>
		<h1>Overview</h1>
		<div class="tiles">
			<div class="card tile">
				<div class="value">{{ stats ? stats.hitsPerMinute.toFixed(1) : "—" }}</div>
				<div class="label">hits / min (60m)</div>
			</div>
			<div class="card tile">
				<div class="value">{{ stats?.total ?? "—" }}</div>
				<div class="label">connections (60m)</div>
			</div>
			<div class="card tile">
				<div class="value">{{ stats?.uniqueIps ?? "—" }}</div>
				<div class="label">unique IPs</div>
			</div>
			<div class="card tile">
				<div class="value">{{ stats?.statusCount ?? "—" }} / {{ stats?.loginCount ?? "—" }}</div>
				<div class="label">status / login</div>
			</div>
		</div>

		<h2>Recent connections</h2>
		<div class="card">
			<table>
				<thead>
					<tr>
						<th>time</th>
						<th>source IP</th>
						<th>hostname used</th>
						<th>intent</th>
						<th>username</th>
					</tr>
				</thead>
				<tbody>
					<!-- {{ }} escapes attacker-controlled strings; never v-html. -->
					<tr v-for="c in connections" :key="c.eventId">
						<td>{{ fmtTime(c.receivedAt) }}</td>
						<td>{{ c.srcIp ?? "—" }}</td>
						<td>{{ c.serverAddress ?? "—" }}</td>
						<td>{{ c.intent }}</td>
						<td>{{ c.username ?? "—" }}</td>
					</tr>
					<tr v-if="connections.length === 0">
						<td colspan="5">no connections yet</td>
					</tr>
				</tbody>
			</table>
		</div>
	</section>
</template>

<style scoped>
.tiles {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
	gap: 1rem;
	margin: 1rem 0 1.5rem;
}
.tile {
	text-align: center;
}
.value {
	font-size: 2rem;
	font-weight: 600;
}
.label {
	color: var(--text-secondary);
	font-size: 0.85rem;
}
</style>
