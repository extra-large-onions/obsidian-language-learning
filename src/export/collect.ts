import { App, TFile } from 'obsidian';
import { findRefs } from './scan';
import { parseCanvas } from './canvas';

/** Everything one file needs in order to stand on its own. */
export interface Collected {
	root: TFile;
	/** Notes and canvases pulled in, not including the root. */
	notes: TFile[];
	attachments: TFile[];
	/** Link targets that resolved to nothing. */
	missing: string[];
	/** Total size of the attachments, in bytes. */
	bytes: number;
}

/** True for files whose contents we in turn scan for more dependencies. */
export function isDocument(file: TFile): boolean {
	return file.extension === 'md' || file.extension === 'canvas';
}

/**
 * Walk what `root` embeds, and what those embed, until nothing new turns up.
 * Only embeds are followed - a plain `[[link]]` to another note is left
 * alone, since following those would drag in most of a vault.
 */
export async function collectDependencies(
	app: App,
	root: TFile,
): Promise<Collected> {
	const visited = new Set<string>([root.path]);
	const queue: TFile[] = [root];
	const notes: TFile[] = [];
	const attachments: TFile[] = [];
	const missing = new Set<string>();

	while (queue.length > 0) {
		const file = queue.shift();
		if (!file) break;
		for (const target of await referencesOf(app, file)) {
			const resolved = resolveTarget(app, target, file.path);
			if (!resolved) {
				missing.add(target);
				continue;
			}
			if (visited.has(resolved.path)) continue;
			visited.add(resolved.path);
			if (isDocument(resolved)) {
				notes.push(resolved);
				queue.push(resolved);
			} else {
				attachments.push(resolved);
			}
		}
	}

	const bytes = attachments.reduce((sum, file) => sum + file.stat.size, 0);
	return { root, notes, attachments, missing: [...missing], bytes };
}

/** Link targets referenced by one file. */
export async function referencesOf(app: App, file: TFile): Promise<string[]> {
	const text = await app.vault.cachedRead(file);
	if (file.extension !== 'canvas') {
		return findRefs(text).map((ref) => ref.target);
	}

	const canvas = parseCanvas(text);
	if (!canvas) return [];

	const targets: string[] = [];
	for (const node of canvas.nodes ?? []) {
		if (typeof node.file === 'string' && node.file !== '') {
			targets.push(node.file);
		}
		if (typeof node.text === 'string') {
			targets.push(...findRefs(node.text).map((ref) => ref.target));
		}
	}
	return targets;
}

/**
 * Resolve a link target. Canvas nodes store vault-absolute paths while
 * markdown links are usually just a name, so try both.
 */
export function resolveTarget(
	app: App,
	target: string,
	sourcePath: string,
): TFile | null {
	const direct = app.vault.getFileByPath(target);
	if (direct) return direct;
	return app.metadataCache.getFirstLinkpathDest(target, sourcePath);
}
