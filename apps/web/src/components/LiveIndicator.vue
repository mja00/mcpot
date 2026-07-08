<script setup lang="ts">
import type { StreamStatus } from "../composables/useEventStream";
import StatusDot from "./StatusDot.vue";
import UiTooltip from "./ui/UiTooltip.vue";

defineProps<{ status: StreamStatus }>();

const labels: Record<StreamStatus, string> = {
	open: "LIVE",
	connecting: "SYNC",
	paused: "PAUSED",
	idle: "OFF",
};
const tips: Record<StreamStatus, string> = {
	open: "Streaming events from the fleet in realtime",
	connecting: "Reconnecting to the event stream…",
	paused: "Stream paused while the tab is hidden",
	idle: "Event stream is not running",
};
</script>

<template>
	<UiTooltip :content="tips[status]">
		<span class="inline-flex cursor-default items-center gap-1.5 font-mono text-[11px] tracking-[0.18em] uppercase" :class="status === 'open' ? 'text-accent' : 'text-ink-muted'">
			<StatusDot :state="status === 'open' ? 'good' : 'off'" :pulse="status === 'open'" />
			{{ labels[status] }}
		</span>
	</UiTooltip>
</template>
