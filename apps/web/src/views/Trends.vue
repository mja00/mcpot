<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { use } from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import VChart from "vue-echarts";
import { fetchTrends, type TrendBucket } from "../api";
import { useAuthGuard } from "../composables/useAuthGuard";

use([LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

const guard = useAuthGuard();
const buckets = ref<TrendBucket[]>([]);
const hours = ref(24);

// Read theme tokens so the chart matches light/dark (validated dataviz palette).
function cssVar(name: string): string {
	return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

async function load(): Promise<void> {
	const t = await guard(() => fetchTrends(hours.value));
	if (t) buckets.value = t;
}

const option = computed(() => {
	const statusColor = cssVar("--series-status");
	const loginColor = cssVar("--series-login");
	const ink = cssVar("--text-secondary");
	const grid = cssVar("--grid");
	const labels = buckets.value.map((b) => new Date(b.bucket).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit" }));
	return {
		textStyle: { fontFamily: "system-ui, sans-serif", color: ink },
		tooltip: { trigger: "axis" },
		legend: { data: ["status", "login"], textStyle: { color: ink }, top: 0 },
		grid: { left: 44, right: 16, top: 36, bottom: 40 },
		xAxis: {
			type: "category",
			data: labels,
			axisLine: { lineStyle: { color: grid } },
			axisLabel: { color: ink },
		},
		yAxis: {
			type: "value",
			splitLine: { lineStyle: { color: grid } },
			axisLabel: { color: ink },
		},
		series: [
			{ name: "status", type: "line", smooth: true, showSymbol: false, lineStyle: { width: 2, color: statusColor }, itemStyle: { color: statusColor }, data: buckets.value.map((b) => b.status) },
			{ name: "login", type: "line", smooth: true, showSymbol: false, lineStyle: { width: 2, color: loginColor }, itemStyle: { color: loginColor }, data: buckets.value.map((b) => b.login) },
		],
	};
});

onMounted(() => void load());
</script>

<template>
	<section>
		<div class="head">
			<h1>Trends</h1>
			<select v-model.number="hours" @change="load">
				<option :value="6">6h</option>
				<option :value="24">24h</option>
				<option :value="168">7d</option>
			</select>
		</div>
		<div class="card">
			<VChart v-if="buckets.length" class="chart" :option="option" autoresize />
			<p v-else class="empty">No connection data in this window yet.</p>
		</div>
	</section>
</template>

<style scoped>
.head {
	display: flex;
	align-items: center;
	justify-content: space-between;
}
select {
	font: inherit;
	background: var(--surface);
	color: var(--text-primary);
	border: 1px solid var(--border);
	border-radius: 8px;
	padding: 0.3rem 0.5rem;
}
.chart {
	height: 380px;
}
.empty {
	color: var(--text-secondary);
	padding: 2rem;
	text-align: center;
}
</style>
