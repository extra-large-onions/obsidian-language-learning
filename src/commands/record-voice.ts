import { Editor, EditorPosition, Notice } from 'obsidian';
import type LanguageLearningPlugin from '../main';
import { RecordModal } from '../audio/record-modal';
import { embedLink, saveRecording } from '../audio/save';

/**
 * Record a take and drop an embed where the cursor was. With no editor open -
 * from a canvas, say - the file is still saved and its link copied, so it can
 * be pasted into a card.
 */
export function recordVoice(plugin: LanguageLearningPlugin): void {
	const editor = plugin.app.workspace.activeEditor?.editor ?? null;
	// Remember where the cursor was: the modal takes focus away from it.
	const at: EditorPosition | null = editor ? editor.getCursor() : null;
	const sourcePath = plugin.app.workspace.getActiveFile()?.path ?? '';

	new RecordModal(plugin.app, async (recording) => {
		try {
			const file = await saveRecording(
				plugin.app,
				recording,
				plugin.settings.recordingPrefix,
				sourcePath,
			);
			const link = embedLink(plugin.app, file, sourcePath);
			await deliver(link, editor, at);
		} catch (error) {
			console.error('Language learning: could not save recording', error);
			new Notice('Could not save the recording.');
		}
	}).open();
}

async function deliver(
	link: string,
	editor: Editor | null,
	at: EditorPosition | null,
): Promise<void> {
	if (editor && at) {
		editor.replaceRange(`${link}\n`, at);
		editor.setCursor({ line: at.line + 1, ch: 0 });
		new Notice('Recording inserted.');
		return;
	}
	await navigator.clipboard.writeText(link);
	new Notice('Recording saved. Link copied - paste it into your card.');
}
