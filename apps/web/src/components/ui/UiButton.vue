<script setup lang="ts">
withDefaults(
	defineProps<{
		variant?: "default" | "primary" | "danger" | "ghost";
		size?: "sm" | "md";
		type?: "button" | "submit";
		disabled?: boolean;
	}>(),
	{ variant: "default", size: "md", type: "button", disabled: false },
);

const variantClass = {
	default: "border-line bg-surface text-ink hover:border-ink-muted",
	primary: "border-transparent bg-accent text-page font-semibold hover:bg-accent/85",
	danger: "border-critical/40 bg-transparent text-critical hover:bg-critical/10",
	ghost: "border-transparent bg-transparent text-ink-secondary hover:bg-raised hover:text-ink",
};
const sizeClass = { sm: "px-2.5 py-1 text-xs", md: "px-3.5 py-1.5 text-sm" };
</script>

<template>
	<button
		:type="type"
		:disabled="disabled"
		class="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border font-medium transition-colors disabled:cursor-default disabled:opacity-50"
		:class="[variantClass[variant], sizeClass[size]]"
	>
		<slot />
	</button>
</template>
