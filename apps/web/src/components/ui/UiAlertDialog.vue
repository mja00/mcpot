<script setup lang="ts">
import { AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogOverlay, AlertDialogPortal, AlertDialogRoot, AlertDialogTitle } from "reka-ui";
import UiButton from "./UiButton.vue";

withDefaults(
	defineProps<{ title: string; description?: string; confirmLabel?: string; danger?: boolean }>(),
	{ confirmLabel: "Confirm", danger: false },
);
const open = defineModel<boolean>("open", { required: true });
const emit = defineEmits<{ confirm: [] }>();
</script>

<template>
	<AlertDialogRoot v-model:open="open">
		<AlertDialogPortal>
			<AlertDialogOverlay class="fixed inset-0 z-40 bg-black/60" />
			<AlertDialogContent
				class="fixed top-1/2 left-1/2 z-50 w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-line bg-raised p-5 shadow-2xl"
			>
				<AlertDialogTitle class="m-0 text-base font-semibold text-ink">{{ title }}</AlertDialogTitle>
				<AlertDialogDescription v-if="description" class="mt-1 mb-0 text-sm text-ink-secondary">{{ description }}</AlertDialogDescription>
				<div class="mt-5 flex justify-end gap-2">
					<AlertDialogCancel as-child>
						<UiButton variant="ghost">Cancel</UiButton>
					</AlertDialogCancel>
					<AlertDialogAction as-child>
						<UiButton :variant="danger ? 'danger' : 'primary'" @click="emit('confirm')">{{ confirmLabel }}</UiButton>
					</AlertDialogAction>
				</div>
			</AlertDialogContent>
		</AlertDialogPortal>
	</AlertDialogRoot>
</template>
