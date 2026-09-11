import { Notice } from 'obsidian';
import type LanguageLearningPlugin from '../main';

/**
 * Drop the review history of cards that are no longer in the vault.
 *
 * History is kept by card, so a sentence edited before it was ever checked
 * leaves its old record behind. This clears those. It waits for the index,
 * because a vault still being read looks exactly like a vault with nothing
 * in it, and that would throw away everything.
 */
export function pruneReviews(plugin: LanguageLearningPlugin): void {
	if (!plugin.index.ready) {
		new Notice('Still reading your vault. Try again in a moment.');
		return;
	}

	const gone = plugin.index.orphans(Object.keys(plugin.reviews.all()));
	if (gone.length === 0) {
		new Notice('Every card in your history is still in the vault.');
		return;
	}

	for (const id of gone) plugin.reviews.remove(id);
	new Notice(
		`Removed ${gone.length} card${gone.length === 1 ? '' : 's'} from your review history.`,
	);
}
