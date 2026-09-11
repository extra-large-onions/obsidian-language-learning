import type LanguageLearningPlugin from '../main';
import { CARDS_VIEW_TYPE } from '../review/cards-view';

/** Show the card list, reusing the leaf it is already open in. */
export async function openCardsView(
	plugin: LanguageLearningPlugin,
): Promise<void> {
	const { workspace } = plugin.app;
	// A leaf whose pane has left the page is a leftover. Revealing one shows
	// an empty tab, and taking it for the open view means a new one is never
	// made, so the list could never be opened again.
	const existing = workspace
		.getLeavesOfType(CARDS_VIEW_TYPE)
		.find((leaf) => leaf.view.containerEl.isConnected);
	const leaf = existing ?? workspace.getRightLeaf(false);
	if (!leaf) return;

	if (!existing) {
		await leaf.setViewState({ type: CARDS_VIEW_TYPE, active: true });
	}
	await workspace.revealLeaf(leaf);
}
