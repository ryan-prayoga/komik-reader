<script lang="ts">
	import { onMount } from 'svelte';
	import type { Chapter } from '$lib/graphql/types';
	import { preferences } from '$lib/preferences.svelte';
	import { readerSettings } from '$lib/reader-settings.svelte';
	import { activePageFromPrefixHeights } from '$lib/reader/active-page';
		import {
			WEBTOON_PAGE_GAP_PX,
			buildAnchoredPrefixWithGaps,
			chapterProgressFromRects,
			pageProgressFromRects,
			readingOrderGaps,
			shouldEmitWebtoonProgress
		} from '$lib/reader/webtoon-progress';
		import Spinner from '$lib/components/ui/Spinner.svelte';

	type Section = { chapter: Chapter; pages: string[] };

	interface Props {
		sections: Section[];
		onpage: (
			chapterId: number,
			pageIdx: number,
			pageProgress: number,
			chapterProgress: number
		) => void;
		onnearend?: () => void;
		onzoom?: (zoom: number) => void;
		zoom?: number;
		gap?: boolean;
		initialPage?: number;
		// Scroll fraction (0–1) within initialPage — webtoon pages are several
		// screens tall, so page index alone lands screens away from the real spot.
		initialProgress?: number;
		// Bumped by the parent on every hard chapter navigation (URL change), as
		// opposed to infinite-scroll appends which leave this untouched. Lets us
		// tell "user jumped chapters" apart from "next chapter streamed in".
		resetToken?: number | string;
		// Re-fetch a chapter's page URLs from the server. Suwayomi page URLs can go
		// stale, so retrying the same URL forever never recovers — after repeated
		// failures the retry button escalates to this instead.
		onrefreshpages?: (chapterId: number) => Promise<void>;
	}

	let {
		sections,
		onpage,
		onnearend,
		onzoom,
		zoom = 1,
		gap = true,
		initialPage = 0,
		initialProgress = 0,
		resetToken,
		onrefreshpages
	}: Props = $props();

	// Pinch-to-zoom (same model as PagedView — parent owns persisted zoom).
	let pinchStartDist = 0;
	let pinchStartZoom = 1;

	function pinchDist(e: TouchEvent): number {
		const [a, b] = [e.touches[0], e.touches[1]];
		return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
	}

	function onTouchStart(e: TouchEvent) {
		if (e.touches.length === 2) {
			pinchStartDist = pinchDist(e);
			pinchStartZoom = zoom;
		}
	}
	function onTouchMove(e: TouchEvent) {
		if (e.touches.length === 2 && pinchStartDist > 0 && onzoom) {
			e.preventDefault();
			const ratio = pinchDist(e) / pinchStartDist;
			const z = Math.min(2, Math.max(0.5, +(pinchStartZoom * ratio).toFixed(2)));
			onzoom(z);
		}
	}
	function onTouchEnd() {
		pinchStartDist = 0;
	}

	// Keyed by chapter id (not array index) so entries stay valid when `sections`
	// is pruned from the front — an index-based key would silently go stale and
	// point at the wrong chapter once earlier sections are dropped.
	const pageEls = new Map<string, HTMLElement>();
	let activeChapterId = 0;
	let activePi = 0;
	// Fraction (0–1) into the active page, kept in sync with reportCurrentProgress
	// — the anchor correction below needs this to compensate the CURRENTLY
	// VIEWED page's own resize without re-deriving it from getBoundingClientRect
	// (which is unreliable mid-batch, see the anchor's comment).
	let activeProgress = 0;

	let loadedPages = $state<Record<string, boolean>>({});
	let errorPages = $state<Record<string, boolean>>({});
	let retryCounts = $state<Record<string, number>>({});
	// Pages the preload observer has pulled into range — flipped to eager fetch a
	// few screens before they scroll into view so the reader never shows a black
	// placeholder void mid-scroll (native lazy loads too late on slow mobile links).
	let eagerPages = $state<Record<string, boolean>>({});
	// Height-locked unload window around activePi (±KEEP_IMAGE_RADIUS). Nodes stay
	// mounted; only img src is cleared after locking container min-height so the
	// scroller does not collapse and ResizeObserver anchor stays valid.
	const KEEP_IMAGE_RADIUS = 8;
	let unloadEnabled = $state(false);
	let liveImages = $state<Record<string, boolean>>({});
	let heightLocks = $state<Record<string, number>>({});

	// Per-chapter real page ratio (height/width), learned from images as they
	// load. Webtoon sources slice a chapter into uniform pieces, so the median
	// of the loaded pages predicts the unloaded ones far better than the fixed
	// 2:3 guess — a smaller placeholder error means smaller layout shifts (and
	// smaller anchoring corrections) when late images stream in.
	const chapterRatioSamples = new Map<number, number[]>();
	let chapterRatioGuess = $state<Record<number, number>>({});
	function noteRatio(chapterId: number, img: HTMLImageElement) {
		if (!img.naturalWidth || !img.naturalHeight) return;
		const samples = chapterRatioSamples.get(chapterId) ?? [];
		samples.push(img.naturalHeight / img.naturalWidth);
		chapterRatioSamples.set(chapterId, samples);
		const sorted = [...samples].sort((a, b) => a - b);
		chapterRatioGuess[chapterId] = sorted[Math.floor(sorted.length / 2)];
	}

	function markLoaded(key: string, chapterId: number, img: HTMLImageElement) {
		noteRatio(chapterId, img);
		loadedPages[key] = true;
		errorPages[key] = false;
		// Drop height lock only after the re-loaded image has real layout again.
		if (heightLocks[key] != null) {
			const next = { ...heightLocks };
			delete next[key];
			heightLocks = next;
		}
	}
	function markError(key: string) {
		// Intentional unload clears src — do not treat that as a load failure.
		if (unloadEnabled && !liveImages[key]) return;
		errorPages[key] = true;
	}
	// Chapters whose page URLs are being re-fetched — guards double taps while the
	// refresh request is in flight.
	const refreshingChapters = new Set<number>();
	function clearChapterLoadState(chapterId: number) {
		for (const rec of [loadedPages, errorPages, retryCounts, eagerPages, liveImages, heightLocks]) {
			for (const k of Object.keys(rec)) {
				if (k.startsWith(`${chapterId}-`)) delete rec[k];
			}
		}
		// Trigger Svelte reactivity after in-place deletes on $state objects.
		loadedPages = { ...loadedPages };
		errorPages = { ...errorPages };
		retryCounts = { ...retryCounts };
		eagerPages = { ...eagerPages };
		liveImages = { ...liveImages };
		heightLocks = { ...heightLocks };
	}
	async function retryPage(key: string, chapterId: number) {
		const attempts = (retryCounts[key] ?? 0) + 1;
		errorPages[key] = false;
		loadedPages[key] = false;
		retryCounts[key] = attempts;
		// Same-URL retries only help for transient hiccups; after two failures the
		// URL itself is likely stale — ask the parent for fresh ones instead.
		if (attempts >= 2 && onrefreshpages && !refreshingChapters.has(chapterId)) {
			refreshingChapters.add(chapterId);
			try {
				await onrefreshpages(chapterId);
				clearChapterLoadState(chapterId);
			} catch {
				markError(key);
			} finally {
				refreshingChapters.delete(chapterId);
			}
		}
	}

	// Hard chapter nav (URL change) must drop the old chapter's tracking state
	// (activeChapterId/activePi), or a stale scroll tick reports the chapter
	// just left and snaps the parent's currentChapterId/header/URL back to it —
	// the flicker/crash-out-of-reader bug. But this reset must ONLY run on an
	// actual token change: on first mount this $effect fires AFTER the
	// use:observePage actions have already registered every page, so an
	// unconditional pageEls.clear() here wiped the map right after it was
	// built — progress/resume were dead for the whole first chapter (entries
	// only ever re-register when NEW pages mount). pageEls is intentionally
	// left alone even on a real change: observePage's destroy() already
	// removes exactly the entries whose pages unmount, and clearing here
	// races the new chapter's actions registering into the same map.
	// svelte-ignore state_referenced_locally -- capturing the initial value is the point
	let appliedResetToken = resetToken;
	$effect(() => {
		if (resetToken === appliedResetToken) return;
			appliedResetToken = resetToken;
			activeChapterId = 0;
			activePi = 0;
			activeProgress = 0;
			loadedPages = {};
			errorPages = {};
			retryCounts = {};
			eagerPages = {};
			unloadEnabled = false;
			liveImages = {};
			heightLocks = {};
			chapterRatioSamples.clear();
			chapterRatioGuess = {};
			// A correction computed against the old chapter's layout must not land
			// on the freshly-reset scroll position.
			pendingAnchorDelta = 0;
		});
	function pageSrc(url: string, key: string): string {
		const n = retryCounts[key];
		if (!n) return url;
		return `${url}${url.includes('?') ? '&' : '?'}_retry=${n}`;
	}

	// ── Manual scroll anchoring ─────────────────────────────────────────────
	// iOS Safari has no native scroll anchoring at all (overflow-anchor is
	// Chrome/Firefox only), so when a page swaps its guessed placeholder height
	// for the real image height, everything below shifts and the reading
	// position jumps — the "suddenly mid-chapter after crossing into the next
	// chapter" reports, and (more subtly) the "resume lands close but not
	// exact" imprecision. Replicate anchoring by hand: a ResizeObserver
	// callback runs after layout but BEFORE paint, so shifting scrollTop by the
	// height delta inside it lands in the same frame as the resize and is
	// never visible. Native anchoring is disabled on the scroll container
	// (overflow-anchor: none, app.css) so Chrome doesn't stack its own
	// correction on top of this one.
	//
	// Classification of each resized page uses READING-ORDER INDEX (chapter +
	// page position) against the current anchor (activeChapterId/activePi),
	// NOT live getBoundingClientRect() reads. Pages that are eager-loaded
	// together (the first ~10 of a chapter) resize in the SAME ResizeObserver
	// batch, and the browser has already applied ALL their layout changes
	// before the callback runs — so by the time entry #5 is processed, reading
	// its rect reflects entries #1-4's growth too, double-counting/misclassifying
	// which pages are "above" vs "at" the viewport. Index order is stable
	// regardless of batching or which order entries happen to arrive in.
	const pageHeights = new Map<string, number>();
	let pendingAnchorDelta = 0;
	let anchorRafId = 0;
	let anchorRetries = 0;

	function scrollerEl(): HTMLElement | null {
		return (rootEl?.closest('[data-reader-scroll]') as HTMLElement | null) ?? null;
	}

	// Reading-order sort key: section index (chapter position in `sections`)
	// times a stride bigger than any realistic page count, plus page index.
		function pageOrderKey(chapterId: number, pi: number): number | null {
			const si = sections.findIndex((s) => s.chapter.id === chapterId);
			// Pruned / unmounted chapter — never treat as "above anchor" or scroll jumps.
			if (si < 0) return null;
			return si * 100000 + pi;
		}

	// iOS also ignores programmatic scrollTop writes while a momentum fling is
	// in flight — keep reapplying the outstanding delta each frame until the
	// scroller actually takes it, unless it would push past a scroll bound.
	function applyAnchorDelta() {
		cancelAnimationFrame(anchorRafId);
		const scroller = scrollerEl();
		if (!scroller || !pendingAnchorDelta) return;
		const before = scroller.scrollTop;
		scroller.scrollTop = before + pendingAnchorDelta;
		const applied = scroller.scrollTop - before;
		pendingAnchorDelta -= applied;
		if (Math.abs(pendingAnchorDelta) < 0.5) {
			pendingAnchorDelta = 0;
			return;
		}
		const max = scroller.scrollHeight - scroller.clientHeight;
		const atBound =
			(pendingAnchorDelta > 0 && before >= max - 1) || (pendingAnchorDelta < 0 && before <= 1);
		if (atBound || ++anchorRetries > 180) {
			pendingAnchorDelta = 0;
			return;
		}
		anchorRafId = requestAnimationFrame(applyAnchorDelta);
	}

	const resizeAnchor =
		typeof ResizeObserver !== 'undefined'
			? new ResizeObserver((entries) => {
					// No anchor established yet (before the first placement/intersection) —
					// just record the new heights, nothing to correct against.
					if (!activeChapterId) {
						for (const entry of entries) {
							const key = (entry.target as HTMLElement).dataset.pageKey;
							if (key)
								pageHeights.set(key, entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height);
						}
						return;
					}
						const anchorOrder = pageOrderKey(activeChapterId, activePi);
						if (anchorOrder == null) {
							for (const entry of entries) {
								const key = (entry.target as HTMLElement).dataset.pageKey;
								if (key)
									pageHeights.set(
										key,
										entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height
									);
							}
							return;
						}
						let delta = 0;
						for (const entry of entries) {
							const key = (entry.target as HTMLElement).dataset.pageKey;
							if (!key) continue;
							const [chStr, piStr] = key.split('-');
							const newH = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
							const oldH = pageHeights.get(key);
							pageHeights.set(key, newH);
							if (oldH === undefined || Math.abs(newH - oldH) < 0.5) continue;
							const order = pageOrderKey(Number(chStr), Number(piStr));
							if (order == null) continue;
							if (order < anchorOrder) {
								// Fully above the anchor in reading order: shift by the whole delta.
								delta += newH - oldH;
							} else if (order === anchorOrder) {
								// The page currently being read: keep the same FRACTION into it,
								// using the fraction we already track (not a live rect re-derive,
								// which is exactly what made this imprecise before).
								delta += activeProgress * (newH - oldH);
							}
							// order > anchorOrder: below the fold, doesn't affect scroll position.
						}
					if (delta) {
						pendingAnchorDelta += delta;
						anchorRetries = 0;
						applyAnchorDelta();
					}
				})
			: null;

	// Derive the active page from live geometry instead of trusting the last
	// IntersectionObserver callback. Fast (momentum) scrolling coalesces IO
	// events — pages that enter AND leave the activation band between two
	// observation frames never fire at all, including a chapter's LAST page.
	// Progress then sticks at a stale mid-chapter position and isRead never
	// latches, which is how finished chapters kept reopening at their "end".
	// Hot path: O(log n) binary search over pageHeights prefix (content Y),
	// not O(n) getBoundingClientRect over every section. Fallback: rect scan
	// only around activePi±5 when the height map is incomplete. Activation
	// line = 40% of the scroller viewport (same as IO rootMargin -60%).
	// Extra rule: once the chapter's last page is fully in view (≤3 rects),
	// that last page wins even if a short page never reaches the 40% line.
	const ACTIVATION_FRAC = 0.4;

	type PageRef = { chapterId: number; pi: number; key: string };

	function readingOrderEntries(): PageRef[] {
		const out: PageRef[] = [];
		for (const section of sections) {
			const cid = section.chapter.id;
			for (let pi = 0; pi < section.pages.length; pi++) {
				out.push({ chapterId: cid, pi, key: `${cid}-${pi}` });
			}
		}
		return out;
	}

	function scrollerMetrics(): {
		scrollTop: number;
		clientHeight: number;
		scrollerTop: number;
		viewBottom: number;
	} {
		const scroller = scrollerEl();
		if (scroller) {
			const r = scroller.getBoundingClientRect();
			return {
				scrollTop: scroller.scrollTop,
				clientHeight: scroller.clientHeight,
				scrollerTop: r.top,
				viewBottom: r.top + scroller.clientHeight
			};
		}
		const scrollTop = window.scrollY || document.documentElement.scrollTop;
		const clientHeight = window.innerHeight;
		return { scrollTop, clientHeight, scrollerTop: 0, viewBottom: clientHeight };
	}

	/** Content-space Y of an element's top edge relative to the scroller. */
	function contentTopOf(el: HTMLElement, scrollTop: number, scrollerTop: number): number {
		return el.getBoundingClientRect().top - scrollerTop + scrollTop;
	}

	function applyLastPageRule(best: PageRef, viewBottom: number): PageRef {
		const section = sections.find((s) => s.chapter.id === best.chapterId);
		if (!section) return best;
		const lastIdx = section.pages.length - 1;
		if (lastIdx <= best.pi) return best;
		const lastEl = pageEls.get(`${best.chapterId}-${lastIdx}`);
		if (lastEl && lastEl.getBoundingClientRect().bottom <= viewBottom + 1) {
			return { chapterId: best.chapterId, pi: lastIdx, key: `${best.chapterId}-${lastIdx}` };
		}
		return best;
	}

	/** Prefer pure lastBottom for the active chapter; ≤1 rect if height missing. */
	function applyLastPageRuleFromHeights(
		best: PageRef,
		entries: PageRef[],
		heights: number[],
		prefix: number[],
		scrollTop: number,
		clientHeight: number,
		viewBottom: number
	): PageRef {
		const section = sections.find((s) => s.chapter.id === best.chapterId);
		if (!section) return best;
		const lastIdx = section.pages.length - 1;
		if (lastIdx <= best.pi) return best;
		const lastFlat = entries.findIndex(
			(e) => e.chapterId === best.chapterId && e.pi === lastIdx
		);
		if (lastFlat >= 0) {
			const top = prefix[lastFlat];
			const h = heights[lastFlat];
			if (top != null && h != null && h > 0) {
				if (top + h <= scrollTop + clientHeight + 1) {
					return {
						chapterId: best.chapterId,
						pi: lastIdx,
						key: `${best.chapterId}-${lastIdx}`
					};
				}
				return best;
			}
		}
		return applyLastPageRule(best, viewBottom);
	}

	/** Bounded fallback: rect-scan only active flat index ±5 (not full sections). */
	function geometricActivePageWindowFallback(
		entries: PageRef[],
		clientHeight: number,
		scrollerTop: number,
		viewBottom: number
	): PageRef | null {
		const line = scrollerTop + clientHeight * ACTIVATION_FRAC;
		let center = entries.findIndex(
			(e) => e.chapterId === activeChapterId && e.pi === activePi
		);
		if (center < 0) center = 0;
		const from = Math.max(0, center - 5);
		const to = Math.min(entries.length - 1, center + 5);
		let best: { ref: PageRef; top: number } | null = null;
		for (let i = from; i <= to; i++) {
			const ref = entries[i];
			if (!ref) continue;
			const el = pageEls.get(ref.key);
			if (!el) continue;
			const top = el.getBoundingClientRect().top;
			if (top <= line && (!best || top > best.top)) {
				best = { ref, top };
			}
		}
		if (!best) return null;
		return applyLastPageRule(best.ref, viewBottom);
	}

	function geometricActivePage(): { chapterId: number; pi: number } | null {
		const entries = readingOrderEntries();
		if (entries.length === 0) return null;

		const { scrollTop, clientHeight, scrollerTop, viewBottom } = scrollerMetrics();

		const heights: number[] = [];
		let complete = true;
		for (const e of entries) {
			const h = pageHeights.get(e.key);
			if (h == null || !(h > 0)) {
				complete = false;
				break;
			}
			heights.push(h);
		}

		if (complete && heights.length === entries.length) {
			// 1 rect on a near-viewport page as anchor → prefix O(n) + search O(log n).
			// Re-anchoring keeps CSS gaps/dividers from drifting from document start.
			let anchorI = entries.findIndex(
				(e) => e.chapterId === activeChapterId && e.pi === activePi
			);
			if (anchorI < 0 || !pageEls.get(entries[anchorI]!.key)) {
				anchorI = entries.findIndex((e) => pageEls.get(e.key));
			}
			const anchorEl =
				anchorI >= 0 ? pageEls.get(entries[anchorI]!.key) : undefined;
			if (!anchorEl || anchorI < 0) {
				const fb = geometricActivePageWindowFallback(
					entries,
					clientHeight,
					scrollerTop,
					viewBottom
				);
				return fb ? { chapterId: fb.chapterId, pi: fb.pi } : null;
			}
				const anchorTop = contentTopOf(anchorEl, scrollTop, scrollerTop);
				const gapAfter = readingOrderGaps(entries, gap ? WEBTOON_PAGE_GAP_PX : 0);
				const prefix = buildAnchoredPrefixWithGaps(heights, anchorI, anchorTop, gapAfter);
				// Do not pass lastBottom into the pure search: multi-section prefixes would
				// force global n-1. Chapter-scoped last-page rule is applied after.
				const flat = activePageFromPrefixHeights(
					prefix,
					scrollTop,
					clientHeight,
					ACTIVATION_FRAC
				);
			if (flat == null) {
				const first = entries[0];
				if (first) {
					const forced = applyLastPageRuleFromHeights(
						first,
						entries,
						heights,
						prefix,
						scrollTop,
						clientHeight,
						viewBottom
					);
					if (forced.pi !== first.pi || forced.chapterId !== first.chapterId) {
						return { chapterId: forced.chapterId, pi: forced.pi };
					}
				}
				return null;
			}
			const ref = entries[flat];
			if (!ref) return null;
			const final = applyLastPageRuleFromHeights(
				ref,
				entries,
				heights,
				prefix,
				scrollTop,
				clientHeight,
				viewBottom
			);
			return { chapterId: final.chapterId, pi: final.pi };
		}

		const fb = geometricActivePageWindowFallback(
			entries,
			clientHeight,
			scrollerTop,
			viewBottom
		);
		return fb ? { chapterId: fb.chapterId, pi: fb.pi } : null;
	}

	/**
	 * Keep decoded bitmaps only within ±KEEP_IMAGE_RADIUS of activePi in the
	 * active chapter. Far pages: lock container height from pageHeights /
	 * offsetHeight, then clear img src (node stays mounted). Near pages: put
	 * src back. Called after every active-page update on the scroll path.
	 */
	function syncImageWindow() {
		if (!activeChapterId) return;
		unloadEnabled = true;
		const nextLive: Record<string, boolean> = {};
		const nextLocks = { ...heightLocks };
		let loadedDirty = false;
		const nextLoaded = { ...loadedPages };
		for (const section of sections) {
			const cid = section.chapter.id;
			for (let pi = 0; pi < section.pages.length; pi++) {
				const key = `${cid}-${pi}`;
				const keep =
					cid === activeChapterId && Math.abs(pi - activePi) <= KEEP_IMAGE_RADIUS;
				if (keep) {
					nextLive[key] = true;
					// min-height stays until markLoaded after re-decode.
				} else {
					// Height lock BEFORE src clear (same render): prefer measured map,
					// fall back to live offsetHeight so layout never collapses to 0.
					if (nextLocks[key] == null) {
						const measured =
							pageHeights.get(key) ?? pageEls.get(key)?.offsetHeight ?? 0;
						if (measured > 0) nextLocks[key] = measured;
					}
					if (nextLoaded[key]) {
						delete nextLoaded[key];
						loadedDirty = true;
					}
				}
			}
		}
		if (loadedDirty) loadedPages = nextLoaded;
		// Assign locks before live so the template can apply min-height in the
		// same update that empties img src.
		heightLocks = nextLocks;
		liveImages = nextLive;
	}

		function reportCurrentProgress() {
			// 0 is the "not tracking anything yet" sentinel (see the resetToken
			// effect) — right after a hard chapter switch, before the new chapter's
			// first page has intersected, a stray scroll tick must not report this
			// up as real progress or it clobbers the parent's just-set chapter id.
			if (!activeChapterId) return;
			const geo = geometricActivePage();
			if (geo) {
				activeChapterId = geo.chapterId;
				activePi = geo.pi;
			}
			syncImageWindow();
			const el = pageEls.get(`${activeChapterId}-${activePi}`);
			// Missing node mid-prune/remount: never emit zeros — that used to wipe
			// lastPageProgress in IndexedDB on visibility flush races.
			if (!shouldEmitWebtoonProgress(activeChapterId, !!el) || !el) return;
			const { top, height } = el.getBoundingClientRect();
			const { scrollerTop } = scrollerMetrics();
			const progress = pageProgressFromRects(top, height, scrollerTop);
			activeProgress = progress;
			onpage(activeChapterId, activePi, progress, chapterScrollProgress(activeChapterId));
		}

		// True scroll-extent progress for the active chapter: 0 at the chapter's first
		// page top, 1 once scrolled all the way to its last page bottom. Uses the
		// reader's scroller height (not window.innerHeight) so dock/safe-area layouts
		// still latch isRead at the real end.
		function chapterScrollProgress(chapterId: number): number {
			const section = sections.find((s) => s.chapter.id === chapterId);
			const lastIdx = (section?.pages.length ?? 1) - 1;
			const firstEl = pageEls.get(`${chapterId}-0`);
			const lastEl = pageEls.get(`${chapterId}-${lastIdx}`);
			if (!firstEl || !lastEl) return 0;
			const firstTop = firstEl.getBoundingClientRect().top;
			const lastBottom = lastEl.getBoundingClientRect().bottom;
			const { scrollerTop, clientHeight } = scrollerMetrics();
			return chapterProgressFromRects(firstTop, lastBottom, scrollerTop, clientHeight);
		}

	function observePage(node: HTMLElement, param: { chapterId: number; pi: number }) {
		const key = `${param.chapterId}-${param.pi}`;
		pageEls.set(key, node);
		pageHeights.set(key, node.offsetHeight);
		resizeAnchor?.observe(node);

		const root = node.closest('[data-reader-scroll]');
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) {
					activeChapterId = param.chapterId;
					activePi = param.pi;
					reportCurrentProgress();
				}
			},
			// root must be the reader's own scroll container when there is one:
			// with the implicit viewport root, content clipped by that container
			// never counts as intersecting and rootMargin stops working.
			{ threshold: 0, rootMargin: '0px 0px -60% 0px', root }
		);
		observer.observe(node);

		// Preload observer: ~½–1 viewport ahead (tighter when data-saver) flips the
		// page to eager fetch before it enters view. One-shot — disconnects once armed.
		// Was 2500/400; tightened to cut decoded-image budget on long webtoon chapters.
		const margin = preferences.dataSaver ? '200px 0px 200px 0px' : '800px 0px 800px 0px';
		const preloader = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) {
					eagerPages[key] = true;
					preloader.disconnect();
				}
			},
			{ threshold: 0, rootMargin: margin, root }
		);
		preloader.observe(node);

		return {
			destroy() {
				observer.disconnect();
				preloader.disconnect();
				resizeAnchor?.unobserve(node);
				pageHeights.delete(key);
				pageEls.delete(key);
			}
		};
	}

	function observeSentinel(node: HTMLElement) {
		// Trigger a full viewport height before the true bottom so slow chapter
		// fetches finish before the user actually scrolls past the last page.
		const margin = Math.max(800, typeof window !== 'undefined' ? window.innerHeight : 0);
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) onnearend?.();
			},
			// Same as observePage: rootMargin below the fold only works if root is
			// the actual scroll container, not the implicit viewport.
			{
				rootMargin: `0px 0px ${margin}px 0px`,
				threshold: 0,
				root: node.closest('[data-reader-scroll]')
			}
		);
		observer.observe(node);
		return { destroy: () => observer.disconnect() };
	}

	let rootEl: HTMLElement;

	onMount(() => {
		// Resume scroll runs ONCE, synchronously, before the first paint — the
		// old version scheduled it on rAF plus 400/1200/3000ms retries to chase
		// images resizing the layout, and every retry was a visible snap ("shows
		// some page first, then jumps to the spot"). The manual ResizeObserver
		// anchoring above now keeps the visual position pinned while images
		// stream in, so one pre-paint placement is both flicker-free and stable.
		if (initialPage > 0) {
			const firstChapterId = sections[0]?.chapter.id;
			const target = pageEls.get(`${firstChapterId}-${initialPage}`);
			const scroller = scrollerEl();
			if (target && scroller && firstChapterId) {
				const clampedProgress = Math.min(1, Math.max(0, initialProgress));
				const top =
					target.getBoundingClientRect().top -
					scroller.getBoundingClientRect().top +
					scroller.scrollTop;
				scroller.scrollTop = top + target.offsetHeight * clampedProgress;
				// Establish the anchor synchronously, in the SAME task as the
				// placement above — any placeholder→real-image resize that fires
				// before the first natural IntersectionObserver callback (very
				// likely, since eager images for the first ~10 pages start
				// resolving immediately) needs a valid anchor to correct against
				// from frame one, or the placement above drifts by exactly the
				// placeholder-vs-real height error before anything can fix it.
				activeChapterId = firstChapterId;
				activePi = initialPage;
				activeProgress = clampedProgress;
			}
		}

		let rafId: number;
		function onScroll() {
			cancelAnimationFrame(rafId);
			rafId = requestAnimationFrame(reportCurrentProgress);
		}

		// Scroll happens on the reader's own container when one wraps us (element
		// scroll events don't bubble to window), otherwise on the document.
		const scroller: HTMLElement | Window = rootEl?.closest('[data-reader-scroll]') ?? window;
		scroller.addEventListener('scroll', onScroll, { passive: true });
		return () => {
			scroller.removeEventListener('scroll', onScroll);
			cancelAnimationFrame(rafId);
			cancelAnimationFrame(anchorRafId);
			resizeAnchor?.disconnect();
		};
	});

	const maxWidth = $derived(`${48 * zoom * (readerSettings.cropBorders ? 1.03 : 1)}rem`);
</script>

<!-- Layout stability when a placeholder swaps to its real image height is
     handled by the manual ResizeObserver anchoring in the script above — NOT
     by native scroll anchoring, which iOS Safari doesn't implement at all
     (the earlier native-anchoring fix only ever worked on Chrome/Firefox;
     iPhones kept jumping mid-chapter). An onload-driven compensation can't
     work either — the resize happens synchronously inside the img's own
     layout resolution, ahead of any 'load' handler — but ResizeObserver
     callbacks run post-layout and PRE-PAINT, so the scrollTop correction
     lands in the same frame as the resize on every engine. Native anchoring
     is explicitly disabled on the scroll container (app.css) so Chrome
     doesn't apply a second correction on top. -->
<div
	bind:this={rootEl}
	class="mx-auto touch-pan-y {gap ? 'space-y-1' : ''}"
	style="max-width: {maxWidth};"
	ontouchstart={onTouchStart}
	ontouchmove={onTouchMove}
	ontouchend={onTouchEnd}
>
	{#each sections as section, si (section.chapter.id)}
		{#if si > 0}
			<div class="flex items-center gap-3 px-4 py-8">
				<div class="h-px flex-1 bg-white/15"></div>
				<span class="rounded-full bg-white/10 px-3 py-1 text-xs text-white/60"
					>{section.chapter.name}</span
				>
				<div class="h-px flex-1 bg-white/15"></div>
			</div>
		{/if}
		{#each section.pages as pageUrl, pi (pi)}
			{@const key = `${section.chapter.id}-${pi}`}
			{@const ratio = chapterRatioGuess[section.chapter.id] ?? 1.5}
			{@const imageLive = !unloadEnabled || !!liveImages[key]}
			{@const lockH = heightLocks[key]}
			<!-- Placeholder ratio lives on the CONTAINER, not just the img: a broken
			     image collapses to near-zero height in most browsers (aspect-ratio
			     only reliably applies while the image has layout), and with
			     overflow-hidden that clipped the retry overlay into an untappable
			     sliver. Unloaded far pages also lock min-height so clearing img src
			     cannot collapse the reading-order height map. -->
			<div
				class="relative overflow-hidden"
				style={lockH
					? `min-height: ${lockH}px`
					: loadedPages[key]
						? ''
						: `aspect-ratio: 1 / ${ratio}`}
				data-page-key={key}
				use:observePage={{ chapterId: section.chapter.id, pi }}
			>
				{#if errorPages[key]}
					<div
						class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-white/[0.03]"
					>
						{#if retryCounts[key]}
							<p class="text-xs text-white/50">Gagal dimuat ({retryCounts[key]}×)</p>
						{/if}
						<button
							type="button"
							class="min-h-11 rounded-full bg-white/10 px-5 py-2.5 text-sm text-white/80 hover:bg-white/20"
							onpointerdown={(e) => e.stopPropagation()}
							onclick={(e) => {
								e.stopPropagation();
								void retryPage(key, section.chapter.id);
							}}
						>
							Muat ulang
						</button>
					</div>
				{:else if imageLive && !loadedPages[key]}
					<div class="absolute inset-0 flex items-center justify-center bg-white/[0.03]">
						<Spinner size={24} class="text-white/40" />
					</div>
				{/if}
				<img
					src={imageLive ? pageSrc(pageUrl, key) : ''}
					alt="Halaman {pi + 1}"
					class="mx-auto block w-full transition-opacity duration-300 {loadedPages[key] &&
					imageLive
						? 'opacity-100'
						: 'opacity-0'} {readerSettings.cropBorders ? 'scale-[1.03]' : ''}"
					style="aspect-ratio: auto 1 / {ratio}"
					loading={eagerPages[key] || (si === 0 && pi <= initialPage + 1) ? 'eager' : 'lazy'}
					decoding="async"
					onload={(e) => markLoaded(key, section.chapter.id, e.currentTarget as HTMLImageElement)}
					onerror={() => markError(key)}
				/>
			</div>
		{/each}
	{/each}
	<div use:observeSentinel class="h-px"></div>
</div>
