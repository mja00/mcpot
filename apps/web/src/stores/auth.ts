import { defineStore } from "pinia";
import { ref } from "vue";
import { clearToken, getToken, login as apiLogin } from "../api";

export const useAuthStore = defineStore("auth", () => {
	const authed = ref(getToken() !== null);

	async function login(password: string): Promise<void> {
		await apiLogin(password);
		authed.value = true;
	}

	function logout(): void {
		clearToken();
		authed.value = false;
	}

	return { authed, login, logout };
});
