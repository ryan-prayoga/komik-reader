<script lang="ts">
	import { goto } from '$app/navigation';

	// Desktop-only shortcuts: "/" jumps to search, "g" + a letter jumps to a section.
	const GOTO: Record<string, string> = {
		h: '/',
		l: '/library',
		r: '/history',
		d: '/downloads',
		s: '/settings'
	};

	let pendingGoto = $state(false);
	let pendingTimer: ReturnType<typeof setTimeout> | undefined;

	function isEditableTarget(target: EventTarget | null): boolean {
		if (!(target instanceof HTMLElement)) return false;
		return (
			target.tagName === 'INPUT' ||
			target.tagName === 'TEXTAREA' ||
			target.tagName === 'SELECT' ||
			target.isContentEditable
		);
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.metaKey || e.ctrlKey || e.altKey || isEditableTarget(e.target)) return;

		if (pendingGoto) {
			pendingGoto = false;
			clearTimeout(pendingTimer);
			const href = GOTO[e.key];
			if (href) {
				e.preventDefault();
				goto(href);
			}
			return;
		}

		if (e.key === '/') {
			e.preventDefault();
			goto('/search');
		} else if (e.key === 'g') {
			pendingGoto = true;
			pendingTimer = setTimeout(() => (pendingGoto = false), 600);
		}
	}
</script>

<svelte:window {onkeydown} />
