import { App, Editor, MarkdownView, Notice, TFile } from 'obsidian';
import type LanguageLearningPlugin from '../main';
import { buildPrompt } from '../sentence/prompt';
import { SENTENCE_BLOCK_LANG } from '../utils/constants';
import { buildMovieBlock } from './reference';
import { Cue } from './subtitles';
import { makeThumbnail } from './thumbnail';
import { formatTime } from './time';

export interface MomentOptions {
	/** Make the thumbnail first, so the block shows it straight away. */
	thumbnail: boolean;
	/**
	 * Also open an empty sentence block under it, with the cursor inside,
	 * and copy the annotation prompt for the line - the model's reply is
	 * pasted straight in.
	 */
	study: boolean;
}

/**
 * The note being written in. The player takes focus when clicked, so this
 * is the last note in the main area, not whatever has focus.
 */
export function targetEditor(app: App): Editor | null {
	const view = app.workspace.getMostRecentLeaf()?.view;
	if (view instanceof MarkdownView) return view.editor;
	return app.workspace.activeEditor?.editor ?? null;
}

/**
 * Put a movie block for this moment at the cursor. With a subtitle line, the
 * block points at it by number and its text is read from the file; without
 * one, it holds the time alone.
 */
export async function insertMoment(
	plugin: LanguageLearningPlugin,
	movie: TFile,
	time: number,
	cue: Cue | null,
	options: MomentOptions,
): Promise<void> {
	const text = cue?.text ?? '';
	if (options.thumbnail) {
		const working = new Notice('Making the thumbnail…', 0);
		try {
			await makeThumbnail(plugin, movie, time, text);
		} catch (error) {
			console.error('Language learning: thumbnail failed', error);
			new Notice(`No thumbnail: ${error instanceof Error ? error.message : String(error)}`);
		} finally {
			working.hide();
		}
	}

	let block = buildMovieBlock({ file: movie.path, line: cue?.id ?? null, time, text: '' });
	const studyText = options.study ? text.replace(/\n/g, ' ').trim() : '';
	if (studyText !== '') block += `\n\`\`\`${SENTENCE_BLOCK_LANG}\n\n\`\`\`\n`;

	const editor = targetEditor(plugin.app);
	if (!editor) {
		await navigator.clipboard.writeText(block);
		new Notice('No note is open - the block is on the clipboard.');
		return;
	}

	const cursor = editor.getCursor();
	// A block needs lines of its own.
	const lead = editor.getLine(cursor.line).slice(0, cursor.ch).trim() === '' ? '' : '\n';
	const inserted = `${lead}${block}`;
	const at = editor.posToOffset(cursor);
	editor.replaceRange(inserted, cursor);

	if (studyText === '') {
		editor.setCursor(editor.offsetToPos(at + inserted.length));
		new Notice(`Inserted ${formatTime(time, false)}.`, 1500);
		return;
	}
	// Inside the empty sentence block: its last two lines are the blank and the fence.
	editor.setCursor(editor.offsetToPos(at + inserted.length - '\n```\n'.length));
	const { settings } = plugin;
	await navigator.clipboard.writeText(
		buildPrompt(studyText, settings.sentenceLanguage, settings.learnerLanguage),
	);
	new Notice('Inserted. The annotation prompt is on the clipboard - paste the reply into the block.');
}
