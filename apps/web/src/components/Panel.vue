<script setup lang="ts">
defineProps<{ title: string }>();
</script>

<template>
	<section class="rounded-xl border border-line bg-surface">
		<header class="flex items-center justify-between gap-2 border-b border-grid px-4 py-2.5">
			<h2 class="m-0 font-mono text-[11px] font-medium tracking-[0.18em] text-ink-muted uppercase">{{ title }}</h2>
			<slot name="actions" />
		</header>
		<div class="p-1.5">
			<slot />
		</div>
	</section>
</template>
