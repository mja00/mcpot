<script setup lang="ts">
import { computed } from "vue";
import { use } from "echarts/core";
import { LineChart } from "echarts/charts";
import { AriaComponent, GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import VChart from "vue-echarts";
import type { TrendsResponse } from "../api";
import { chartTheme } from "../lib/theme";

const props = defineProps<{ data: TrendsResponse["daemonSeries"] }>();

use([LineChart, AriaComponent, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

const option = computed(() => {
	const t = chartTheme();
	const labels = props.data.buckets.map((row) => new Date(row.bucket).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit" }));
	const named = props.data.daemons.map((daemon, index) => ({
		name: daemon.daemonHostname ?? daemon.daemonId.slice(0, 8),
		type: "line",
		stack: "daemons",
		smooth: true,
		showSymbol: false,
		lineStyle: { width: 1.5, color: t.palette[index % t.palette.length] },
		areaStyle: { color: t.palette[index % t.palette.length], opacity: 0.18 },
		data: props.data.buckets.map((row) => row.counts[daemon.daemonId] ?? 0),
	}));
	const hasOther = props.data.buckets.some((row) => row.other > 0);
	const series = hasOther
		? [
				...named,
				{
					name: "Other",
					type: "line",
					stack: "daemons",
					smooth: true,
					showSymbol: false,
					lineStyle: { width: 1.5, color: t.grid },
					areaStyle: { color: t.grid, opacity: 0.2 },
					data: props.data.buckets.map((row) => row.other),
				},
			]
		: named;
	return {
		aria: { enabled: true },
		textStyle: { fontFamily: t.fontFamily, color: t.ink },
		tooltip: { trigger: "axis" },
		legend: { type: "scroll", top: 0, textStyle: { color: t.ink } },
		grid: { left: 44, right: 16, top: 48, bottom: 40 },
		xAxis: { type: "category", data: labels, axisLine: { lineStyle: { color: t.grid } }, axisLabel: { color: t.ink } },
		yAxis: { type: "value", minInterval: 1, splitLine: { lineStyle: { color: t.grid } }, axisLabel: { color: t.ink } },
		series,
	};
});
</script>

<template>
	<div class="h-96 w-full"><VChart :option="option" autoresize /></div>
</template>
