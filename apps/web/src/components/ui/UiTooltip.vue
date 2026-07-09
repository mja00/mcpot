<script setup lang="ts">
import { TooltipContent, TooltipPortal, TooltipRoot, TooltipTrigger } from "reka-ui";

withDefaults(defineProps<{ content: string; side?: "top" | "bottom" | "left" | "right" }>(), { side: "top" });
</script>

<template>
	<TooltipRoot :delay-duration="200">
		<TooltipTrigger as-child>
			<slot />
		</TooltipTrigger>
		<TooltipPortal>
			<TooltipContent
				:side="side"
				:side-offset="6"
				class="z-50 max-w-64 rounded-md border border-line bg-raised px-2.5 py-1.5 text-xs text-ink-secondary shadow-lg"
			>
				{{ content }}
			</TooltipContent>
		</TooltipPortal>
	</TooltipRoot>
</template>
