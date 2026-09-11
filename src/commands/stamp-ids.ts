import { Notice } from 'obsidian';
import type LanguageLearningPlugin from '../main';
import { newBlockId, readBlockId, withBlockId } from '../utils/block-id';
import { SENTENCE_BLOCK_LANG } from '../utils/constants';
import { findFences } from '../utils/fences';

const LANGS = new Set([SENTENCE_BLOCK_LANG]);

/**
 * Give every block in the vault an id.
 *
 * A block is named as it is drawn, so this is for the notes you have not
 * opened yet: a vault written before ids existed, or one you would rather
 * stamp in one go than a note at a time.
 */
export async function stampAllBlocks(
	plugin: LanguageLearningPlugin,
): Promise<void> {
	const { vault } = plugin.app;
	let blocks = 0;
	let notes = 0;

	for (const file of vault.getMarkdownFiles()) {
		const text = await vault.cachedRead(file);
		if (stampBlocks(text).count === 0) continue;

		// Read again inside process, because the file may have changed since.
		let written = 0;
		await vault.process(file, (data) => {
			const result = stampBlocks(data);
			written = result.count;
			return result.text;
		});
		if (written > 0) {
			blocks += written;
			notes++;
		}
	}

	new Notice(
		blocks === 0
			? 'Every block already has an id.'
			: `Named ${blocks} block${blocks === 1 ? '' : 's'} in ${notes} note${notes === 1 ? '' : 's'}.`,
	);
}

/** Put an id on every unnamed block in one file's text. */
export function stampBlocks(text: string): { text: string; count: number } {
	let out = text;
	let count = 0;

	// Last block first, so the offsets of the ones before it stay true.
	const fences = findFences(text).sort((a, b) => b.bodyStart - a.bodyStart);
	for (const fence of fences) {
		if (!LANGS.has(fence.lang)) continue;

		const body = text.slice(fence.bodyStart, fence.bodyEnd);
		if (body.trim() === '' || readBlockId(body) !== null) continue;

		const updated = withBlockId(body, newBlockId());
		if (updated === null) continue;
		out = out.slice(0, fence.bodyStart) + updated + out.slice(fence.bodyEnd);
		count++;
	}
	return { text: out, count };
}
