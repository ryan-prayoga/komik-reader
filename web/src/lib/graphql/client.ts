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

export async function gql<T>(
	query: string,
	variables?: Record<string, unknown>
): Promise<T> {
	const res = await fetch(GRAPHQL_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ query, variables })
	});

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