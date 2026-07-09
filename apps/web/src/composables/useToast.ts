import { ref } from "vue";

export interface ToastItem {
	id: number;
	title: string;
	description?: string;
	tone: "default" | "good" | "critical";
}

// Module-level state so any view can toast and the single UiToaster in App.vue renders it.
const toasts = ref<ToastItem[]>([]);
let nextId = 1;

export function useToast() {
	function toast(title: string, opts: { description?: string; tone?: ToastItem["tone"] } = {}): void {
		toasts.value.push({ id: nextId++, title, description: opts.description, tone: opts.tone ?? "default" });
	}
	function dismiss(id: number): void {
		toasts.value = toasts.value.filter((t) => t.id !== id);
	}
	return { toasts, toast, dismiss };
}
