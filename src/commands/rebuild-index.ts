import { Notice } from 'obsidian';
import type LanguageLearningPlugin from '../main';
import { isChapterFile } from '../chapter/file';
import { INDEX_NOTE_PATH, syncIndexNote } from '../review/index-note';
import { Named, namePages, newPageId } from '../review/page-card';

/**
 * Read the whole vault again, and write what it found.
 *
 * Three things that belong together: every page gets an id, the index is
 * built from scratch, and the index note is brought up to date. It is the one
 * thing to run when anything looks out of step.
 */
export async function rebuildIndex(
	plugin: LanguageLearningPlugin,
): Promise<void> {
	new Notice('Reading your vault...');
	const pages = await nameEveryPage(plugin);
	await plugin.index.rebuild();

	const cards = plugin.index.allCards().length;
	const words = plugin.index.allWords().length;
	const note = await syncIndexNote(plugin);

	new Notice(
		`${count(cards, 'card')}, ${count(words, 'word')}` +
			(pages > 0 ? `, ${count(pages, 'page')} named` : '') +
			(note ? `. ${INDEX_NOTE_PATH} written.` : '.'),
	);
}

/**
 * Give every page in every chapter an id.
 *
 * A page is named the first time it is read, so this is for the rest: pages
 * you want to link to before you have reviewed them.
 */
async function nameEveryPage(plugin: LanguageLearningPlugin): Promise<number> {
	const { vault } = plugin.app;
	let pages = 0;

	for (const file of vault.getMarkdownFiles()) {
		if (!isChapterFile(file)) continue;
		const text = await vault.cachedRead(file);
		if (namePages(text, () => 'x').named.length === 0) continue;

		// Read again inside process, because the file may have changed since.
		let named: Named[] = [];
		await vault.process(file, (data) => {
			const result = namePages(data, () => newPageId());
			named = result.named;
			return result.text;
		});
		for (const { from, to } of named) plugin.reviews.rename(from, to);
		pages += named.length;
	}
	return pages;
}

function count(value: number, noun: string): string {
	return `${value} ${noun}${value === 1 ? '' : 's'}`;
}
