<script setup lang="ts">
import { onMounted, ref } from "vue";
import { createToken, fetchDaemons, revokeDaemon, type DaemonListItem } from "../api";
import { useAuthGuard } from "../composables/useAuthGuard";

const guard = useAuthGuard();
const daemons = ref<DaemonListItem[]>([]);
const newToken = ref<string | null>(null);

async function load(): Promise<void> {
	const d = await guard(() => fetchDaemons());
	if (d) daemons.value = d;
}

async function mint(): Promise<void> {
	const res = await guard(() => createToken());
	if (res) newToken.value = res.token;
}

async function revoke(id: string): Promise<void> {
	await guard(() => revokeDaemon(id));
	await load();
}

// Online = a heartbeat within the last 2 minutes (daemons poll on an interval).
function isOnline(d: DaemonListItem): boolean {
	return d.lastSeenAt !== null && Date.now() - new Date(d.lastSeenAt).getTime() < 120_000;
}
function ago(iso: string | null): string {
	if (!iso) return "never";
	const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
	if (s < 60) return `${s}s ago`;
	if (s < 3600) return `${Math.floor(s / 60)}m ago`;
	return `${Math.floor(s / 3600)}h ago`;
}

onMounted(() => void load());
</script>

<template>
	<section>
		<div class="head">
			<h1>Daemons</h1>
			<button @click="mint">Enroll new daemon</button>
		</div>

		<div v-if="newToken" class="card token">
			<strong>Enrollment token</strong> (single-use) — set it as <code>MCPOT_ENROLLMENT_TOKEN</code> on the new host:
			<pre>{{ newToken }}</pre>
		</div>

		<div class="card">
			<table>
				<thead>
					<tr>
						<th>status</th>
						<th>hostname</th>
						<th>version</th>
						<th>last seen</th>
						<th>queue</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="d in daemons" :key="d.id">
						<td>
							<span class="dot" :class="{ on: isOnline(d), revoked: d.revoked }"></span>
							{{ d.revoked ? "revoked" : isOnline(d) ? "online" : "offline" }}
						</td>
						<td>{{ d.hostname ?? "—" }}</td>
						<td>{{ d.versionName }}</td>
						<td>{{ ago(d.lastSeenAt) }}</td>
						<td>{{ d.queueDepth ?? "—" }}</td>
						<td><button v-if="!d.revoked" class="danger" @click="revoke(d.id)">Revoke</button></td>
					</tr>
					<tr v-if="daemons.length === 0">
						<td colspan="6">no daemons enrolled yet</td>
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
.token {
	margin: 1rem 0;
	font-size: 0.9rem;
}
.token pre {
	background: var(--page);
	padding: 0.6rem;
	border-radius: 6px;
	overflow-x: auto;
	margin: 0.5rem 0 0;
}
.dot {
	display: inline-block;
	width: 8px;
	height: 8px;
	border-radius: 50%;
	background: var(--muted);
	margin-right: 6px;
}
.dot.on {
	background: var(--good);
}
.dot.revoked {
	background: var(--critical);
}
.danger {
	color: var(--critical);
	border-color: var(--critical);
}
</style>
