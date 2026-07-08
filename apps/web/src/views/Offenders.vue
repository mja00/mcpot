<script setup lang="ts">
import { onMounted, ref } from "vue";
import { fetchConnections, fetchOffenders, reportOffender, type Offender, type RecentConnection } from "../api";
import { useAuthGuard } from "../composables/useAuthGuard";

const guard = useAuthGuard();
const offenders = ref<Offender[]>([]);
const windowHours = ref(24);
const selectedIp = ref<string | null>(null);
const drilldown = ref<RecentConnection[]>([]);
const reportMsg = ref<string | null>(null);

async function report(ip: string | null): Promise<void> {
	if (!ip) return;
	const res = await guard(() => reportOffender(ip));
	if (res) reportMsg.value = res.reported ? `Reported ${ip} to: ${res.sinks.join(", ")}` : `No reporting sink configured for ${ip}`;
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

		<p v-if="reportMsg" class="report-msg">{{ reportMsg }}</p>
		<div class="card">
			<table>
				<thead>
					<tr>
						<th>source IP</th>
						<th>class</th>
						<th>score</th>
						<th>hits</th>
						<th>logins</th>
						<th>daemons</th>
						<th>last seen</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="o in offenders" :key="o.srcIp ?? 'null'" class="row" @click="drill(o.srcIp)">
						<td>{{ o.srcIp ?? "—" }}</td>
						<td><span class="badge" :class="o.classification">{{ o.classification }}</span></td>
						<td>{{ o.score }}</td>
						<td>{{ o.hits }}</td>
						<td>{{ o.logins }}</td>
						<td>{{ o.daemonsHit }}</td>
						<td>{{ fmt(o.lastSeen) }}</td>
						<td><button class="report" @click.stop="report(o.srcIp)">Report</button></td>
					</tr>
					<tr v-if="offenders.length === 0">
						<td colspan="8">no offenders in this window</td>
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
.badge {
	font-size: 0.75rem;
	padding: 0.1rem 0.45rem;
	border-radius: 999px;
	border: 1px solid var(--border);
	text-transform: capitalize;
}
.badge.scanner {
	color: var(--critical);
	border-color: var(--critical);
}
.badge.suspicious {
	color: #b06a00;
}
.report {
	font-size: 0.8rem;
	padding: 0.2rem 0.5rem;
}
.report-msg {
	color: var(--text-secondary);
	font-size: 0.9rem;
}
</style>
