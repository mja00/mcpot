<script setup lang="ts">
defineProps<{ title: string; eyebrow?: string }>();
</script>

<template>
	<div class="mb-5 flex flex-wrap items-end justify-between gap-3">
		<div>
			<p v-if="eyebrow" class="m-0 mb-1 font-mono text-[11px] tracking-[0.22em] text-ink-muted uppercase">{{ eyebrow }}</p>
			<h1 class="m-0 text-2xl font-bold tracking-tight text-ink">{{ title }}</h1>
		</div>
		<div class="flex items-center gap-2">
			<slot name="actions" />
		</div>
	</div>
</template>
