import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
	define: {
		__APP_VERSION__: JSON.stringify(version)
	},
	plugins: [
		tailwindcss(),
		sveltekit(),
		SvelteKitPWA({
			// autoUpdate (not prompt): the SW precaches an SSR shell ('/') and serves
			// it for every navigation. Under 'prompt' a new SW waits for a user click,
			// so after a deploy the OLD shell keeps being served while the server has
			// already swapped chunk hashes — the stale shell references dead chunks
			// that 404, hydration crashes, and the reader sticks on the SSR shimmer
			// with no way to click the update prompt. autoUpdate skipWaiting +
			// clientsClaim keeps the precache in lockstep with the live deploy and
			// self-heals already-stuck clients on their next load.
			registerType: 'autoUpdate',
			manifest: {
				name: 'Komik Reader',
				short_name: 'Komik',
				description: 'Baca komik via Keiyoushi extensions',
				theme_color: '#0b0a09',
				background_color: '#0b0a09',
				// browser (not standalone): standalone mode on iOS produces a domain-bar
				// black band above the reader that we couldn't suppress reliably.
				display: 'browser',
				start_url: '/',
				icons: [
					{
						src: '/icons/icon-192.png',
						sizes: '192x192',
						type: 'image/png'
					},
					{
						src: '/icons/icon-512.png',
						sizes: '512x512',
						type: 'image/png'
					}
				]
			},
			workbox: {
				// This app is fully SSR (adapter-node, nothing prerendered), so there is
				// no precached HTML shell to fall back to. @vite-pwa/sveltekit defaults
				// navigateFallback to '/' when the key is absent, which made the built SW
				// call createHandlerBoundToURL('/') — '/' is not in the precache manifest,
				// so that call THREW at SW startup and silently killed every registerRoute
				// after it (including the komik-pages cache below). Declaring the key as
				// undefined keeps the plugin from injecting the broken fallback.
				navigateFallback: undefined,
				globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],
				runtimeCaching: [
					{
						urlPattern: /\/api\/v1\/manga\/.*\/chapter\/.*\/page\/.*/i,
						handler: 'CacheFirst',
						options: {
							cacheName: 'komik-pages-v1',
							expiration: { maxEntries: 5000, maxAgeSeconds: 60 * 60 * 24 * 30 },
							cacheableResponse: { statuses: [0, 200] }
						}
					}
				]
			},
			devOptions: {
				enabled: true
			}
		})
	],
	server: {
		proxy: {
			'/api': {
				target: 'http://localhost:4567',
				changeOrigin: true,
				bypass(req) {
					// Local SvelteKit server routes — do not proxy to Suwayomi.
					if (req.url?.startsWith('/api/ext/')) return req.url;
					return null;
				}
			}
		}
	}
});