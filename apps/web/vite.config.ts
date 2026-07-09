import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";

// Dev proxy forwards /v1 to the central server (same-origin, no CORS). The browser now sends its own
// session token from the login flow, so the proxy no longer injects credentials.
export default defineConfig({
	plugins: [vue(), tailwindcss()],
	server: {
		proxy: {
			"/v1": {
				target: process.env.VITE_API_TARGET ?? "http://localhost:8080",
				changeOrigin: true,
			},
		},
	},
});
