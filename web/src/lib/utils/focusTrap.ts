// Focus management for dialogs/sheets: move focus in on open, keep Tab cycling
// within the panel, and restore focus to the previously-focused element on close.
const FOCUSABLE =
	'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function trapFocus(node: HTMLElement) {
	const previouslyFocused = document.activeElement as HTMLElement | null;

	function focusables(): HTMLElement[] {
		return Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
			(el) => el.offsetParent !== null || el === document.activeElement
		);
	}

	// Move focus into the panel (first focusable, else the panel itself).
	const first = focusables()[0];
	if (first) first.focus();
	else {
		node.setAttribute('tabindex', '-1');
		node.focus();
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key !== 'Tab') return;
		const items = focusables();
		if (items.length === 0) {
			e.preventDefault();
			return;
		}
		const firstEl = items[0];
		const lastEl = items[items.length - 1];
		const active = document.activeElement;
		if (e.shiftKey && (active === firstEl || !node.contains(active))) {
			e.preventDefault();
			lastEl.focus();
		} else if (!e.shiftKey && active === lastEl) {
			e.preventDefault();
			firstEl.focus();
		}
	}

	node.addEventListener('keydown', onKeydown);

	return {
		destroy() {
			node.removeEventListener('keydown', onKeydown);
			previouslyFocused?.focus?.();
		}
	};
}
