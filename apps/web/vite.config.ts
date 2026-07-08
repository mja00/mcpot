import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// Dev proxy forwards /v1 to the central server and injects the admin bearer, so the token stays out
// of the browser bundle. A real dashboard session auth replaces this in M5.
export default defineConfig({
	plugins: [vue()],
	server: {
		proxy: {
			"/v1": {
				target: process.env.VITE_API_TARGET ?? "http://localhost:8080",
				changeOrigin: true,
				configure: (proxy) => {
					proxy.on("proxyReq", (proxyReq) => {
						if (process.env.ADMIN_TOKEN) proxyReq.setHeader("authorization", `Bearer ${process.env.ADMIN_TOKEN}`);
					});
				},
			},
		},
	},
});
