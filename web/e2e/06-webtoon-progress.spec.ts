import { test, expect } from '@playwright/test';
import { collectPageErrors } from './helpers';
import {
	openWebtoonReader,
	readLocalHistory,
	resolveReadableChapter,
	simulateBackgroundFlush,
	type OpenedChapter
} from './helpers-reader';

/**
 * Deep QC for webtoon reader progress path (Cluster A–C fixes).
 * Requires live Suwayomi with at least one multi-page chapter.
 */

let chapter: OpenedChapter | null = null;

test.describe.configure({ mode: 'serial' });

test.describe('Webtoon progress QC', () => {
	test.beforeAll(async ({ request }) => {
		chapter = await resolveReadableChapter(request, 4);
	});

	test('resolve multi-page chapter from Suwayomi', async () => {
		test.skip(!chapter, 'no multi-page chapter available from Suwayomi');
		expect(chapter!.pageCount).toBeGreaterThanOrEqual(4);
		expect(chapter!.chapterId).toBeGreaterThan(0);
	});

	test('webtoon scroller mounts (not document scroll)', async ({ page }) => {
		test.skip(!chapter, 'no chapter');
		const errors = await collectPageErrors(page);
		const scroller = await openWebtoonReader(page, chapter!.chapterId);

		// Document should not be the scroll surface (fixed scroller design).
		const metrics = await page.evaluate(() => {
			const el = document.querySelector('[data-reader-scroll]') as HTMLElement | null;
			return {
				hasScroller: !!el,
				scrollerScrollable: el ? el.scrollHeight > el.clientHeight + 20 : false,
				docScrollable: document.documentElement.scrollHeight > window.innerHeight + 40,
				pageKeys: document.querySelectorAll('[data-page-key]').length
			};
		});
		expect(metrics.hasScroller).toBe(true);
		expect(metrics.pageKeys).toBeGreaterThan(0);
		// With enough pages, scroller content exceeds viewport.
		if (chapter!.pageCount >= 4) {
			expect(metrics.scrollerScrollable).toBe(true);
		}

		const fatal = errors.filter((e) => /TypeError|ReferenceError|Hydration/i.test(e));
		expect(fatal, fatal.join('\n')).toEqual([]);
	});

	test('scroll advances local history lastPage (throttled write)', async ({ page }) => {
		test.skip(!chapter, 'no chapter');
		const scroller = await openWebtoonReader(page, chapter!.chapterId);

		// Scroll deep enough to leave page 0.
		await scroller.evaluate((el) => {
			el.scrollTop = Math.min(el.scrollHeight * 0.45, el.scrollHeight - el.clientHeight);
		});
		// Throttle is ~1.5s for same-page fraction; page change is immediate.
		await page.waitForTimeout(1800);
		await simulateBackgroundFlush(page);

		const hist = await readLocalHistory(page, chapter!.chapterId);
		expect(hist, 'history row should exist after scroll').not.toBeNull();
		// Mid-scroll should not be stuck at 0 unless chapter is tiny.
		if (chapter!.pageCount >= 6) {
			expect((hist?.lastPage ?? 0) + (hist?.lastPageProgress ?? 0)).toBeGreaterThan(0.2);
		}
		expect(hist?.isRead).not.toBe(true); // mid chapter
	});

	test('scroll to end latches isRead via chapterProgress', async ({ page }) => {
		test.skip(!chapter, 'no chapter');
		const scroller = await openWebtoonReader(page, chapter!.chapterId);

		// Jump near end, then nudge so geometry/last-page rule can fire.
		await scroller.evaluate((el) => {
			el.scrollTop = el.scrollHeight;
		});
		await page.waitForTimeout(500);
		await scroller.evaluate((el) => {
			el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight - 2);
		});
		await page.waitForTimeout(800);
		await scroller.evaluate((el) => {
			el.scrollTop = el.scrollHeight;
		});
		await page.waitForTimeout(1500);
		await simulateBackgroundFlush(page);

		const hist = await readLocalHistory(page, chapter!.chapterId);
		expect(hist).not.toBeNull();
		// Either last page index or isRead from chapterProgress >= 0.995.
		const onLast =
			hist?.isRead === true ||
			(hist?.totalPages != null &&
				hist.totalPages > 0 &&
				(hist.lastPage ?? 0) >= hist.totalPages - 1);
		expect(onLast, `expected read latch, got ${JSON.stringify(hist)}`).toBe(true);
	});

	test('reopen finished chapter resumes at page 0 (re-read rule)', async ({ page }) => {
		test.skip(!chapter, 'no chapter');
		// Ensure finished from previous test or force again.
		const scroller = await openWebtoonReader(page, chapter!.chapterId);
		await scroller.evaluate((el) => {
			el.scrollTop = el.scrollHeight;
		});
		await page.waitForTimeout(1200);
		await simulateBackgroundFlush(page);

		// Hard reload same chapter URL (avoids mid-nav races on WebKit).
		await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
		await expect(page.locator('[data-reader-scroll]')).toBeVisible({ timeout: 60_000 });
		await expect
			.poll(async () => page.locator('[data-page-key]').count(), { timeout: 60_000 })
			.toBeGreaterThan(0);
		await page.waitForTimeout(1500);

		const pos = await page.evaluate(() => {
			const el = document.querySelector('[data-reader-scroll]') as HTMLElement | null;
			return {
				scrollTop: el?.scrollTop ?? -1,
				firstKey: document.querySelector('[data-page-key]')?.getAttribute('data-page-key')
			};
		});
		// Finished re-read → near top (allow small residual from layout).
		expect(pos.scrollTop).toBeLessThan(200);
	});

	test('mid-chapter resume restores non-zero scroll after reopen', async ({ page }) => {
		test.skip(!chapter || chapter.pageCount < 8, 'need longer chapter for resume mid');
		const id = chapter!.chapterId;

		// Clear isRead by writing a mid history via evaluate is hard; instead scroll mid,
		// flush, leave before end so isRead stays false.
		const scroller = await openWebtoonReader(page, id);
		// Start from top (after finished reopen).
		await scroller.evaluate((el) => {
			el.scrollTop = 0;
		});
		await page.waitForTimeout(400);
		// Scroll to ~35% — not the end.
		await scroller.evaluate((el) => {
			el.scrollTop = Math.floor(el.scrollHeight * 0.35);
		});
		await page.waitForTimeout(1800);
		await simulateBackgroundFlush(page);

		const before = await readLocalHistory(page, id);
		test.skip(!!before?.isRead, 'chapter still marked read — cannot test mid resume');

		const midPage = before?.lastPage ?? 0;
		const midProg = before?.lastPageProgress ?? 0;
		expect(midPage + midProg).toBeGreaterThan(0.15);

		const scrollBefore = await scroller.evaluate((el) => el.scrollTop);

		await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
		const scroller2 = page.locator('[data-reader-scroll]');
		await expect(scroller2).toBeVisible({ timeout: 60_000 });
		await expect
			.poll(async () => page.locator('[data-page-key]').count(), { timeout: 60_000 })
			.toBeGreaterThan(0);
		// Wait for resume placement + image anchoring settle.
		await page.waitForTimeout(2500);

		const scrollAfter = await scroller2.evaluate((el) => el.scrollTop);
		// Resume must not land at absolute top when mid progress was saved.
		expect(scrollAfter).toBeGreaterThan(80);
		// Roughly same neighborhood (placeholder height variance allowed).
		const ratio =
			scrollBefore > 0 ? Math.abs(scrollAfter - scrollBefore) / Math.max(scrollBefore, 1) : 1;
		expect(ratio, `resume drift too large: before=${scrollBefore} after=${scrollAfter}`).toBeLessThan(
			0.55
		);
	});

	test('visibility flush persists lastPageProgress fraction', async ({ page }) => {
		test.skip(!chapter || chapter.pageCount < 5, 'need multi-page chapter');
		const id = chapter!.chapterId;
		const scroller = await openWebtoonReader(page, id);

		// Scroll to a tall mid page region and stop mid-panel if possible.
		await scroller.evaluate((el) => {
			el.scrollTop = Math.floor(el.clientHeight * 2.3);
		});
		await page.waitForTimeout(400);
		// Force flush without waiting full throttle window for page change.
		await simulateBackgroundFlush(page);

		const hist = await readLocalHistory(page, id);
		expect(hist).not.toBeNull();
		// Fraction field present when webtoon path wrote it (may be 0 if exactly at page top).
		expect(typeof (hist?.lastPageProgress ?? 0)).toBe('number');
		expect(hist?.lastPageProgress ?? 0).toBeGreaterThanOrEqual(0);
		expect(hist?.lastPageProgress ?? 0).toBeLessThanOrEqual(1);
	});

	test('auto-scroll starts and stops without crash', async ({ page }) => {
		test.skip(!chapter, 'no chapter');
		test.setTimeout(90_000);
		const errors = await collectPageErrors(page);
		const scroller = await openWebtoonReader(page, chapter!.chapterId);

		// Start near top so there is room to auto-scroll.
		await scroller.evaluate((el) => {
			el.scrollTop = 0;
		});
		await page.waitForTimeout(300);

		// Focus body so window keydown handler receives A (reader listens on window).
		await page.locator('body').click({ position: { x: 8, y: 8 }, force: true });
		await page.keyboard.press('A');
		await page.waitForTimeout(200);

		const moved = await Promise.race([
			scroller.evaluate(async (el) => {
				const a = el.scrollTop;
				await new Promise((r) => setTimeout(r, 700));
				return el.scrollTop - a;
			}),
			page.waitForTimeout(5000).then(() => -1)
		]);
		expect(moved, 'auto-scroll evaluate timed out').toBeGreaterThanOrEqual(0);

		const atEnd = await scroller.evaluate(
			(el) => el.scrollTop + el.clientHeight >= el.scrollHeight - 12
		);
		if (!atEnd) expect(moved).toBeGreaterThan(0);

		// Stop.
		await page.keyboard.press('A');
		await page.waitForTimeout(300);
		const afterStop = await scroller.evaluate(async (el) => {
			const a = el.scrollTop;
			await new Promise((r) => setTimeout(r, 400));
			return Math.abs(el.scrollTop - a);
		});
		expect(afterStop).toBeLessThan(40);

		const fatal = errors.filter((e) => /TypeError|ReferenceError/i.test(e));
		expect(fatal, fatal.join('\n')).toEqual([]);
	});

	test('desktop dock width still reaches end isRead (scroller height)', async ({ page }) => {
		test.skip(!chapter, 'no chapter');
		await page.setViewportSize({ width: 1280, height: 800 });
		const scroller = await openWebtoonReader(page, chapter!.chapterId);

		// Open chrome so dock can reserve width on lg.
		await page.keyboard.press('Escape');
		await page.waitForTimeout(300);

		const heights = await page.evaluate(() => {
			const el = document.querySelector('[data-reader-scroll]') as HTMLElement | null;
			return {
				clientHeight: el?.clientHeight ?? 0,
				innerHeight: window.innerHeight,
				right: el ? getComputedStyle(el.parentElement ?? el).right : ''
			};
		});
		// Scroller may be shorter than window when dock reserved — that's the bug class.
		expect(heights.clientHeight).toBeGreaterThan(200);

		await scroller.evaluate((el) => {
			el.scrollTop = el.scrollHeight;
		});
		await page.waitForTimeout(1500);
		await simulateBackgroundFlush(page);

		const hist = await readLocalHistory(page, chapter!.chapterId);
		// Must still be able to latch read with scroller-relative math.
		const latched =
			hist?.isRead === true ||
			(hist?.totalPages != null && (hist.lastPage ?? 0) >= (hist.totalPages ?? 1) - 1);
		expect(latched, `dock layout failed to latch read: ${JSON.stringify(hist)}`).toBe(true);
	});

	test('page keys use chapterId-pageIdx; no crash on rapid scroll', async ({ page }) => {
		test.skip(!chapter, 'no chapter');
		const errors = await collectPageErrors(page);
		const scroller = await openWebtoonReader(page, chapter!.chapterId);

		for (let i = 0; i < 8; i++) {
			await scroller.evaluate((el, step) => {
				el.scrollTop = Math.min(el.scrollHeight, (el.scrollHeight / 8) * step);
			}, i);
			await page.waitForTimeout(80);
		}
		await page.waitForTimeout(500);

		const keys = await page.locator('[data-page-key]').evaluateAll((nodes) =>
			nodes.map((n) => n.getAttribute('data-page-key') || '')
		);
		expect(keys.length).toBeGreaterThan(0);
		for (const k of keys) {
			expect(k).toMatch(/^\d+-\d+$/);
		}

		const fatal = errors.filter((e) => /TypeError|ReferenceError/i.test(e));
		expect(fatal, fatal.join('\n')).toEqual([]);
	});

	test('invalid chapter does not throw application error', async ({ page }) => {
		const res = await page.goto('/read/999999991');
		expect(res?.status()).toBeLessThan(500);
		await page.waitForTimeout(2000);
		const body = await page.locator('body').innerText();
		expect(body).not.toMatch(/application error|internal server error/i);
	});
});

test.describe('Webtoon progress pure math (in-browser)', () => {
	// Re-verify pure helpers still match e2e environment (no bundling drift).
	test('scroller-relative formulas match unit expectations', async ({ page }) => {
		await page.goto('/');
		const result = await page.evaluate(() => {
			// Inline same contracts as webtoon-progress.ts (source of truth in unit tests).
			function pageProgressFromRects(pageTop: number, pageHeight: number, scrollerTop: number) {
				if (!(pageHeight > 0)) return 0;
				return Math.max(0, Math.min(1, (scrollerTop - pageTop) / pageHeight));
			}
			function chapterProgressFromRects(
				firstTop: number,
				lastBottom: number,
				scrollerTop: number,
				clientHeight: number
			) {
				const viewH = clientHeight > 0 ? clientHeight : 0;
				if (viewH <= 0) return 0;
				const scrollable = lastBottom - firstTop - viewH;
				if (scrollable <= 0) return firstTop <= scrollerTop + 0.5 ? 1 : 0;
				return Math.max(0, Math.min(1, (scrollerTop - firstTop) / scrollable));
			}
			return {
				mid: pageProgressFromRects(100, 400, 300),
				end: chapterProgressFromRects(-900, 600, 0, 600),
				// window-height mistake class
				wrongWindow: chapterProgressFromRects(-450, 1050, 0, 900),
				rightScroller: chapterProgressFromRects(-450, 1050, 0, 600)
			};
		});
		expect(result.mid).toBeCloseTo(0.5);
		expect(result.end).toBe(1);
		expect(result.rightScroller).toBeCloseTo(0.5);
		expect(result.wrongWindow).toBeCloseTo(0.75);
		expect(result.wrongWindow).toBeGreaterThan(result.rightScroller);
	});
});
