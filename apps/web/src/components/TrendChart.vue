<script setup lang="ts">
import { computed } from "vue";
import { use } from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import VChart from "vue-echarts";
import type { TrendBucket } from "../api";
import { chartTheme } from "../lib/theme";

const props = defineProps<{ buckets: TrendBucket[] }>();

use([LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

const option = computed(() => {
	const t = chartTheme();
	const labels = props.buckets.map((b) => new Date(b.bucket).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit" }));
	const line = (name: string, color: string, data: number[]) => ({
		name,
		type: "line",
		smooth: true,
		showSymbol: false,
		lineStyle: { width: 2, color },
		itemStyle: { color },
		data,
	});
	return {
		textStyle: { fontFamily: t.fontFamily, color: t.ink },
		tooltip: { trigger: "axis" },
		legend: { data: ["status", "login"], textStyle: { color: t.ink }, top: 0 },
		grid: { left: 44, right: 16, top: 36, bottom: 40 },
		xAxis: {
			type: "category",
			data: labels,
			axisLine: { lineStyle: { color: t.grid } },
			axisLabel: { color: t.ink },
		},
		yAxis: {
			type: "value",
			splitLine: { lineStyle: { color: t.grid } },
			axisLabel: { color: t.ink },
		},
		series: [
			line("status", t.status, props.buckets.map((b) => b.status)),
			line("login", t.login, props.buckets.map((b) => b.login)),
		],
	};
});
</script>

<template>
	<!-- Sized wrapper: vue-echarts injects unlayered height:100% CSS that beats layered Tailwind
	     utilities on the element itself. -->
	<div class="h-96 w-full">
		<VChart :option="option" autoresize />
	</div>
</template>
