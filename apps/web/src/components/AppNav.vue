<script setup lang="ts">
import { RouterLink } from "vue-router";
import UiButton from "./ui/UiButton.vue";

defineEmits<{ logout: [] }>();

const links = [
	{ to: "/", label: "Overview" },
	{ to: "/trends", label: "Trends" },
	{ to: "/daemons", label: "Daemons" },
	{ to: "/offenders", label: "Offenders" },
];
</script>

<template>
	<header class="sticky top-0 z-30 border-b border-line bg-page/90 backdrop-blur">
		<div class="mx-auto flex h-14 max-w-[1400px] items-center gap-6 px-6">
			<span class="font-mono text-base font-semibold tracking-tight text-ink">
				<span aria-hidden="true" class="text-accent">▚</span> mcpot
			</span>
			<nav class="flex flex-1 items-center gap-1">
				<RouterLink
					v-for="l in links"
					:key="l.to"
					:to="l.to"
					class="rounded-md px-3 py-1.5 text-sm text-ink-secondary no-underline transition-colors hover:bg-raised hover:text-ink [&.router-link-active]:bg-raised [&.router-link-active]:text-ink"
				>
					{{ l.label }}
				</RouterLink>
			</nav>
			<slot name="status" />
			<UiButton variant="ghost" size="sm" @click="$emit('logout')">Log out</UiButton>
		</div>
	</header>
</template>
