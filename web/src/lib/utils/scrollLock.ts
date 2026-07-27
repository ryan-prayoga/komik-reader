/**
 * Freeze the page behind an overlay.
 *
 * Modals, sheets and the command palette all left the document scrollable, so a
 * wheel or swipe over the backdrop scrolled the page underneath — and on iOS the
 * bottom sheet's drag rubber-banded the whole background.
 *
 * `overflow: hidden` alone is not enough on iOS Safari, which keeps scrolling
 * the body regardless, so the body is pinned with `position: fixed` and the
 * scroll offset is restored on release. Locks are reference-counted: overlays
 * stack (a modal opened from a sheet), and the last one out has to be the one
 * that restores.
 */

let depth = 0;
let saved: {
	overflow: string;
	position: string;
	top: string;
	width: string;
	paddingRight: string;
	scrollY: number;
} | null = null;

function lock() {
	if (typeof document === 'undefined') return;
	depth += 1;
	if (depth > 1) return;

	const body = document.body;
	const scrollY = window.scrollY;
	// Removing the scrollbar shifts content sideways; pad by exactly its width.
	const barWidth = window.innerWidth - document.documentElement.clientWidth;

	saved = {
		overflow: body.style.overflow,
		position: body.style.position,
		top: body.style.top,
		width: body.style.width,
		paddingRight: body.style.paddingRight,
		scrollY
	};

	body.style.overflow = 'hidden';
	body.style.position = 'fixed';
	body.style.top = `-${scrollY}px`;
	body.style.width = '100%';
	if (barWidth > 0) body.style.paddingRight = `${barWidth}px`;
}

function unlock() {
	if (typeof document === 'undefined' || depth === 0) return;
	depth -= 1;
	if (depth > 0 || !saved) return;

	const body = document.body;
	const { overflow, position, top, width, paddingRight, scrollY } = saved;
	saved = null;

	body.style.overflow = overflow;
	body.style.position = position;
	body.style.top = top;
	body.style.width = width;
	body.style.paddingRight = paddingRight;
	// Pinning the body reset the scroll position; put it back without smoothing.
	window.scrollTo({ top: scrollY, behavior: 'instant' as ScrollBehavior });
}

/**
 * Svelte action: locks while the node is mounted. Put it on the overlay element
 * itself so the lock's lifetime is exactly the overlay's.
 */
export function scrollLock(_node: HTMLElement) {
	lock();
	return {
		destroy() {
			unlock();
		}
	};
}
