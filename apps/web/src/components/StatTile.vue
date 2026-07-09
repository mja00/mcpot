<script setup lang="ts">
import UiTooltip from "./ui/UiTooltip.vue";

defineProps<{ label: string; value: string; hint?: string }>();
</script>

<template>
	<div class="flex items-end justify-between gap-3 rounded-xl border border-line bg-surface p-4">
		<div class="min-w-0">
			<component :is="hint ? UiTooltip : 'div'" v-bind="hint ? { content: hint } : {}">
				<p class="m-0 mb-1 font-mono text-[11px] tracking-[0.18em] text-ink-muted uppercase">{{ label }}</p>
			</component>
			<p class="m-0 font-mono text-3xl font-semibold tracking-tight text-ink tabular-nums">{{ value }}</p>
		</div>
		<slot />
	</div>
</template>
