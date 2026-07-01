/** Svelte's transition directives don't read prefers-reduced-motion on their own — gate durations through this. */
export function motionDuration(ms: number): number {
	if (typeof window === 'undefined') return ms;
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : ms;
}

/** Page-transition signature: a quiet fade + scale, like a panel settling into place. */
export function panelSnap(_node: Element, { duration = 160 }: { duration?: number } = {}) {
	return {
		duration: motionDuration(duration),
		css: (t: number) => `opacity: ${t}; transform: scale(${0.985 + 0.015 * t})`
	};
}
