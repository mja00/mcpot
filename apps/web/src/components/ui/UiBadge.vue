<script setup lang="ts">
withDefaults(defineProps<{ tone?: "neutral" | "good" | "warn" | "critical" | "accent" }>(), { tone: "neutral" });

const toneClass = {
	neutral: "border-line text-ink-secondary",
	good: "border-good/40 text-good",
	warn: "border-warn/40 text-warn",
	critical: "border-critical/40 text-critical",
	accent: "border-accent/40 text-accent",
};
</script>

<template>
	<span class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11px] tracking-wide uppercase" :class="toneClass[tone]">
		<slot />
	</span>
</template>
