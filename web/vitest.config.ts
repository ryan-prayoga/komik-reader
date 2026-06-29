import { defineConfig } from 'vitest/config';

// Lightweight unit-test config — intentionally does NOT load the SvelteKit
// plugin so pure server-logic modules can be tested without $lib/$env wiring.
export default defineConfig({
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node'
	}
});
