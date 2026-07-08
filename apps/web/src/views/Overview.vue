<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { useOverviewStore } from "../stores/overview";

const store = useOverviewStore();

onMounted(() => store.start());
onUnmounted(() => store.stop());

function fmtTime(iso: string): string {
	return new Date(iso).toLocaleTimeString();
}
</script>

<template>
  <section>
    <h1>Honeypot Network — Overview</h1>
    <p
      v-if="store.error"
      class="error"
    >
      Error: {{ store.error }}
    </p>

    <div class="tiles">
      <div class="tile">
        <div class="value">
          {{ store.stats ? store.stats.hitsPerMinute.toFixed(1) : "—" }}
        </div>
        <div class="label">
          hits / min (60m)
        </div>
      </div>
      <div class="tile">
        <div class="value">
          {{ store.stats?.total ?? "—" }}
        </div>
        <div class="label">
          connections (60m)
        </div>
      </div>
      <div class="tile">
        <div class="value">
          {{ store.stats?.uniqueIps ?? "—" }}
        </div>
        <div class="label">
          unique IPs
        </div>
      </div>
      <div class="tile">
        <div class="value">
          {{ store.stats?.statusCount ?? "—" }} / {{ store.stats?.loginCount ?? "—" }}
        </div>
        <div class="label">
          status / login
        </div>
      </div>
    </div>

    <h2>Recent connections</h2>
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
        <!-- {{ }} escapes attacker-controlled strings; never use v-html here. -->
        <tr
          v-for="c in store.connections"
          :key="c.eventId"
        >
          <td>{{ fmtTime(c.receivedAt) }}</td>
          <td>{{ c.srcIp ?? "—" }}</td>
          <td>{{ c.serverAddress ?? "—" }}</td>
          <td>{{ c.intent }}</td>
          <td>{{ c.username ?? "—" }}</td>
        </tr>
        <tr v-if="store.connections.length === 0">
          <td colspan="5">
            no connections yet
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
section {
	max-width: 900px;
	margin: 2rem auto;
	font-family: system-ui, sans-serif;
}
.tiles {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
	gap: 1rem;
	margin: 1.5rem 0;
}
.tile {
	border: 1px solid #ccc;
	border-radius: 8px;
	padding: 1rem;
	text-align: center;
}
.value {
	font-size: 2rem;
	font-weight: 600;
}
.label {
	color: #666;
	font-size: 0.85rem;
}
table {
	width: 100%;
	border-collapse: collapse;
}
th,
td {
	text-align: left;
	padding: 0.4rem 0.6rem;
	border-bottom: 1px solid #eee;
	font-size: 0.9rem;
}
.error {
	color: #b00;
}
</style>
