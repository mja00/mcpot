<script setup lang="ts">
import { computed } from "vue";
import { use } from "echarts/core";
import { BarChart } from "echarts/charts";
import { AriaComponent, GridComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import VChart from "vue-echarts";
import { chartTheme } from "../lib/theme";

const props = defineProps<{ rows: { label: string; value: number }[] }>();

use([BarChart, AriaComponent, GridComponent, TooltipComponent, CanvasRenderer]);

const option = computed(() => {
	const t = chartTheme();
	const rows = [...props.rows].reverse();
	return {
		aria: { enabled: true },
		textStyle: { fontFamily: t.fontFamily, color: t.ink },
		tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
		grid: { left: 132, right: 18, top: 12, bottom: 24 },
		xAxis: {
			type: "value",
			minInterval: 1,
			splitLine: { lineStyle: { color: t.grid } },
			axisLabel: { color: t.ink },
		},
		yAxis: {
			type: "category",
			data: rows.map((row) => row.label),
			axisLine: { lineStyle: { color: t.grid } },
			axisTick: { show: false },
			axisLabel: { color: t.ink, width: 116, overflow: "truncate" },
		},
		series: [{ type: "bar", data: rows.map((row) => row.value), itemStyle: { color: t.accent, borderRadius: [0, 3, 3, 0] } }],
	};
});
</script>

<template>
	<div class="h-72 w-full"><VChart :option="option" autoresize /></div>
</template>
