<script setup lang="ts">
import { RouterView, useRoute, useRouter } from "vue-router";
import { computed } from "vue";
import { TooltipProvider } from "reka-ui";
import { useAuthStore } from "./stores/auth";
import AppNav from "./components/AppNav.vue";
import UiToaster from "./components/ui/UiToaster.vue";

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
	<TooltipProvider>
		<div class="min-h-screen">
			<AppNav v-if="showNav" @logout="logout" />
			<main class="mx-auto max-w-[1400px] px-6 py-6 max-sm:px-4">
				<RouterView />
			</main>
		</div>
		<UiToaster />
	</TooltipProvider>
</template>
