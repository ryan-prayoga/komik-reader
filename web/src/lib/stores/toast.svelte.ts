export type ToastType = 'success' | 'error' | 'info';
export type Toast = { id: number; message: string; type: ToastType };

let _counter = 0;
export const toasts = $state<Toast[]>([]);

export function showToast(message: string, type: ToastType = 'info') {
	const id = ++_counter;
	toasts.push({ id, message, type });
	setTimeout(() => dismissToast(id), 3500);
}

export function dismissToast(id: number) {
	const idx = toasts.findIndex((t) => t.id === id);
	if (idx !== -1) toasts.splice(idx, 1);
}
