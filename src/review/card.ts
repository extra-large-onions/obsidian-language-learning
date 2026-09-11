import { App, MarkdownPostProcessorContext, TFile } from 'obsidian';
import { ParsedSentence } from '../sentence/parse';
import { withBlockId } from '../utils/block-id';
import { hashString } from '../utils/helpers';

/**
 * What a card's review history and its place in the word index are filed
 * under.
 *
 * A card is one sentence, named after the block it lives in: the block's id,
 * and which sentence of the block it is. The first sentence takes the block's
 * id as it stands, because a block usually holds one.
 *
 * Until a block has an id the card falls back to the hash of its text, so an
 * unnamed block still reviews - it just forgets its history when the sentence
 * is edited. An `id` inside the JSON, which older blocks may carry, wins over
 * both.
 */
export function cardId(
	sentence: ParsedSentence,
	blockId: string | null,
	index: number,
): string {
	if (sentence.id) return sentence.id;
	if (blockId) return index === 0 ? blockId : `${blockId}#${index}`;
	return hashString(sentence.text);
}

/** The opening fence of a block of the given language. */
function fenceOf(lang: string): RegExp {
	return new RegExp(`^[ \\t]*(?:\`{3,}|~{3,})[ \\t]*${lang}\\b`);
}

/**
 * Write an id onto a block, once.
 *
 * Returns false when there is nowhere safe to write - a canvas card has no
 * lines of its own, and a block that has moved since it was drawn is left
 * alone. The block still works unnamed, so nothing here is worth an error.
 */
export async function stampBlock(
	app: App,
	ctx: MarkdownPostProcessorContext,
	el: HTMLElement,
	lang: string,
	id: string,
): Promise<boolean> {
	const section = ctx.getSectionInfo(el);
	if (!section) return false;

	const file = app.vault.getAbstractFileByPath(ctx.sourcePath);
	if (!(file instanceof TFile) || file.extension !== 'md') return false;

	let written = false;
	await app.vault.process(file, (data) => {
		const lines = data.split('\n');
		if (!fenceOf(lang).test(lines[section.lineStart] ?? '')) return data;

		// +1 skips the opening fence; lineEnd is the closing one.
		const first = section.lineStart + 1;
		const body = lines.slice(first, section.lineEnd).join('\n');
		const updated = withBlockId(body, id);
		if (updated === null) return data;

		lines.splice(first, section.lineEnd - first, ...updated.split('\n'));
		written = true;
		return lines.join('\n');
	});
	return written;
}
