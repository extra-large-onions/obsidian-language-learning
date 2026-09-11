import { Editor } from 'obsidian';
import type LanguageLearningPlugin from '../main';
import { toggleChapterView } from '../chapter/toggle';
import { recordVoice } from './record-voice';
import { exportCurrent } from './export-current';
import { copyAnnotationPrompt } from './copy-prompt';
import { openCardsView } from './open-cards';
import { pruneReviews } from './prune-reviews';
import { rebuildIndex } from './rebuild-index';
import { writeIndexNote } from './write-index-note';
import { stampAllBlocks } from './stamp-ids';

export function registerCommands(plugin: LanguageLearningPlugin): void {
	plugin.addCommand({
		id: 'record-voice',
		name: 'Record voice',
		callback: () => recordVoice(plugin),
	});

	plugin.addCommand({
		id: 'export-current',
		name: 'Export current file with attachments',
		callback: () => void exportCurrent(plugin),
	});

	plugin.addCommand({
		id: 'copy-annotation-prompt',
		name: 'Copy annotation prompt for this sentence',
		editorCallback: (editor: Editor) =>
			void copyAnnotationPrompt(plugin, editor),
	});

	plugin.addCommand({
		id: 'open-cards',
		name: 'Open language cards',
		callback: () => void openCardsView(plugin),
	});

	plugin.addCommand({
		id: 'rebuild-index',
		name: 'Rebuild the card index',
		callback: () => void rebuildIndex(plugin),
	});

	plugin.addCommand({
		id: 'write-index-note',
		name: 'Write the card index to a note',
		callback: () => void writeIndexNote(plugin),
	});

	plugin.addCommand({
		id: 'stamp-block-ids',
		name: 'Give every block an ID',
		callback: () => void stampAllBlocks(plugin),
	});

	plugin.addCommand({
		id: 'prune-reviews',
		name: 'Remove review history for cards that are gone',
		callback: () => pruneReviews(plugin),
	});

	plugin.addCommand({
		id: 'toggle-chapter-view',
		name: 'Switch between the chapter reader and the editor',
		callback: () => void toggleChapterView(plugin),
	});
}
