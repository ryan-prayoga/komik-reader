// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	/** Injected by vite.config.ts `define` from package.json — the app version shown in Settings. */
	const __APP_VERSION__: string;

	namespace App {
		interface Locals {
			user: {
				id: number;
				email: string;
				username: string;
				is_admin: boolean;
			} | null;
		}
		// interface Error {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};