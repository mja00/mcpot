<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(defineProps<{ points: number[]; width?: number; height?: number }>(), { width: 120, height: 30 });

// Normalized polyline; color comes from the parent via currentColor.
const path = computed(() => {
	const pts = props.points;
	if (pts.length < 2) return { line: "", area: "" };
	const max = Math.max(...pts, 1);
	const stepX = props.width / (pts.length - 1);
	const coords = pts.map((p, i) => `${(i * stepX).toFixed(1)},${(props.height - (p / max) * (props.height - 2) - 1).toFixed(1)}`);
	return {
		line: `M${coords.join(" L")}`,
		area: `M0,${props.height} L${coords.join(" L")} L${props.width},${props.height} Z`,
	};
});
</script>

<template>
	<svg :width="width" :height="height" :viewBox="`0 0 ${width} ${height}`" aria-hidden="true" class="block">
		<path v-if="path.area" :d="path.area" fill="currentColor" fill-opacity="0.12" />
		<path v-if="path.line" :d="path.line" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
	</svg>
</template>
