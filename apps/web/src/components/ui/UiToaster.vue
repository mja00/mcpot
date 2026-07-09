<script setup lang="ts">
import { ToastDescription, ToastProvider, ToastRoot, ToastTitle, ToastViewport } from "reka-ui";
import { useToast } from "../../composables/useToast";

const { toasts, dismiss } = useToast();

const toneClass = {
	default: "border-line",
	good: "border-good/50",
	critical: "border-critical/50",
};
</script>

<template>
	<ToastProvider :duration="5000">
		<ToastRoot
			v-for="t in toasts"
			:key="t.id"
			class="rounded-lg border bg-raised px-4 py-3 shadow-xl data-[state=closed]:opacity-0 motion-safe:transition-opacity"
			:class="toneClass[t.tone]"
			@update:open="(o: boolean) => !o && dismiss(t.id)"
		>
			<ToastTitle class="text-sm font-medium text-ink">{{ t.title }}</ToastTitle>
			<ToastDescription v-if="t.description" class="mt-0.5 text-xs text-ink-secondary">{{ t.description }}</ToastDescription>
		</ToastRoot>
		<ToastViewport class="fixed right-4 bottom-4 z-50 flex w-80 max-w-[92vw] flex-col gap-2 outline-none" />
	</ToastProvider>
</template>
