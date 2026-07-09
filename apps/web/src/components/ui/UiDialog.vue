<script setup lang="ts">
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from "reka-ui";

defineProps<{ title: string; description?: string }>();
const open = defineModel<boolean>("open", { required: true });
</script>

<template>
	<DialogRoot v-model:open="open">
		<DialogPortal>
			<DialogOverlay class="fixed inset-0 z-40 bg-black/60" />
			<DialogContent
				class="fixed top-1/2 left-1/2 z-50 w-[min(92vw,520px)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-line bg-raised p-5 shadow-2xl"
			>
				<DialogTitle class="m-0 text-base font-semibold text-ink">{{ title }}</DialogTitle>
				<DialogDescription v-if="description" class="mt-1 mb-0 text-sm text-ink-secondary">{{ description }}</DialogDescription>
				<div class="mt-4">
					<slot />
				</div>
			</DialogContent>
		</DialogPortal>
	</DialogRoot>
</template>
