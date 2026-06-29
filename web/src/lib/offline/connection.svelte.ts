let online = $state(typeof navigator !== 'undefined' ? navigator.onLine : true);

if (typeof window !== 'undefined') {
	window.addEventListener('online', () => {
		online = true;
	});
	window.addEventListener('offline', () => {
		online = false;
	});
}

export function isOnline() {
	return online;
}