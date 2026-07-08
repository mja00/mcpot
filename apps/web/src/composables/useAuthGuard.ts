import { useRouter } from "vue-router";
import { UnauthorizedError } from "../api";

/** Wrap API calls so an expired/invalid session bounces to the login screen instead of throwing. */
export function useAuthGuard() {
	const router = useRouter();
	return async function guard<T>(fn: () => Promise<T>): Promise<T | undefined> {
		try {
			return await fn();
		} catch (err) {
			if (err instanceof UnauthorizedError) {
				void router.push({ name: "login" });
				return undefined;
			}
			throw err;
		}
	};
}
