import { Notice, TFile, WorkspaceLeaf, normalizePath } from 'obsidian';
import type LanguageLearningPlugin from '../main';
import { CANVAS_PATH, buildCardCanvas } from '../review/canvas';

/**
 * Lay the cards out on a canvas, and throw it away again.
 *
 * The canvas is built from scratch every time it is asked for, so it is never
 * out of date, and it is deleted once the tab it was opened in has gone, so
 * the vault does not fill up with stale copies of itself. Anything worth
 * keeping can be copied into a canvas of your own before you close it.
 *
 * The one rule here: the file is never taken away while something is still
 * showing it. A canvas whose file has been deleted under it draws as an empty
 * canvas, which looks exactly like the plugin failing to build one.
 */

/** The tab the canvas was opened in, while it is still open. */
let opened: WorkspaceLeaf | null = null;

export async function openCardCanvas(
	plugin: LanguageLearningPlugin,
): Promise<void> {
	if (!plugin.index.ready) {
		new Notice('The card index is still being built.');
		return;
	}

	await plugin.index.refresh(true);
	const { json, count } = await buildCardCanvas(plugin);
	if (count === 0) {
		new Notice('No cards yet. Pages of a .chapter.md note become cards.');
		return;
	}

	const file = await write(plugin, json);
	const leaf = plugin.app.workspace.getLeaf('tab');
	await leaf.openFile(file);
	// Only now, with the file open: making the tab fires a layout change of
	// its own, and a canvas that is not open yet must not count as closed.
	opened = leaf;
	await plugin.app.workspace.revealLeaf(leaf);
	new Notice(`${count} card${count === 1 ? '' : 's'}, most overdue first.`);
}

async function write(
	plugin: LanguageLearningPlugin,
	text: string,
): Promise<TFile> {
	const { vault } = plugin.app;
	const path = normalizePath(CANVAS_PATH);
	const existing = vault.getAbstractFileByPath(path);
	if (existing instanceof TFile) {
		await vault.modify(existing, text);
		return existing;
	}
	return vault.create(path, text);
}

/* -------------------------------------------------------------- clearing --- */

/**
 * Take the canvas away once it is no longer open: when its tab closes, when
 * the plugin unloads, and once at startup for a canvas left behind by an
 * Obsidian that closed before the delete went through.
 */
export function registerCardCanvas(plugin: LanguageLearningPlugin): void {
	plugin.app.workspace.onLayoutReady(() => void closeAndRemove(plugin));
	plugin.registerEvent(
		plugin.app.workspace.on('layout-change', () => {
			// The tab we opened, by identity - not by what any tab is showing,
			// which is not yet the canvas at the moment the tab is made.
			if (!opened || isOpen(plugin, opened)) return;
			opened = null;
			void remove(plugin);
		}),
	);
	plugin.register(() => {
		opened = null;
		void closeAndRemove(plugin);
	});
}

/** Close whatever is showing the canvas, then delete it. */
async function closeAndRemove(plugin: LanguageLearningPlugin): Promise<void> {
	for (const leaf of showingCanvas(plugin)) leaf.detach();
	await remove(plugin);
}

async function remove(plugin: LanguageLearningPlugin): Promise<void> {
	const file = plugin.app.vault.getAbstractFileByPath(normalizePath(CANVAS_PATH));
	if (!(file instanceof TFile)) return;
	// Wherever the vault sends deleted files, rather than straight out, since
	// that is the user's choice to make and not this plugin's.
	await plugin.app.fileManager.trashFile(file);
}

/** Whether that exact tab is still part of the workspace. */
function isOpen(
	plugin: LanguageLearningPlugin,
	leaf: WorkspaceLeaf,
): boolean {
	let found = false;
	plugin.app.workspace.iterateAllLeaves((one) => {
		if (one === leaf) found = true;
	});
	return found;
}

/** Any tab showing the canvas file, however it came to be open. */
function showingCanvas(plugin: LanguageLearningPlugin): WorkspaceLeaf[] {
	const path = normalizePath(CANVAS_PATH);
	const found: WorkspaceLeaf[] = [];
	plugin.app.workspace.iterateAllLeaves((leaf) => {
		if (leaf.getViewState().state?.['file'] === path) found.push(leaf);
	});
	return found;
}
