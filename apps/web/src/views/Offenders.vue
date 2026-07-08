<script setup lang="ts">
import { onMounted, ref } from "vue";
import { fetchConnections, fetchOffenders, type Offender, type RecentConnection } from "../api";
import { useAuthGuard } from "../composables/useAuthGuard";

const guard = useAuthGuard();
const offenders = ref<Offender[]>([]);
const windowHours = ref(24);
const selectedIp = ref<string | null>(null);
const drilldown = ref<RecentConnection[]>([]);

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

function fmt(iso: string): string {
	return new Date(iso).toLocaleString();
}

onMounted(() => void load());
</script>

<template>
	<section>
		<div class="head">
			<h1>Offenders</h1>
			<select v-model.number="windowHours" @change="load">
				<option :value="24">last 24h</option>
				<option :value="168">last 7d</option>
			</select>
		</div>

		<div class="card">
			<table>
				<thead>
					<tr>
						<th>source IP</th>
						<th>hits</th>
						<th>logins</th>
						<th>daemons hit</th>
						<th>last seen</th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="o in offenders" :key="o.srcIp ?? 'null'" class="row" @click="drill(o.srcIp)">
						<td>{{ o.srcIp ?? "—" }}</td>
						<td>{{ o.hits }}</td>
						<td>{{ o.logins }}</td>
						<td>{{ o.daemonsHit }}</td>
						<td>{{ fmt(o.lastSeen) }}</td>
					</tr>
					<tr v-if="offenders.length === 0">
						<td colspan="5">no offenders in this window</td>
					</tr>
				</tbody>
			</table>
		</div>

		<div v-if="selectedIp" class="card drill">
			<h2>{{ selectedIp }} — activity across the fleet</h2>
			<table>
				<thead>
					<tr>
						<th>time</th>
						<th>hostname used</th>
						<th>protocol</th>
						<th>intent</th>
						<th>username</th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="c in drilldown" :key="c.eventId">
						<td>{{ fmt(c.receivedAt) }}</td>
						<td>{{ c.serverAddress ?? "—" }}</td>
						<td>{{ c.protocolVersion ?? "—" }}</td>
						<td>{{ c.intent }}</td>
						<td>{{ c.username ?? "—" }}</td>
					</tr>
				</tbody>
			</table>
		</div>
	</section>
</template>

<style scoped>
.head {
	display: flex;
	align-items: center;
	justify-content: space-between;
}
.row {
	cursor: pointer;
}
.row:hover {
	background: var(--page);
}
.drill {
	margin-top: 1.5rem;
}
</style>
