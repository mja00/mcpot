<script setup lang="ts">
withDefaults(defineProps<{ state: "good" | "off" | "critical"; pulse?: boolean }>(), { pulse: false });

const stateClass = {
	good: "bg-good",
	off: "bg-ink-muted",
	critical: "bg-critical",
};
</script>

<template>
	<span class="relative inline-flex size-2">
		<span
			v-if="pulse"
			class="absolute inline-flex size-full rounded-full opacity-60 motion-safe:animate-ping"
			:class="stateClass[state]"
		></span>
		<span class="relative inline-flex size-2 rounded-full" :class="stateClass[state]"></span>
	</span>
</template>
