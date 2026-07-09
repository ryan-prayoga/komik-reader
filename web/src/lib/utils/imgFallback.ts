/** Hide broken <img> and optionally swap a sibling placeholder via CSS class. */
export function imgFallback(node: HTMLImageElement) {
	function onError() {
		node.style.display = 'none';
		node.classList.add('img-broken');
		const parent = node.parentElement;
		if (parent && !parent.querySelector('[data-img-fallback]')) {
			const ph = document.createElement('div');
			ph.dataset.imgFallback = '1';
			ph.className =
				'flex h-full w-full items-center justify-center bg-surface-hover text-muted text-xs';
			ph.setAttribute('aria-hidden', 'true');
			ph.textContent = '—';
			parent.appendChild(ph);
		}
	}
	node.addEventListener('error', onError);
	// Already broken (cached error) — check naturalWidth after decode attempt.
	if (node.complete && node.naturalWidth === 0 && node.src) onError();
	return {
		destroy() {
			node.removeEventListener('error', onError);
		}
	};
}
