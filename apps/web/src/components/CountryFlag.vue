<script setup lang="ts">
import { computed } from "vue";
import UiTooltip from "./ui/UiTooltip.vue";

const props = defineProps<{ countryCode: string | null; asn?: number | null; asOrg?: string | null }>();

// ISO 3166 alpha-2 → regional-indicator emoji; no image assets needed.
const flag = computed(() => {
	const cc = props.countryCode;
	if (!cc || !/^[A-Za-z]{2}$/.test(cc)) return null;
	return cc.toUpperCase().replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
});

const tip = computed(() => {
	const parts = [props.countryCode?.toUpperCase()];
	if (props.asn) parts.push(`AS${props.asn}`);
	if (props.asOrg) parts.push(props.asOrg);
	return parts.filter(Boolean).join(" · ");
});
</script>

<template>
	<UiTooltip v-if="flag" :content="tip">
		<span class="cursor-default">{{ flag }}</span>
	</UiTooltip>
</template>
