export type ToastType = 'success' | 'error' | 'info';

export type ToastAction = {
	label: string;
	onClick: () => void;
};

export type Toast = {
	id: number;
	message: string;
	type: ToastType;
	action?: ToastAction;
};

export type ShowToastOptions = {
	duration?: number;
	action?: ToastAction;
};

let _counter = 0;
export const toasts = $state<Toast[]>([]);

export function showToast(
	message: string,
	type: ToastType = 'info',
	options: ShowToastOptions = {}
) {
	const id = ++_counter;
	const duration = options.duration ?? (options.action ? 5500 : 3500);
	toasts.push({ id, message, type, action: options.action });
	setTimeout(() => dismissToast(id), duration);
	return id;
}

export function dismissToast(id: number) {
	const idx = toasts.findIndex((t) => t.id === id);
	if (idx !== -1) toasts.splice(idx, 1);
}
