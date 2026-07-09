<script setup lang="ts">
import { computed } from "vue";
import { use } from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import VChart from "vue-echarts";
import { chartTheme } from "../lib/theme";

const props = defineProps<{ series: { bucket: string; total: number }[] }>();

use([LineChart, GridComponent, TooltipComponent, CanvasRenderer]);

const option = computed(() => {
	const t = chartTheme();
	return {
		textStyle: { fontFamily: t.fontFamily, color: t.ink },
		tooltip: { trigger: "axis" },
		grid: { left: 36, right: 12, top: 12, bottom: 24 },
		xAxis: {
			type: "category",
			data: props.series.map((b) => new Date(b.bucket).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })),
			axisLine: { lineStyle: { color: t.grid } },
			axisLabel: { color: t.ink },
			axisTick: { show: false },
		},
		yAxis: {
			type: "value",
			minInterval: 1,
			splitLine: { lineStyle: { color: t.grid } },
			axisLabel: { color: t.ink },
		},
		series: [
			{
				name: "connections",
				type: "line",
				smooth: true,
				showSymbol: false,
				lineStyle: { width: 2, color: t.accent },
				itemStyle: { color: t.accent },
				areaStyle: { color: t.accent, opacity: 0.1 },
				data: props.series.map((b) => b.total),
			},
		],
	};
});
</script>

<template>
	<!-- Sized wrapper: vue-echarts injects unlayered height:100% CSS that beats layered Tailwind
	     utilities on the element itself. -->
	<div class="h-52 w-full">
		<VChart :option="option" autoresize />
	</div>
</template>
