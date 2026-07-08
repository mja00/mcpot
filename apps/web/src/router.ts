import { createRouter, createWebHistory } from "vue-router";
import { getToken } from "./api";

const routes = [
	{ path: "/login", name: "login", component: () => import("./views/Login.vue"), meta: { public: true } },
	{ path: "/", name: "overview", component: () => import("./views/Overview.vue") },
	{ path: "/trends", name: "trends", component: () => import("./views/Trends.vue") },
	{ path: "/daemons", name: "daemons", component: () => import("./views/Daemons.vue") },
	{ path: "/offenders", name: "offenders", component: () => import("./views/Offenders.vue") },
];

export const router = createRouter({ history: createWebHistory(), routes });

// Redirect to login when no session token is present (except on public routes).
router.beforeEach((to) => {
	if (!to.meta.public && getToken() === null) return { name: "login" };
	return true;
});
