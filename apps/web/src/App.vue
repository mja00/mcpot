<script setup lang="ts">
import { RouterLink, RouterView, useRoute, useRouter } from "vue-router";
import { computed } from "vue";
import { useAuthStore } from "./stores/auth";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const showNav = computed(() => auth.authed && route.name !== "login");

function logout(): void {
	auth.logout();
	void router.push({ name: "login" });
}
</script>

<template>
	<div class="shell">
		<header v-if="showNav" class="nav">
			<span class="brand">mcpot</span>
			<nav>
				<RouterLink to="/">Overview</RouterLink>
				<RouterLink to="/trends">Trends</RouterLink>
				<RouterLink to="/daemons">Daemons</RouterLink>
				<RouterLink to="/offenders">Offenders</RouterLink>
			</nav>
			<button class="logout" @click="logout">Log out</button>
		</header>
		<main>
			<RouterView />
		</main>
	</div>
</template>

<style scoped>
.nav {
	display: flex;
	align-items: center;
	gap: 1.5rem;
	padding: 0.8rem 1.5rem;
	background: var(--surface);
	border-bottom: 1px solid var(--border);
}
.brand {
	font-weight: 700;
	letter-spacing: 0.02em;
}
nav {
	display: flex;
	gap: 1.2rem;
	flex: 1;
}
nav a {
	text-decoration: none;
	color: var(--text-secondary);
	padding-bottom: 2px;
}
nav a.router-link-active {
	color: var(--text-primary);
	border-bottom: 2px solid var(--series-status);
}
main {
	max-width: 1000px;
	margin: 1.5rem auto;
	padding: 0 1.5rem;
}
</style>
