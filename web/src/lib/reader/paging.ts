/**
 * Pure page-pairing math for the paged reader.
 *
 * Single mode is the identity case. Double mode shows two pages at once, and in
 * offset mode the very first page stands alone so every later spread lines up
 * the way a printed book does.
 *
 * Extracted from PagedView so the index arithmetic — which is where the
 * "chapter never counts as finished" class of bug lives — is testable.
 */

export type PagingMode = {
	double: boolean;
	doubleOffset: boolean;
};

/** Left page index of the pair containing `i`. */
export function pairStart(i: number, { double, doubleOffset }: PagingMode): number {
	if (!double) return i;
	if (doubleOffset) {
		if (i <= 0) return 0;
		return i - ((i - 1) % 2);
	}
	return i - (i % 2);
}

/** Left page index of the pair after the one containing `i`. */
export function nextIndex(i: number, mode: PagingMode): number {
	if (!mode.double) return i + 1;
	const start = pairStart(i, mode);
	if (mode.doubleOffset && start === 0) return 1;
	return start + 2;
}

/**
 * Highest page index currently on screen for the pair containing `i`.
 *
 * This is what read-state must key off. `pairStart` alone tops out at
 * `lastIndex - 1` whenever the final page is the RIGHT half of a spread, so a
 * check like `index >= pages.length - 1` never fires: the chapter stays unread
 * forever and reopens at its last spread instead of at the start.
 */
export function lastVisibleIndex(i: number, mode: PagingMode, lastIndex: number): number {
	const start = pairStart(i, mode);
	if (!mode.double || (mode.doubleOffset && start === 0)) return start;
	return Math.min(start + 1, lastIndex);
}
