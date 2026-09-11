import {
	Editor,
	EditorPosition,
	EditorSuggest,
	EditorSuggestContext,
	EditorSuggestTriggerInfo,
	TFile,
	setIcon,
} from 'obsidian';
import type LanguageLearningPlugin from '../main';
import { recordVoice } from '../commands/record-voice';
import { exportCurrent } from '../commands/export-current';
import { copyAnnotationPrompt } from '../commands/copy-prompt';

/** An entry in the `/` menu. */
interface SlashItem {
	label: string;
	description: string;
	icon: string;
	/** Typed aliases that should surface this item. */
	keywords: string[];
	run: (plugin: LanguageLearningPlugin, editor: Editor) => void;
}

const ITEMS: SlashItem[] = [
	{
		label: 'Record voice',
		description: 'Record a take and embed it here',
		icon: 'mic',
		keywords: ['record', 'voice', 'audio', 'mic', 'speak'],
		run: (plugin) => recordVoice(plugin),
	},
	{
		label: 'Export with attachments',
		description: 'Bundle this file and everything it embeds',
		icon: 'package',
		keywords: ['export', 'bundle', 'pack', 'standalone', 'share'],
		run: (plugin) => void exportCurrent(plugin),
	},
	{
		label: 'Annotate sentence',
		description: 'Copy the prompt for the sentence on this line',
		icon: 'languages',
		keywords: ['annotate', 'sentence', 'korean', 'grammar', 'gloss'],
		run: (plugin, editor) => void copyAnnotationPrompt(plugin, editor),
	},
];

/** Matches a `/word` at the cursor that opens a word, not mid-token. */
const TRIGGER = /(?:^|\s)\/([\w-]*)$/;

/** Types `/record` in any editor to reach the same actions as the palette. */
export class SlashSuggest extends EditorSuggest<SlashItem> {
	private readonly plugin: LanguageLearningPlugin;

	constructor(plugin: LanguageLearningPlugin) {
		super(plugin.app);
		this.plugin = plugin;
	}

	onTrigger(
		cursor: EditorPosition,
		editor: Editor,
		_file: TFile | null,
	): EditorSuggestTriggerInfo | null {
		if (!this.plugin.settings.enableSlashCommands) return null;

		const line = editor.getLine(cursor.line).slice(0, cursor.ch);
		const match = TRIGGER.exec(line);
		if (!match) return null;

		const query = match[1] ?? '';
		// Offer nothing once the word has stopped matching anything.
		if (!ITEMS.some((item) => matches(item, query))) return null;

		return {
			start: { line: cursor.line, ch: cursor.ch - query.length - 1 },
			end: cursor,
			query,
		};
	}

	getSuggestions(context: EditorSuggestContext): SlashItem[] {
		return ITEMS.filter((item) => matches(item, context.query));
	}

	renderSuggestion(item: SlashItem, el: HTMLElement): void {
		el.addClass('ll-slash__item');
		setIcon(el.createSpan({ cls: 'll-slash__icon' }), item.icon);
		const text = el.createDiv({ cls: 'll-slash__text' });
		text.createDiv({ cls: 'll-slash__label', text: item.label });
		text.createDiv({ cls: 'll-slash__desc', text: item.description });
	}

	selectSuggestion(item: SlashItem): void {
		const context = this.context;
		if (!context) return;
		// Remove the typed `/query` before the action inserts anything.
		context.editor.replaceRange('', context.start, context.end);
		context.editor.setCursor(context.start);
		this.close();
		item.run(this.plugin, context.editor);
	}
}

function matches(item: SlashItem, query: string): boolean {
	if (query === '') return true;
	const needle = query.toLowerCase();
	return item.keywords.some((keyword) => keyword.startsWith(needle));
}
