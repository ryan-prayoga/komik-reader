const GRAPHQL_URL = '/api/graphql';

export class GraphqlError extends Error {
	constructor(
		message: string,
		public errors?: { message: string }[]
	) {
		super(message);
		this.name = 'GraphqlError';
	}
}

// Upstream sources can be slow or hang; without a ceiling a single stuck fetch
// leaves the reader/browse spinner forever. 30s is generous for a scrape.
const GRAPHQL_TIMEOUT_MS = 30_000;

export async function gql<T>(
	query: string,
	variables?: Record<string, unknown>
): Promise<T> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), GRAPHQL_TIMEOUT_MS);

	let res: Response;
	try {
		res = await fetch(GRAPHQL_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ query, variables }),
			signal: controller.signal
		});
	} catch (e) {
		if (e instanceof DOMException && e.name === 'AbortError') {
			throw new GraphqlError('Request timeout — server terlalu lama merespons');
		}
		throw e;
	} finally {
		clearTimeout(timer);
	}

	if (!res.ok) {
		throw new GraphqlError(`HTTP ${res.status}: ${res.statusText}`);
	}

	const json = (await res.json()) as {
		data?: T;
		errors?: { message: string }[];
	};

	if (json.errors?.length) {
		throw new GraphqlError(json.errors.map((e) => e.message).join(', '), json.errors);
	}

	if (!json.data) {
		throw new GraphqlError('No data returned from GraphQL');
	}

	return json.data;
}

export function apiUrl(path: string): string {
	if (path.startsWith('http')) return path;
	return path.startsWith('/') ? path : `/${path}`;
}