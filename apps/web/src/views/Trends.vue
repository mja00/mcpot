<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { fetchTrends, type TrendBucket } from "../api";
import { useAuthGuard } from "../composables/useAuthGuard";
import PageHeader from "../components/PageHeader.vue";
import Panel from "../components/Panel.vue";
import TrendChart from "../components/TrendChart.vue";
import UiSelect from "../components/ui/UiSelect.vue";

const guard = useAuthGuard();
const buckets = ref<TrendBucket[]>([]);
const hours = ref(24);

const windows = [
	{ label: "6h", value: 6 },
	{ label: "24h", value: 24 },
	{ label: "7d", value: 168 },
];

async function load(): Promise<void> {
	const t = await guard(() => fetchTrends(hours.value));
	if (t) buckets.value = t;
}

watch(hours, () => void load());
onMounted(() => void load());
</script>

<template>
	<section>
		<PageHeader title="Trends" eyebrow="Honeypot network">
			<template #actions>
				<UiSelect v-model="hours" :options="windows" />
			</template>
		</PageHeader>
		<Panel title="Status pings vs login attempts">
			<TrendChart v-if="buckets.length" :buckets="buckets" />
			<p v-else class="px-3 py-10 text-center text-sm text-ink-muted">No connection data in this window yet.</p>
		</Panel>
	</section>
</template>
