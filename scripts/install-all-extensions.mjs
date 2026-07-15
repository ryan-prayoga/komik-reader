#!/usr/bin/env node
/**
 * Bulk-install every uninstalled Suwayomi extension (server-wide).
 * Usage: node scripts/install-all-extensions.mjs [SUWAYOMI_URL]
 */
const URL = process.argv[2] || process.env.SUWAYOMI_URL || 'http://127.0.0.1:4567';
const GQL = `${URL.replace(/\/$/, '')}/api/graphql`;
const BATCH = 25;
const PAUSE_MS = 400;

async function gql(query, variables) {
	const res = await fetch(GQL, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ query, variables })
	});
	const json = await res.json();
	if (json.errors?.length) {
		throw new Error(json.errors.map((e) => e.message).join('; '));
	}
	return json.data;
}

function sleep(ms) {
	return new Promise((r) => setTimeout(r, ms));
}

async function listPending() {
	const data = await gql(`{
		extensions {
			nodes { pkgName isInstalled name lang }
		}
	}`);
	const nodes = data.extensions?.nodes ?? [];
	return {
		total: nodes.length,
		pending: nodes.filter((n) => !n.isInstalled).map((n) => n.pkgName),
		installed: nodes.filter((n) => n.isInstalled).length
	};
}

async function installBatch(ids) {
	const data = await gql(
		`mutation($ids: [String!]!) {
			updateExtensions(input: { ids: $ids, patch: { install: true } }) {
				extensions { pkgName isInstalled }
			}
		}`,
		{ ids }
	);
	const exts = data.updateExtensions?.extensions ?? [];
	return {
		ok: exts.filter((e) => e.isInstalled).length,
		fail: exts.filter((e) => !e.isInstalled).length
	};
}

async function main() {
	console.log(`Suwayomi: ${URL}`);
	console.log('Refreshing extension catalog…');
	try {
		await gql(`mutation { fetchExtensions(input: {}) { extensions { pkgName } } }`);
	} catch (e) {
		console.warn('fetchExtensions:', e.message);
	}

	let { total, pending, installed } = await listPending();
	console.log(`Catalog: ${total} | already installed: ${installed} | pending: ${pending.length}`);
	if (!pending.length) {
		console.log('Nothing to install.');
		return;
	}

	const start = Date.now();
	let done = 0;
	let okTotal = 0;
	let failTotal = 0;

	for (let i = 0; i < pending.length; i += BATCH) {
		const chunk = pending.slice(i, i + BATCH);
		const n = Math.floor(i / BATCH) + 1;
		const batches = Math.ceil(pending.length / BATCH);
		process.stdout.write(`[${n}/${batches}] install ${chunk.length}… `);
		try {
			const r = await installBatch(chunk);
			okTotal += r.ok;
			failTotal += r.fail;
			done += chunk.length;
			console.log(`ok=${r.ok} fail=${r.fail}  progress ${done}/${pending.length}`);
		} catch (e) {
			failTotal += chunk.length;
			done += chunk.length;
			console.log(`ERROR: ${e.message}`);
			// retry one-by-one for this chunk
			for (const id of chunk) {
				try {
					await gql(
						`mutation($id: String!) {
							updateExtension(input: { id: $id, patch: { install: true } }) {
								extension { pkgName isInstalled }
							}
						}`,
						{ id }
					);
					okTotal += 1;
					failTotal -= 1;
					process.stdout.write('.');
				} catch (err) {
					process.stdout.write('x');
				}
				await sleep(150);
			}
			console.log('');
		}
		await sleep(PAUSE_MS);
	}

	const final = await listPending();
	const sec = ((Date.now() - start) / 1000).toFixed(1);
	console.log('---');
	console.log(`Done in ${sec}s`);
	console.log(`Installed now: ${final.installed}/${final.total} (still pending: ${final.pending.length})`);
	console.log(`Batch stats: ok~${okTotal} fail~${failTotal}`);
	try {
		const { execSync } = await import('node:child_process');
		const du = execSync(
			'docker exec komik-reader-suwayomi du -sh /home/suwayomi/.local/share/Tachidesk/extensions 2>/dev/null || du -sh suwayomi/data/extensions 2>/dev/null',
			{ encoding: 'utf8', cwd: new URL('..', import.meta.url).pathname }
		);
		console.log(`Extensions disk: ${du.trim()}`);
	} catch {
		/* ignore */
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
