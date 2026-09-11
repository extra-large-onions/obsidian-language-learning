import { Notice } from 'obsidian';
import type LanguageLearningPlugin from '../main';
import { collectDependencies, isDocument } from '../export/collect';
import { ExportModal } from '../export/export-modal';

/** Bundle the active note or canvas with everything it embeds. */
export async function exportCurrent(
	plugin: LanguageLearningPlugin,
): Promise<void> {
	const file = plugin.app.workspace.getActiveFile();
	if (!file) {
		new Notice('Open a note or canvas first.');
		return;
	}
	if (!isDocument(file)) {
		new Notice('Only notes and canvases can be exported.');
		return;
	}

	const collected = await collectDependencies(plugin.app, file);
	new ExportModal(plugin, file, collected).open();
}
