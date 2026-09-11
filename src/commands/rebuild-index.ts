import { Notice } from 'obsidian';
import type LanguageLearningPlugin from '../main';

/** Read the whole vault again, for when the index looks wrong. */
export async function rebuildIndex(
	plugin: LanguageLearningPlugin,
): Promise<void> {
	new Notice('Reading your vault...');
	await plugin.index.rebuild();

	const cards = plugin.index.allCards().length;
	const words = plugin.index.allWords().length;
	new Notice(
		`Indexed ${cards} card${cards === 1 ? '' : 's'} and ${words} word${words === 1 ? '' : 's'}.`,
	);
}
