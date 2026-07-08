<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";

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
	<div class="wrap">
		<form class="card box" @submit.prevent="submit">
			<h1>mcpot</h1>
			<p class="sub">Honeypot network dashboard</p>
			<input v-model="password" type="password" placeholder="Password" autocomplete="current-password" :disabled="busy" />
			<button type="submit" :disabled="busy || !password">{{ busy ? "…" : "Log in" }}</button>
			<p v-if="error" class="error">{{ error }}</p>
		</form>
	</div>
</template>

<style scoped>
.wrap {
	min-height: 80vh;
	display: grid;
	place-items: center;
}
.box {
	display: flex;
	flex-direction: column;
	gap: 0.8rem;
	width: 280px;
}
h1 {
	margin: 0;
}
.sub {
	margin: 0 0 0.5rem;
	color: var(--text-secondary);
	font-size: 0.9rem;
}
input {
	font: inherit;
	padding: 0.5rem 0.7rem;
	border-radius: 8px;
	border: 1px solid var(--border);
	background: var(--page);
	color: var(--text-primary);
}
.error {
	color: var(--critical);
	margin: 0;
	font-size: 0.9rem;
}
</style>
