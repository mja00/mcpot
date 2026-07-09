<script setup lang="ts" generic="T extends string | number">
import { SelectContent, SelectItem, SelectItemIndicator, SelectItemText, SelectPortal, SelectRoot, SelectTrigger, SelectValue, SelectViewport } from "reka-ui";

defineProps<{ options: { label: string; value: T }[] }>();
const model = defineModel<T>({ required: true });
</script>

<template>
	<SelectRoot v-model="model">
		<SelectTrigger
			class="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink transition-colors hover:border-ink-muted"
		>
			<SelectValue />
			<span aria-hidden="true" class="text-ink-muted">▾</span>
		</SelectTrigger>
		<SelectPortal>
			<SelectContent position="popper" :side-offset="4" class="z-50 min-w-32 overflow-hidden rounded-lg border border-line bg-raised shadow-xl">
				<SelectViewport class="p-1">
					<SelectItem
						v-for="opt in options"
						:key="String(opt.value)"
						:value="opt.value"
						class="flex cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-sm text-ink-secondary outline-none data-highlighted:bg-surface data-highlighted:text-ink"
					>
						<SelectItemText>{{ opt.label }}</SelectItemText>
						<SelectItemIndicator class="text-accent">•</SelectItemIndicator>
					</SelectItem>
				</SelectViewport>
			</SelectContent>
		</SelectPortal>
	</SelectRoot>
</template>
