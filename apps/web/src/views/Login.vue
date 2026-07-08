<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";
import UiButton from "../components/ui/UiButton.vue";

const auth = useAuthStore();
const router = useRouter();
const password = ref("");
const error = ref<string | null>(null);
const busy = ref(false);

async function submit(): Promise<void> {
	busy.value = true;
	error.value = null;
	try {
		await auth.login(password.value);
		void router.push({ name: "overview" });
	} catch {
		error.value = "Invalid password";
	} finally {
		busy.value = false;
	}
}
</script>

<template>
	<div class="grid min-h-[80vh] place-items-center">
		<form class="flex w-72 flex-col gap-3 rounded-xl border border-line bg-surface p-6" @submit.prevent="submit">
			<div>
				<p class="m-0 mb-1 font-mono text-[11px] tracking-[0.22em] text-ink-muted uppercase">Honeypot network</p>
				<h1 class="m-0 font-mono text-2xl font-semibold tracking-tight text-ink">
					<span aria-hidden="true" class="text-accent">▚</span> mcpot
				</h1>
			</div>
			<input
				v-model="password"
				type="password"
				placeholder="Password"
				autocomplete="current-password"
				:disabled="busy"
				class="rounded-lg border border-line bg-page px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
			/>
			<UiButton type="submit" variant="primary" :disabled="busy || !password">{{ busy ? "…" : "Log in" }}</UiButton>
			<p v-if="error" class="m-0 text-sm text-critical">{{ error }}</p>
		</form>
	</div>
</template>
