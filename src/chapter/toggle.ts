import { MarkdownView, Notice, TFile, WorkspaceLeaf } from 'obsidian';
import type LanguageLearningPlugin from '../main';
import { isChapterFile } from './file';
import { CHAPTER_VIEW_TYPE } from '../utils/constants';

/** Marks the button we put on a markdown view, so it is only added once. */
const TOGGLE_CLASS = 'll-chapter-toggle';

/**
 * The file each pane was deliberately put into the editor for.
 *
 * A chapter is a markdown note, so Obsidian opens it in the editor and we
 * swap the reader in. That swap has to leave you alone once you have asked
 * for the editor - but only for the file you asked about, so opening another
 * chapter in the same pane opens the reader again.
 */
const editing = new WeakMap<WorkspaceLeaf, string>();

/**
 * Show `file` in the reader. `eState` picks the page: `{line}` for the page
 * holding a line, `{subpath: '#^id'}` for the page carrying that id.
 */
export async function showAsChapter(
	leaf: WorkspaceLeaf,
	file: TFile | null,
	eState?: Record<string, unknown>,
): Promise<void> {
	if (!file) return;
	editing.delete(leaf);
	await show(leaf, file, CHAPTER_VIEW_TYPE, {}, eState);
}

/** Show `file` in the normal markdown editor, pages and all. */
export async function showAsMarkdown(
	leaf: WorkspaceLeaf,
	file: TFile | null,
): Promise<void> {
	if (!file) return;
	editing.set(leaf, file.path);
	await show(leaf, file, 'markdown', { mode: 'source' });
}

async function show(
	leaf: WorkspaceLeaf,
	file: TFile,
	type: string,
	state: Record<string, unknown>,
	eState?: Record<string, unknown>,
): Promise<void> {
	try {
		await leaf.setViewState(
			{
				type,
				state: { file: file.path, ...state },
				active: true,
			},
			eState,
		);
	} catch (error) {
		console.error(error);
		new Notice('Could not switch this view.');
	}
}

/**
 * Open chapters in the reader, and keep a button on the editor to get back.
 *
 * Obsidian owns what a `.md` file opens in, so the reader is swapped in as
 * the file opens rather than registered as its view.
 */
export function registerChapterToggle(plugin: LanguageLearningPlugin): void {
	plugin.registerEvent(
		plugin.app.workspace.on('file-open', () => openInReader(plugin)),
	);

	const sync = () => syncButtons(plugin);
	plugin.registerEvent(plugin.app.workspace.on('layout-change', sync));
	plugin.registerEvent(plugin.app.workspace.on('file-open', sync));
	plugin.app.workspace.onLayoutReady(sync);
}

function openInReader(plugin: LanguageLearningPlugin): void {
	// A pane being restored is already how you left it, reader or editor.
	if (!plugin.app.workspace.layoutReady) return;

	const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
	if (!view || !isChapterFile(view.file)) return;
	// Leave the pane alone when the editor is what was asked for.
	if (editing.get(view.leaf) === view.file.path) return;
	void showAsChapter(view.leaf, view.file);
}

function syncButtons(plugin: LanguageLearningPlugin): void {
	for (const leaf of plugin.app.workspace.getLeavesOfType('markdown')) {
		const view = leaf.view;
		if (!(view instanceof MarkdownView)) continue;

		// A view is reused for other files, so a stale button is taken off.
		const existing = view.containerEl.querySelector(`.${TOGGLE_CLASS}`);
		if (!isChapterFile(view.file)) {
			existing?.remove();
			continue;
		}
		if (existing) continue;

		const button = view.addAction('book-open', 'Read as chapter', () => {
			void showAsChapter(leaf, view.file);
		});
		button.addClass(TOGGLE_CLASS);
	}
}
