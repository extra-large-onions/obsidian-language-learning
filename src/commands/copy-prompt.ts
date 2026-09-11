import { Editor, Notice } from 'obsidian';
import type LanguageLearningPlugin from '../main';
import { buildPrompt } from '../sentence/prompt';

/**
 * Put the annotation prompt on the clipboard, with the selected sentence in
 * it. The reply from the model is pasted back into a code block.
 */
export async function copyAnnotationPrompt(
	plugin: LanguageLearningPlugin,
	editor: Editor,
): Promise<void> {
	const selection = editor.getSelection().trim();
	const sentence = selection || editor.getLine(editor.getCursor().line).trim();
	if (sentence === '') {
		new Notice('Select a sentence first.');
		return;
	}

	const { settings } = plugin;
	const prompt = buildPrompt(
		sentence,
		settings.sentenceLanguage,
		settings.learnerLanguage,
	);
	await navigator.clipboard.writeText(prompt);
	new Notice('Prompt copied. Paste it into your model.');
}
