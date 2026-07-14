import { beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'komik-reader-pending-progress';

const updateChapterProgress = vi.fn<
	(chapterId: number, lastPageRead: number, isRead: boolean) => Promise<void>
>();

vi.mock('$app/environment', () => ({ browser: true }));

vi.mock('./api', () => ({
	updateChapterProgress: (...args: [number, number, boolean]) => updateChapterProgress(...args)
}));

function memoryLocalStorage(): Storage {
	const map = new Map<string, string>();
	return {
		get length() {
			return map.size;
		},
		clear() {
			map.clear();
		},
		getItem(key: string) {
			return map.has(key) ? (map.get(key) ?? null) : null;
		},
		key(index: number) {
			return [...map.keys()][index] ?? null;
		},
		removeItem(key: string) {
			map.delete(key);
		},
		setItem(key: string, value: string) {
			map.set(key, value);
		}
	};
}

function readStoredQueue(): Record<
	string,
	{ chapterId: number; lastPageRead: number; isRead: boolean }
> {
	const raw = localStorage.getItem(STORAGE_KEY);
	if (!raw) return {};
	return JSON.parse(raw) as Record<
		string,
		{ chapterId: number; lastPageRead: number; isRead: boolean }
	>;
}

function seedQueue(
	entries: Record<string, { chapterId: number; lastPageRead: number; isRead: boolean }>
) {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

describe('progress-queue', () => {
	beforeEach(() => {
		vi.resetModules();
		updateChapterProgress.mockReset();
		Object.defineProperty(globalThis, 'localStorage', {
			value: memoryLocalStorage(),
			configurable: true,
			writable: true
		});
	});

	async function loadQueue() {
		return import('./progress-queue');
	}

	async function authError(message: string): Promise<Error> {
		const { GraphqlError } = await import('./client');
		return new GraphqlError(message);
	}

	describe('queueChapterProgress', () => {
		it('does not write localStorage when update succeeds and queue was empty', async () => {
			updateChapterProgress.mockResolvedValue(undefined);
			const { queueChapterProgress } = await loadQueue();

			await queueChapterProgress(10, 3, false);

			expect(updateChapterProgress).toHaveBeenCalledWith(10, 3, false);
			expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
		});

		it('clears the chapter entry from localStorage after a successful write', async () => {
			seedQueue({
				'10': { chapterId: 10, lastPageRead: 1, isRead: false },
				'20': { chapterId: 20, lastPageRead: 5, isRead: true }
			});
			updateChapterProgress.mockResolvedValue(undefined);
			const { queueChapterProgress } = await loadQueue();

			await queueChapterProgress(10, 4, false);

			const queue = readStoredQueue();
			expect(queue['10']).toBeUndefined();
			expect(queue['20']).toEqual({ chapterId: 20, lastPageRead: 5, isRead: true });
		});

		it('enqueues the latest attempt when the network/update fails (non-auth)', async () => {
			updateChapterProgress.mockRejectedValue(new Error('network down'));
			const { queueChapterProgress } = await loadQueue();

			await queueChapterProgress(42, 7, false);
			await queueChapterProgress(42, 9, true);

			const queue = readStoredQueue();
			expect(queue['42']).toEqual({ chapterId: 42, lastPageRead: 9, isRead: true });
			expect(updateChapterProgress).toHaveBeenCalledTimes(2);
		});

		it('does not enqueue on HTTP 401 auth errors', async () => {
			updateChapterProgress.mockRejectedValue(await authError('HTTP 401: Unauthorized'));
			const { queueChapterProgress } = await loadQueue();

			await queueChapterProgress(1, 2, false);

			expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
		});

		it('does not enqueue on HTTP 403 auth errors', async () => {
			updateChapterProgress.mockRejectedValue(await authError('HTTP 403: Forbidden'));
			const { queueChapterProgress } = await loadQueue();

			await queueChapterProgress(1, 2, false);

			expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
		});

		it('still enqueues plain GraphqlError that is not 401/403', async () => {
			updateChapterProgress.mockRejectedValue(
				await authError('HTTP 500: Internal Server Error')
			);
			const { queueChapterProgress } = await loadQueue();

			await queueChapterProgress(3, 1, false);

			expect(readStoredQueue()['3']).toEqual({
				chapterId: 3,
				lastPageRead: 1,
				isRead: false
			});
		});
	});

	describe('replayQueuedProgress', () => {
		it('no-ops when the queue is empty', async () => {
			const { replayQueuedProgress } = await loadQueue();

			await replayQueuedProgress();

			expect(updateChapterProgress).not.toHaveBeenCalled();
		});

		it('replays pending entries and clears each on success', async () => {
			seedQueue({
				'10': { chapterId: 10, lastPageRead: 4, isRead: false },
				'20': { chapterId: 20, lastPageRead: 0, isRead: true }
			});
			updateChapterProgress.mockResolvedValue(undefined);
			const { replayQueuedProgress } = await loadQueue();

			await replayQueuedProgress();

			expect(updateChapterProgress).toHaveBeenCalledTimes(2);
			expect(updateChapterProgress).toHaveBeenCalledWith(10, 4, false);
			expect(updateChapterProgress).toHaveBeenCalledWith(20, 0, true);
			expect(readStoredQueue()).toEqual({});
		});

		it('drops an entry on 401 during replay instead of leaving it queued', async () => {
			seedQueue({
				'10': { chapterId: 10, lastPageRead: 1, isRead: false }
			});
			updateChapterProgress.mockRejectedValue(await authError('HTTP 401: Unauthorized'));
			const { replayQueuedProgress } = await loadQueue();

			await replayQueuedProgress();

			expect(updateChapterProgress).toHaveBeenCalledWith(10, 1, false);
			expect(readStoredQueue()).toEqual({});
		});

		it('drops an entry on 403 during replay', async () => {
			seedQueue({
				'11': { chapterId: 11, lastPageRead: 2, isRead: true }
			});
			updateChapterProgress.mockRejectedValue(await authError('HTTP 403: Forbidden'));
			const { replayQueuedProgress } = await loadQueue();

			await replayQueuedProgress();

			expect(readStoredQueue()).toEqual({});
		});

		it('keeps the entry queued when replay hits a non-auth failure', async () => {
			seedQueue({
				'10': { chapterId: 10, lastPageRead: 8, isRead: false }
			});
			updateChapterProgress.mockRejectedValue(new Error('offline'));
			const { replayQueuedProgress } = await loadQueue();

			await replayQueuedProgress();

			expect(readStoredQueue()['10']).toEqual({
				chapterId: 10,
				lastPageRead: 8,
				isRead: false
			});
		});

		it('clears only the successes when mixed auth-drop and success', async () => {
			seedQueue({
				'10': { chapterId: 10, lastPageRead: 1, isRead: false },
				'20': { chapterId: 20, lastPageRead: 2, isRead: false },
				'30': { chapterId: 30, lastPageRead: 3, isRead: false }
			});
			updateChapterProgress
				.mockResolvedValueOnce(undefined)
				.mockRejectedValueOnce(await authError('HTTP 401: Unauthorized'))
				.mockRejectedValueOnce(new Error('timeout'));
			const { replayQueuedProgress } = await loadQueue();

			await replayQueuedProgress();

			const queue = readStoredQueue();
			expect(queue['10']).toBeUndefined();
			expect(queue['20']).toBeUndefined();
			expect(queue['30']).toEqual({ chapterId: 30, lastPageRead: 3, isRead: false });
		});
	});
});

